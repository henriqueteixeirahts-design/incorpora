#!/usr/bin/env node
// RLS Pilar 2, Etapa 4 — gera os SQLs de ativação e de reversão dos 17 grupos
// a partir de docs/RLS_INVENTARIO_TIERS.md (grupos, tiers e caminhos já
// decididos) e de prisma/schema.prisma (colunas de FK de cada salto).
//
//   node scripts/rls-generate-policies.mjs          # (re)gera prisma/rls-etapa4/
//   node scripts/rls-generate-policies.mjs --check  # falha se o gerado divergir do versionado
//
// Os arquivos ficam FORA de prisma/migrations de propósito: nada aqui é
// aplicado por `prisma migrate deploy`. Cada grupo vira migration de verdade
// só quando promovido (scripts/rls-promote-group.mjs), um grupo por deploy.
//
// Policy de cada tabela (uma só, FOR ALL, TO app_user, USING = WITH CHECK):
//   Tier 1: "organizationId" = (SELECT public.app_current_org_id())
//   Tier 2/3: EXISTS pela cadeia de FKs obrigatórias até a tabela com
//             organizationId (o caminho do inventário).
// `(SELECT ...)` em volta da função: o Postgres calcula uma vez por consulta
// (InitPlan), não uma vez por linha.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "prisma", "rls-etapa4");
const ORG = "(SELECT public.app_current_org_id())";

// ── schema.prisma → tabelas e FKs ─────────────────────────────────────────
function parseSchema(text) {
  const models = new Map(); // modelName → { table, scalars: Map(name → {optional}), relations: [{field, model, fk, optional}] }
  for (const block of text.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const [, name, body] = block;
    const table = body.match(/@@map\("([^"]+)"\)/)?.[1] ?? name;
    const scalars = new Map();
    const relations = [];
    for (const line of body.split("\n")) {
      const m = line.match(/^\s*(\w+)\s+(\w+)(\?|\[\])?\s*(.*)$/);
      if (!m || line.trim().startsWith("//") || line.trim().startsWith("@@")) continue;
      const [, field, type, mod, rest] = m;
      const rel = rest.match(/@relation\([^)]*fields:\s*\[([^\]]+)\][^)]*references:\s*\[([^\]]+)\]/);
      if (rel) relations.push({ field, model: type, fk: rel[1].split(",").map((s) => s.trim()), optional: mod === "?" });
      else scalars.set(field, { optional: mod === "?" });
    }
    models.set(name, { name, table, scalars, relations });
  }
  const byTable = new Map([...models.values()].map((m) => [m.table, m]));
  return { models, byTable };
}

