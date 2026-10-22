// Gera o inventário de tiers do RLS (Pilar 2) direto do prisma/schema.prisma —
// fonte de docs/RLS_INVENTARIO_TIERS.md. Rodar de novo a cada tabela nova:
//   node scripts/rls-tier-inventory.mjs prisma/schema.prisma
// Tier 1: coluna organizationId própria. Tier 2: 1 salto (FK direta) até um
// model com organizationId. Tier 3: 2+ saltos. Caminho = menor cadeia de FKs
// OBRIGATÓRIAS do lado "dono" da relação (o model que tem `fields: [...]`) —
// FK opcional nunca serve de caminho de policy (linha com FK nula sumiria).
import fs from "node:fs";

const schema = fs.readFileSync(process.argv[2], "utf8");
const models = new Map();
for (const m of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
  const [, name, body] = m;
  const map = body.match(/@@map\("([^"]+)"\)/)?.[1] ?? name;
  const fields = [];
  for (const line of body.split("\n")) {
    const f = line.match(/^\s+(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/);
    if (!f || f[1].startsWith("@@")) continue;
    const [, fname, ftype, isList, optional, rest] = f;
    const rel = rest.match(/@relation\((?:"[^"]*",\s*)?(?:name:\s*"[^"]*",\s*)?fields:\s*\[([^\]]+)\]/);
    fields.push({ fname, ftype, isList: !!isList, optional: !!optional, fk: rel ? rel[1].split(",").map((s) => s.trim()) : null });
  }
  models.set(name, { name, map, fields });
}

const orgCol = (m) => m.fields.find((f) => f.fname === "organizationId" && !f.fk && f.ftype === "String");
const result = [];
for (const m of models.values()) {
  const own = orgCol(m);
  if (own) {
    result.push({ model: m.name, table: m.map, tier: 1, path: own.optional ? "organizationId (NULLABLE)" : "organizationId", nullable: own.optional });
    continue;
  }
  // BFS pelas FKs do lado dono
  const queue = [[m.name, []]];
  const seen = new Set([m.name]);
  let found = null;
  while (queue.length && !found) {
    const [cur, path] = queue.shift();
    for (const f of models.get(cur).fields) {
      if (!f.fk || !models.has(f.ftype) || seen.has(f.ftype)) continue;
      if (f.fk.some((k) => models.get(cur).fields.find((x) => x.fname === k)?.optional)) continue;
      const fkFields = f.fk.map((k) => models.get(cur).fields.find((x) => x.fname === k));
      const step = `${f.fk.join("+")}${fkFields.some((x) => x?.optional) ? "?" : ""} → ${f.ftype}`;
      const next = [...path, step];
      if (orgCol(models.get(f.ftype))) { found = next; break; }
      seen.add(f.ftype);
      queue.push([f.ftype, next]);
    }
  }
  result.push({ model: m.name, table: m.map, tier: found ? (found.length === 1 ? 2 : 3) : 0, path: found ? found.join(" ; ") + " .organizationId" : "— sem caminho até organizationId" });
}
// Caminhos decididos à mão (docs/RLS_INVENTARIO_TIERS.md, "Caminhos
// decididos", 2026-10-22): tabelas com dois caminhos obrigatórios seguem o
// que a aplicação já usa, não o mais curto.
const DECIDED_PATHS = {
  spe_investor_contributions: { tier: 3, path: "investorId → SpeInvestor ; speId → SpecialPurposeEntity .organizationId (decidido)" },
  spe_investor_returns: { tier: 3, path: "investorId → SpeInvestor ; speId → SpecialPurposeEntity .organizationId (decidido)" },
  exchange_retention_releases: { tier: 3, path: "exchangeContractId → ExchangeContract ; developmentId → Development .organizationId (decidido)" },
};
for (const row of result) {
  if (DECIDED_PATHS[row.table]) Object.assign(row, DECIDED_PATHS[row.table]);
}

result.sort((a, b) => a.tier - b.tier || a.table.localeCompare(b.table));
const counts = result.reduce((acc, r) => ((acc[r.tier] = (acc[r.tier] ?? 0) + 1), acc), {});
console.log(JSON.stringify({ total: result.length, counts }, null, 0));
for (const r of result) console.log(`${r.tier}\t${r.table}\t${r.model}\t${r.path}`);
