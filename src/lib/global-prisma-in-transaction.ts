import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

/**
 * Análise ESTÁTICA: cliente `prisma` GLOBAL dentro de `prisma.$transaction`
 * (2026-11-10). Complementa a trava em tempo de execução de src/lib/prisma.ts:
 * aquela só pega o caminho que algum teste exercita; esta varre o código todo.
 *
 * Acusa, dentro de cada callback passado a `prisma.$transaction(...)`:
 *   - uso direto do identificador `prisma` (consulta, `$queryRaw`,
 *     `$transaction` aninhado...);
 *   - `prisma` passado como cliente a uma função (`getRule(prisma, ...)`);
 *   - chamada a uma função de src/ que usa o `prisma` global, direta ou
 *     indiretamente (fecho transitivo pelo nome da função).
 * Resolução por nome de função (não por tipo): simples e conservadora — um
 * falso positivo aparece como violação a explicar, nunca passa calado.
 */
export type Violation = { file: string; line: number; detail: string };

type FnInfo = { file: string; usesGlobal: boolean; callees: Set<string> };

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return entry === "generated" ? [] : listFiles(full);
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

function isGlobalPrisma(node: ts.Node): boolean {
  return ts.isIdentifier(node) && node.text === "prisma";
}

function calleeName(call: ts.CallExpression): string | null {
  const expr = call.expression;
  if (ts.isIdentifier(expr)) return expr.text;
  return null;
}

/** Callbacks passados a `prisma.$transaction(...)`. */
function isTransactionCallback(node: ts.Node): boolean {
  const parent = node.parent;
  if (!parent || !ts.isCallExpression(parent) || parent.arguments[0] !== node) return false;
  if (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node)) return false;
  const expr = parent.expression;
  return ts.isPropertyAccessExpression(expr) && expr.name.text === "$transaction" && isGlobalPrisma(expr.expression);
}

function functionName(node: ts.Node): string | null {
  if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;
  if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
    return node.parent.name.text;
  }
  return null;
}

export function findGlobalPrismaInTransactions(srcRoot: string): Violation[] {
  const files = listFiles(srcRoot).filter((f) => !f.endsWith(path.join("lib", "prisma.ts")) && !f.endsWith("global-prisma-in-transaction.ts"));
  const sources = files.map((file) => ({ file, sf: ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true) }));

  // 1) Cada função nomeada: usa `prisma` global? quem ela chama?
  const fns = new Map<string, FnInfo[]>();
  for (const { file, sf } of sources) {
    const visitFn = (fnNode: ts.Node, name: string) => {
      const info: FnInfo = { file, usesGlobal: false, callees: new Set() };
      const walk = (n: ts.Node) => {
        if (n !== fnNode && functionName(n)) return; // função nomeada aninhada: conta à parte
        if (ts.isPropertyAccessExpression(n) && isGlobalPrisma(n.expression)) info.usesGlobal = true;
        if (ts.isCallExpression(n)) {
          const c = calleeName(n);
          if (c) info.callees.add(c);
        }
        ts.forEachChild(n, walk);
      };
      walk(fnNode);
      fns.set(name, [...(fns.get(name) ?? []), info]);
    };
    const find = (n: ts.Node) => {
      const name = functionName(n);
      if (name) visitFn(n, name);
      ts.forEachChild(n, find);
    };
    find(sf);
  }

  // 2) Fecho transitivo: função "usa global" se ela ou algo que ela chama usa.
  const memo = new Map<string, boolean>();
  const usesGlobal = (name: string, stack = new Set<string>()): boolean => {
    if (memo.has(name)) return memo.get(name)!;
    if (stack.has(name)) return false;
    stack.add(name);
    const infos = fns.get(name) ?? [];
    const result = infos.some((i) => i.usesGlobal || [...i.callees].some((c) => usesGlobal(c, stack)));
    stack.delete(name);
    memo.set(name, result);
    return result;
  };

  // 3) Dentro de cada callback de transação.
  const violations: Violation[] = [];
  for (const { file, sf } of sources) {
    const rel = path.relative(srcRoot, file);
    const check = (n: ts.Node) => {
      if (isTransactionCallback(n)) {
        const inside = (m: ts.Node) => {
          // `prisma` passado como argumento (ex.: getRule(prisma, ...)) dentro do callback.
          if (isGlobalPrisma(m) && ts.isCallExpression(m.parent) && m.parent.arguments.includes(m as ts.Expression)) {
            const line = sf.getLineAndCharacterOfPosition(m.getStart()).line + 1;
            violations.push({ file: rel, line, detail: "prisma global passado como cliente" });
          }
          if (ts.isPropertyAccessExpression(m) && isGlobalPrisma(m.expression)) {
            const line = sf.getLineAndCharacterOfPosition(m.getStart()).line + 1;
            violations.push({ file: rel, line, detail: `uso direto de prisma.${m.name.text}` });
          }
          if (ts.isCallExpression(m)) {
            const c = calleeName(m);
            if (c && usesGlobal(c)) {
              const line = sf.getLineAndCharacterOfPosition(m.getStart()).line + 1;
              violations.push({ file: rel, line, detail: `chama ${c}(), que usa o prisma global` });
            }
          }
          ts.forEachChild(m, inside);
        };
        ts.forEachChild(n, inside);
      }
      ts.forEachChild(n, check);
    };
    check(sf);
  }
  return violations;
}