// ── inventário → grupos ───────────────────────────────────────────────────
function parseInventory(text) {
  const groups = [];
  let current = null;
  for (const line of text.split("\n")) {
    const g = line.match(/^### Grupo (\d+) — (.+?) \((\d+)\)/);
    if (g) {
      current = { number: Number(g[1]), title: g[2].trim(), expected: Number(g[3]), tables: [] };
      groups.push(current);
      continue;
    }
    if (line.startsWith("## ")) current = null;
    const row = current && line.match(/^\| `(\w+)` \| (\d) \| `([^`]+)`/);
    if (row) current.tables.push({ table: row[1], tier: Number(row[2]), path: row[3] });
  }
  for (const g of groups) {
    if (g.tables.length !== g.expected) throw new Error(`Grupo ${g.number}: ${g.tables.length} tabelas lidas, inventário diz ${g.expected}`);
  }
  return groups;
}

function slug(text) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
}

const q = (ident) => `"${ident}"`;

/** Expressão da policy de uma tabela, seguindo o caminho do inventário. */
function policyExpression(entry, schema) {
  const model = schema.byTable.get(entry.table);
  if (!model) throw new Error(`Tabela ${entry.table} não existe no schema`);
  if (entry.tier === 1) {
    const col = model.scalars.get("organizationId");
    if (!col || col.optional) throw new Error(`${entry.table}: Tier 1 sem organizationId obrigatório`);
    return `"organizationId" = ${ORG}`;
  }
  // "fk → t1 → t2 ..." — o primeiro salto nomeia a coluna; os seguintes são
  // achados pela FK obrigatória (única) de t(i) para t(i+1).
  const parts = entry.path.split("→").map((s) => s.trim());
  const firstFk = parts[0];
  const hopTables = parts.slice(1).map((name) => {
    // o inventário abrevia alguns nomes ("forecasts" = spe_investor_contribution_forecasts)
    if (schema.byTable.has(name)) return name;
    const matches = [...schema.byTable.keys()].filter((t) => t.endsWith(name));
    if (matches.length !== 1) throw new Error(`${entry.table}: salto "${name}" ambíguo/inexistente (${matches.join(", ")})`);
    return matches[0];
  });
  // Tier 2 = exatamente 1 salto; Tier 3 = 2 ou mais (definição do inventário).
  if ((entry.tier === 2) !== (hopTables.length === 1)) throw new Error(`${entry.table}: Tier ${entry.tier} com ${hopTables.length} saltos`);

  const fkScalar = model.scalars.get(firstFk);
  const firstRel = model.relations.find((r) => r.fk.length === 1 && r.fk[0] === firstFk);
  if (!fkScalar || fkScalar.optional || !firstRel || schema.models.get(firstRel.model).table !== hopTables[0]) {
    throw new Error(`${entry.table}.${firstFk}: não é FK obrigatória para ${hopTables[0]}`);
  }

  const aliases = hopTables.map((_, i) => `h${i + 1}`);
  let from = `public.${q(hopTables[0])} h1`;
  for (let i = 1; i < hopTables.length; i++) {
    const prev = schema.byTable.get(hopTables[i - 1]);
    const rels = prev.relations.filter((r) => schema.models.get(r.model).table === hopTables[i] && r.fk.length === 1 && !prev.scalars.get(r.fk[0])?.optional);
    if (rels.length !== 1) throw new Error(`${entry.table}: ${hopTables[i - 1]} → ${hopTables[i]} tem ${rels.length} FKs obrigatórias (precisa de exatamente 1)`);
    from += ` JOIN public.${q(hopTables[i])} ${aliases[i]} ON ${aliases[i]}.id = ${aliases[i - 1]}.${q(rels[0].fk[0])}`;
  }
  const last = schema.byTable.get(hopTables.at(-1));
  if (!last.scalars.get("organizationId") || last.scalars.get("organizationId").optional) {
    throw new Error(`${entry.table}: fim do caminho (${last.table}) sem organizationId obrigatório`);
  }
  return `EXISTS (SELECT 1 FROM ${from} WHERE h1.id = ${q(entry.table)}.${q(firstFk)} AND ${aliases.at(-1)}."organizationId" = ${ORG})`;
}

const HEADER = (title) => `-- ${title}
-- GERADO por scripts/rls-generate-policies.mjs a partir de
-- docs/RLS_INVENTARIO_TIERS.md + prisma/schema.prisma — não editar à mão.
-- Fica FORA de prisma/migrations: só vai a um banco quando promovido
-- (scripts/rls-promote-group.mjs) ou aplicado pelo CI (scripts/rls-apply-etapa4.mjs).
`;

function functionUp() {
  return `${HEADER("RLS Etapa 4 — Grupo 00: função de contexto (pré-requisito de todos os grupos)")}
-- Organização do contexto da transação, ou nulo. A aplicação define
-- app.current_org_id com set_config(..., true) (escopo de transação) em toda
-- consulta — ver src/lib/prisma.ts. Sem contexto, a extensão define um
-- placeholder que não corresponde a organização nenhuma: fail-closed.
-- Não é SECURITY DEFINER: roda com o privilégio de quem chama.
CREATE OR REPLACE FUNCTION public.app_current_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT nullif(pg_catalog.current_setting('app.current_org_id', true), '')::uuid;
$$;

REVOKE ALL ON FUNCTION public.app_current_org_id() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE EXECUTE ON FUNCTION public.app_current_org_id() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE EXECUTE ON FUNCTION public.app_current_org_id() FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE EXECUTE ON FUNCTION public.app_current_org_id() FROM service_role;
  END IF;
END
$$;
GRANT EXECUTE ON FUNCTION public.app_current_org_id() TO app_user;
`;
}

function functionDown() {
  return `${HEADER("RLS Etapa 4 — REVERSÃO do Grupo 00 (só depois de reverter os 17 grupos)")}
DROP FUNCTION IF EXISTS public.app_current_org_id();
`;
}

function groupUp(group, schema) {
  const lines = [HEADER(`RLS Etapa 4 — Grupo ${group.number}: ${group.title} (${group.tables.length} tabelas)`)];
  lines.push(`-- Reversão: ${fileBase(group)}.down.sql (idempotente).`);
  lines.push(`-- Policy: FOR ALL, TO app_user, mesma expressão em USING e WITH CHECK — leitura,`);
  lines.push(`-- escrita, update e delete só dentro da organização do contexto. FORCE: vale até`);
  lines.push(`-- para a dona da tabela, se um dia ela perder BYPASSRLS.\n`);
  for (const entry of group.tables) {
    const expr = policyExpression(entry, schema);
    lines.push(`-- ${entry.table} — Tier ${entry.tier} — ${entry.path}`);
    lines.push(`ALTER TABLE public.${q(entry.table)} ENABLE ROW LEVEL SECURITY;`);
    lines.push(`ALTER TABLE public.${q(entry.table)} FORCE ROW LEVEL SECURITY;`);
    lines.push(`DROP POLICY IF EXISTS tenant_isolation ON public.${q(entry.table)};`);
    lines.push(`CREATE POLICY tenant_isolation ON public.${q(entry.table)} AS PERMISSIVE FOR ALL TO app_user`);
    lines.push(`  USING (${expr})`);
    lines.push(`  WITH CHECK (${expr});\n`);
  }
  return lines.join("\n");
}

function groupDown(group) {
  const lines = [HEADER(`RLS Etapa 4 — REVERSÃO do Grupo ${group.number}: ${group.title}`)];
  lines.push(`-- Idempotente: pode rodar mais de uma vez, e sobre um banco em que o grupo nunca foi ativado.\n`);
  for (const entry of group.tables) {
    lines.push(`DROP POLICY IF EXISTS tenant_isolation ON public.${q(entry.table)};`);
    lines.push(`ALTER TABLE public.${q(entry.table)} NO FORCE ROW LEVEL SECURITY;`);
    lines.push(`ALTER TABLE public.${q(entry.table)} DISABLE ROW LEVEL SECURITY;`);
  }
  return lines.join("\n") + "\n";
}

function fileBase(group) {
  return `${String(group.number).padStart(2, "0")}_grupo_${slug(group.title)}`;
}

function generate() {
  const schema = parseSchema(readFileSync(path.join(ROOT, "prisma", "schema.prisma"), "utf8"));
  const groups = parseInventory(readFileSync(path.join(ROOT, "docs", "RLS_INVENTARIO_TIERS.md"), "utf8"));
  if (groups.length !== 17) throw new Error(`esperados 17 grupos, lidos ${groups.length}`);
  const files = new Map([
    ["00_funcao_contexto.up.sql", functionUp()],
    ["00_funcao_contexto.down.sql", functionDown()],
  ]);
  const manifest = [];
  for (const group of groups) {
    files.set(`${fileBase(group)}.up.sql`, groupUp(group, schema));
    files.set(`${fileBase(group)}.down.sql`, groupDown(group));
    manifest.push({ group: group.number, title: group.title, file: fileBase(group), tables: group.tables.map((t) => ({ table: t.table, tier: t.tier, path: t.path })) });
  }
  files.set("manifest.json", JSON.stringify(manifest, null, 2) + "\n");
  return files;
}

const files = generate();
if (process.argv.includes("--check")) {
  const existing = new Map(readdirSync(OUT).map((f) => [f, readFileSync(path.join(OUT, f), "utf8")]));
  const diff = [...files.keys(), ...existing.keys()].filter((f) => files.get(f) !== existing.get(f));
  if (diff.length) {
    console.error(`prisma/rls-etapa4 desatualizado em relação ao inventário/schema: ${[...new Set(diff)].join(", ")}`);
    process.exit(1);
  }
  console.log(`prisma/rls-etapa4 confere (${files.size} arquivos).`);
} else {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  for (const [name, content] of files) writeFileSync(path.join(OUT, name), content);
  console.log(`${files.size} arquivos gerados em prisma/rls-etapa4/`);
}
