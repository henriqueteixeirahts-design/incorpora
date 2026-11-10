#!/usr/bin/env node
// RLS Etapa 4 — promove UM grupo de prisma/rls-etapa4/ a migration de verdade
// (prisma/migrations/<timestamp>_rls_etapa4_grupo_NN/migration.sql), para ir
// a produção no próximo deploy (o build da Vercel roda `prisma migrate deploy`).
//
//   node scripts/rls-promote-group.mjs 1          # grupo 1 (inclui a função de contexto, grupo 00)
//   node scripts/rls-promote-group.mjs 7 --down   # registra a REVERSÃO do grupo 7 como migration
//
// Travas: recusa pular a ordem (o grupo N-1 precisa já estar promovido),
// recusa promover um grupo já ativo, recusa reverter grupo que não está ativo.
// Não aplica nada em banco nenhum — só cria o arquivo. Ver
// docs/RLS_ETAPA4_ROTEIRO_ATIVACAO.md.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "prisma", "rls-etapa4");
const MIGRATIONS = path.join(ROOT, "prisma", "migrations");

const [, , groupArg, flag] = process.argv;
const group = Number(groupArg);
const down = flag === "--down";
if (!Number.isInteger(group) || group < 1 || group > 17) {
  console.error("Uso: node scripts/rls-promote-group.mjs <1-17> [--down]");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(path.join(SRC, "manifest.json"), "utf8"));
const entry = manifest.find((g) => g.group === group);
const nn = String(group).padStart(2, "0");
const existing = readdirSync(MIGRATIONS);
// Ativo = mais ativações que reversões promovidas (um grupo revertido pode ser promovido de novo).
const promoted = (n) => {
  const tag = `_rls_etapa4_grupo_${String(n).padStart(2, "0")}`;
  const ups = existing.filter((d) => d.endsWith(tag)).length;
  const downs = existing.filter((d) => d.endsWith(`${tag}_reversao`)).length;
  return ups > downs;
};

if (down) {
  if (!promoted(group)) {
    console.error(`Recusado: o grupo ${group} não está ativo — não há o que reverter.`);
    process.exit(1);
  }
} else {
  if (promoted(group)) {
    console.error(`Recusado: o grupo ${group} já está ativo (prisma/migrations/*_rls_etapa4_grupo_${nn}).`);
    process.exit(1);
  }
  if (group > 1 && !promoted(group - 1)) {
    console.error(`Recusado: promova o grupo ${group - 1} antes (ordem do roteiro).`);
    process.exit(1);
  }
}

const now = new Date();
const stamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
const name = `${stamp}_rls_etapa4_grupo_${nn}${down ? "_reversao" : ""}`;
const parts = [];
if (!down && group === 1) parts.push(readFileSync(path.join(SRC, "00_funcao_contexto.up.sql"), "utf8"));
parts.push(readFileSync(path.join(SRC, `${entry.file}.${down ? "down" : "up"}.sql`), "utf8"));

const header = `-- Promovido em ${now.toISOString()} por scripts/rls-promote-group.mjs ${group}${down ? " --down" : ""}.
-- ${down ? "REVERSÃO" : "ATIVAÇÃO"} do RLS — Grupo ${group}: ${entry.title} (${entry.tables.length} tabelas).
-- MUDANÇA DE SEGURANÇA EM PRODUÇÃO: só com aprovação explícita. Roteiro: docs/RLS_ETAPA4_ROTEIRO_ATIVACAO.md.
`;
const dir = path.join(MIGRATIONS, name);
if (existsSync(dir)) throw new Error(`${dir} já existe`);
mkdirSync(dir);
writeFileSync(path.join(dir, "migration.sql"), `${header}\n${parts.join("\n")}`);
console.log(`Criado prisma/migrations/${name}/migration.sql`);
console.log(`Tabelas: ${entry.tables.map((t) => t.table).join(", ")}`);
