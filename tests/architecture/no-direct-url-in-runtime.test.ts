import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * RLS Pilar 2, Etapa 3 — `DIRECT_URL` conecta com a role de DDL de cada
 * ambiente (privilégio de superusuário/dono de schema — quem roda
 * migration). Nenhum código que roda em runtime (dentro de `src/`, ou
 * seja, servido por request/cron da aplicação) pode ler ou usar essa
 * credencial — só `prisma.config.ts` (CLI de migration, fora de `src/`) e
 * `prisma/seed.ts` (script manual, nunca disparado por build/deploy da
 * Vercel — confirmado em package.json/vercel.json) têm motivo legítimo
 * pra isso.
 *
 * Substitui a proteção que seria necessária se a Etapa 3 tivesse usado uma
 * role BYPASSRLS separada com um client próprio (`src/lib/prisma-service-
 * role.ts`, desenho descartado em favor da função SECURITY DEFINER
 * `list_active_org_ids()` — ver a migration correspondente) — aqui a
 * superfície de risco é mais simples: não existe uma segunda credencial
 * pra isolar, só a garantia de que a credencial de DDL nunca vaza pro
 * código que serve request.
 */

const SRC_DIR = join(__dirname, "..", "..", "src");

function listTsFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...listTsFiles(fullPath));
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts") && !entry.endsWith(".test.tsx")) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("Nenhum código de runtime em src/ usa DIRECT_URL", () => {
  it("grep de DIRECT_URL em todo src/*.ts(x) não encontra nada", () => {
    const offenders: string[] = [];

    for (const file of listTsFiles(SRC_DIR)) {
      if (file.includes(`${join("src", "generated")}`)) continue; // client gerado do Prisma, não código nosso
      const content = readFileSync(file, "utf8");
      if (content.includes("DIRECT_URL")) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });
});
