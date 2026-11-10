import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Trava contra SET de SESSÃO (RLS Pilar 2, Etapa 4 — 2026-11-10).
 *
 * A prova do pooler (scripts/prove-pooler-tenant-context.ts) mostrou que o
 * pooler em modo transação VAZA estado de sessão entre clientes: um
 * `set_config(..., false)` ou `SET app.x` feito por uma requisição aparece
 * na conexão física que a próxima requisição, de outra organização, recebe.
 * O isolamento depende inteiramente do escopo de transação
 * (`set_config(..., true)` = SET LOCAL).
 *
 * Esta trava varre src/ e falha se aparecer:
 *   - `set_config(` fora dos pontos legítimos (hoje só src/lib/prisma.ts);
 *   - nos pontos legítimos, `set_config(` sem o terceiro argumento `true`;
 *   - `SET [SESSION|LOCAL] app.*` (inclui `ALTER ROLE ... SET app.*`) em
 *     qualquer lugar de src/ — o app nunca precisa disso.
 * Comentários contam também, de propósito: é mais barato reescrever um
 * comentário do que deixar um padrão perigoso passar escondido.
 * A regra de lint `no-restricted-syntax` (eslint.config.mjs) acusa o mesmo
 * no editor; este teste é a rede que não depende de configuração de lint.
 */
const SRC = path.resolve(__dirname, "..");
const SELF = path.relative(SRC, __filename);
const LEGITIMATE_SET_CONFIG_FILES = new Set(["lib/prisma.ts"]);

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return entry === "generated" ? [] : listSourceFiles(full);
    return /\.(ts|tsx|js|mjs|cjs)$/.test(entry) ? [full] : [];
  });
}

/** Texto entre o "(" de abertura e o ")" correspondente. */
function callArguments(source: string, openParenIndex: number): string {
  let depth = 0;
  for (let i = openParenIndex; i < source.length; i++) {
    if (source[i] === "(") depth++;
    else if (source[i] === ")" && --depth === 0) return source.slice(openParenIndex + 1, i);
  }
  return source.slice(openParenIndex + 1);
}

function splitTopLevelArgs(args: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of args) {
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    if (ch === ")" || ch === "]" || ch === "}") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

export function findSessionSetViolations(relativePath: string, source: string): string[] {
  const violations: string[] = [];
  const lineOf = (index: number) => source.slice(0, index).split("\n").length;

  for (const match of source.matchAll(/set_config\s*\(/gi)) {
    const at = match.index!;
    const where = `${relativePath}:${lineOf(at)}`;
    if (!LEGITIMATE_SET_CONFIG_FILES.has(relativePath)) {
      violations.push(`${where} — set_config fora dos pontos legítimos (${[...LEGITIMATE_SET_CONFIG_FILES].join(", ")})`);
      continue;
    }
    const args = splitTopLevelArgs(callArguments(source, at + match[0].length - 1));
    // Menção abreviada em comentário (`set_config(..., TRUE)`): o último argumento ainda tem que ser true.
    const abbreviated = args[0] === "...";
    const scopeArg = abbreviated ? args[args.length - 1] : args[2];
    if ((!abbreviated && args.length !== 3) || scopeArg?.toLowerCase() !== "true") {
      violations.push(`${where} — set_config sem o terceiro argumento true (escopo de transação): set_config(${args.join(", ")})`);
    }
  }

  for (const match of source.matchAll(/\bSET\s+(?:SESSION\s+|LOCAL\s+)?"?app\./gi)) {
    violations.push(`${relativePath}:${lineOf(match.index!)} — SET de variável app.* (só set_config(..., true) na extensão do Prisma)`);
  }
  return violations;
}

describe("Trava: contexto de organização só com escopo de transação (nunca SET de sessão)", () => {
  it("src/ não tem set_config fora dos pontos legítimos, nem sem `true`, nem SET app.*", () => {
    const violations = listSourceFiles(SRC)
      .map((file) => path.relative(SRC, file))
      .filter((rel) => rel !== SELF)
      .flatMap((rel) => findSessionSetViolations(rel, readFileSync(path.join(SRC, rel), "utf8")));
    expect(violations).toEqual([]);
  });

  it("o ponto legítimo existe de verdade (a trava não está varrendo o lugar errado)", () => {
    const prismaSource = readFileSync(path.join(SRC, "lib/prisma.ts"), "utf8");
    expect(prismaSource.match(/set_config\('app\.current_org_id', \$1, TRUE\)/g)?.length).toBe(3);
  });

  it("o detector acusa cada forma proibida (casos sintéticos)", () => {
    expect(findSessionSetViolations("lib/prisma.ts", "SELECT set_config('app.current_org_id', $1, FALSE)")).toHaveLength(1);
    expect(findSessionSetViolations("lib/prisma.ts", "SELECT set_config('app.current_org_id', $1)")).toHaveLength(1);
    expect(findSessionSetViolations("server/x.ts", "SELECT set_config('app.current_org_id', $1, TRUE)")).toHaveLength(1);
    expect(findSessionSetViolations("server/x.ts", "SET app.current_org_id = 'x'")).toHaveLength(1);
    expect(findSessionSetViolations("server/x.ts", "SET SESSION app.current_org_id TO 'x'")).toHaveLength(1);
    expect(findSessionSetViolations("server/x.ts", "ALTER ROLE app_user SET app.current_org_id = 'x'")).toHaveLength(1);
    expect(findSessionSetViolations("lib/prisma.ts", "// via set_config(..., FALSE)")).toHaveLength(1);
    expect(findSessionSetViolations("lib/prisma.ts", "SELECT set_config('app.current_org_id', $1, TRUE)")).toHaveLength(0);
    expect(findSessionSetViolations("lib/prisma.ts", "// via `SELECT set_config(..., TRUE)`")).toHaveLength(0);
    expect(findSessionSetViolations("server/x.ts", `UPDATE "t" SET "appName" = 1`)).toHaveLength(0);
  });
});
