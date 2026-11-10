import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findGlobalPrismaInTransactions } from "@/lib/global-prisma-in-transaction";

/**
 * Trava ESTÁTICA (2026-11-10): nenhum callback de `prisma.$transaction` em
 * src/ usa o `prisma` global, direto ou por função chamada. Complementa a
 * trava em tempo de execução (tests/integration/prisma-transaction-guard.test.ts),
 * que só pega caminhos exercitados por teste.
 */
function scanSynthetic(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "tx-guard-"));
  try {
    for (const [name, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      writeFileSync(path.join(dir, name), content);
    }
    return findGlobalPrismaInTransactions(dir).map((v) => `${v.file}:${v.line} ${v.detail}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("Trava estática: prisma global dentro de prisma.$transaction", () => {
  it("src/ não tem nenhum caso", () => {
    expect(findGlobalPrismaInTransactions(path.resolve(__dirname, ".."))).toEqual([]);
  });

  it("acusa uso direto, $transaction aninhado e prisma passado como cliente dentro do callback", () => {
    const found = scanSynthetic({
      "server/a.ts": `
import { prisma } from "@/lib/prisma";
export async function f() {
  return prisma.$transaction(async (tx) => {
    await prisma.sale.findMany();
    await prisma.$transaction(async (t2) => t2.sale.count());
    await helper(prisma);
    await tx.sale.count();
  });
}
async function helper(db: unknown) { return db; }
`,
    });
    expect(found).toEqual([
      "server/a.ts:5 uso direto de prisma.sale",
      "server/a.ts:6 uso direto de prisma.$transaction",
      "server/a.ts:7 prisma global passado como cliente",
    ]);
  });

  it("acusa função chamada dentro do callback que usa o prisma global, inclusive indiretamente (outro arquivo)", () => {
    const found = scanSynthetic({
      "server/rules.ts": `
import { prisma } from "@/lib/prisma";
export async function getRule(id: string) { return prisma.rule.findUnique({ where: { id } }); }
export async function resolve(id: string) { return getRule(id); }
`,
      "server/sale.ts": `
import { prisma } from "@/lib/prisma";
import { resolve } from "./rules";
export async function convert() {
  return prisma.$transaction(async (tx) => {
    await resolve("x");
    await tx.sale.create({ data: {} });
  });
}
`,
    });
    expect(found).toEqual(["server/sale.ts:6 chama resolve(), que usa o prisma global"]);
  });

  it("não acusa o jeito certo: função que recebe o cliente e é chamada com tx", () => {
    const found = scanSynthetic({
      "server/ok.ts": `
import { prisma, type DbClient } from "@/lib/prisma";
export async function getRule(db: DbClient, id: string) { return db.rule.findUnique({ where: { id } }); }
export async function page() { return getRule(prisma, "x"); }
export async function convert() {
  return prisma.$transaction(async (tx) => { await getRule(tx, "x"); });
}
`,
    });
    expect(found).toEqual([]);
  });
});
