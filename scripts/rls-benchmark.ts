/**
 * RLS Etapa 4 — benchmark de desempenho das policies com VOLUME, num banco
 * descartável com os 17 grupos aplicados (scripts/rls-apply-etapa4.mjs).
 *
 *   DIRECT_URL=... DATABASE_URL=... npx tsx scripts/rls-benchmark.ts [N]
 *
 * Monta 3 organizações com N parcelas cada (padrão 20.000), cada parcela com
 * 1 memória de cálculo (Tier 3) e 1 pagamento (Tier 3), e N históricos de
 * status de unidade (Tier 3 por units → developments). Mede cada consulta
 * duas vezes, com o MESMO texto: como app_user no contexto da Org A (RLS
 * aplicado) e pela role de migrations (BYPASSRLS — sem policy). Mediana de 5
 * execuções do "Execution Time" do EXPLAIN ANALYZE, depois de 1 aquecimento.
 * Recusa o banco de produção. Apaga tudo o que criou no fim.
 */
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { RlsFixtureBuilder } from "../tests/integration/helpers/rls-fixtures";

const N = Number(process.argv[2] ?? 20000);
const PRODUCTION_REF = "mueudgyivnqhhbwkykkq";

async function main() {
  for (const url of [process.env.DIRECT_URL, process.env.DATABASE_URL]) {
    if (!url) throw new Error("DIRECT_URL e DATABASE_URL são obrigatórias");
    if (url.includes(PRODUCTION_REF)) throw new Error("Recusado: banco de produção.");
  }
  const admin = new Client({ connectionString: process.env.DIRECT_URL });
  const app = new Client({ connectionString: process.env.DATABASE_URL });
  await admin.connect();
  await app.connect();
  const fx = new RlsFixtureBuilder(admin);
  await fx.load();

  const orgs: { org: string; portfolio: string; development: string }[] = [];
  try {
    console.log(`Montando 3 organizações × ${N} parcelas (+ memórias, pagamentos, históricos de unidade)...`);
    for (const name of ["A", "B", "C"]) {
      const org = await fx.organization(`Org ${name} — benchmark RLS`);
      const payment = await fx.insert("installment_payments", org);
      const { rows: [inst] } = await admin.query(`SELECT i.id, i."portfolioId" FROM installments i JOIN installment_payments p ON p."installmentId" = i.id WHERE p.id = $1`, [payment]);
      const history = await fx.insert("unit_status_history", org);
      const { rows: [unit] } = await admin.query(`SELECT u.id, u."developmentId" FROM units u JOIN unit_status_history h ON h."unitId" = u.id WHERE h.id = $1`, [history]);
      await admin.query(
        `INSERT INTO installments (id, "portfolioId", sequence, label, "dueDate", "originalValue", "paidAmount")
         SELECT gen_random_uuid(), $1, 1000 + g, 'Parcela ' || g, now() - (g || ' days')::interval, 1000, 0 FROM generate_series(1, $2) g`,
        [inst.portfolioId, N],
      );
      await admin.query(
        `INSERT INTO financial_calculations (id, "installmentId", "competenceMonth", "asOfDate", "baseValue", "indexFactor", "interestFactor",
                                             "correctedValue", "daysOverdue", "fineAmount", "overdueInterestAmount", "resultValue", "updatedAt", details)
         SELECT gen_random_uuid(), i.id, date_trunc('month', now()), now(), 1000, 1, 1, 1000, 0, 0, 0, 1000, now(), '{}'::jsonb
           FROM installments i WHERE i."portfolioId" = $1 AND i.sequence > 1000`,
        [inst.portfolioId],
      );
      await admin.query(
        `INSERT INTO installment_payments (id, "installmentId", amount, "paidAt")
         SELECT gen_random_uuid(), i.id, 10, now() FROM installments i WHERE i."portfolioId" = $1 AND i.sequence > 1000`,
        [inst.portfolioId],
      );
      const { rows: [h] } = await admin.query(`SELECT * FROM unit_status_history WHERE id = $1`, [history]);
      const cols = Object.keys(h).filter((c) => c !== "id" && h[c] !== null);
      await admin.query(
        `INSERT INTO unit_status_history (id, ${cols.map((c) => `"${c}"`).join(", ")})
         SELECT gen_random_uuid(), ${cols.map((c) => `h."${c}"`).join(", ")} FROM unit_status_history h, generate_series(1, $2) WHERE h.id = $1`,
        [history, N],
      );
      orgs.push({ org, portfolio: inst.portfolioId, development: unit.developmentId });
    }
    await admin.query("ANALYZE installments; ANALYZE financial_calculations; ANALYZE installment_payments; ANALYZE unit_status_history; ANALYZE receivable_portfolios; ANALYZE units");

    const A = orgs[0];
    const queries: { name: string; sql: string; params: unknown[] }[] = [
      {
        name: "Tier 2 — listar parcelas da carteira (50 mais recentes)",
        sql: `SELECT id, "dueDate" FROM installments WHERE "portfolioId" = $1 ORDER BY "dueDate" DESC LIMIT 50`,
        params: [A.portfolio],
      },
      {
        name: "Tier 2 — contar parcelas vencidas da carteira",
        sql: `SELECT count(*) FROM installments WHERE "portfolioId" = $1 AND "dueDate" < now()`,
        params: [A.portfolio],
      },
      {
        name: "Tier 3 — soma das memórias de cálculo da carteira (V3/V6)",
        sql: `SELECT count(*), sum(fc."resultValue") FROM financial_calculations fc JOIN installments i ON i.id = fc."installmentId" WHERE i."portfolioId" = $1`,
        params: [A.portfolio],
      },
      {
        name: "Tier 3 — soma dos pagamentos da carteira (extrato)",
        sql: `SELECT sum(p.amount) FROM installment_payments p JOIN installments i ON i.id = p."installmentId" WHERE i."portfolioId" = $1`,
        params: [A.portfolio],
      },
      {
        name: "Tier 3 — última memória por parcela, tabela inteira (só o RLS filtra no app_user)",
        sql: `SELECT count(*) FROM (SELECT DISTINCT ON ("installmentId") "installmentId" FROM financial_calculations ORDER BY "installmentId", "competenceMonth" DESC) x`,
        params: [],
      },
      {
        name: "Tier 3 — ponto: uma memória de cálculo por id",
        sql: `SELECT * FROM financial_calculations WHERE id = (SELECT fc.id FROM financial_calculations fc JOIN installments i ON i.id = fc."installmentId" WHERE i."portfolioId" = $1 AND i.sequence = 5000)`,
        params: [A.portfolio],
      },
      {
        name: "Tier 3 — ponto: memórias de uma parcela (recálculo de 1 parcela)",
        sql: `SELECT * FROM financial_calculations WHERE "installmentId" = (SELECT id FROM installments WHERE "portfolioId" = $1 AND sequence = 5000)`,
        params: [A.portfolio],
      },
      {
        name: "Tier 3 — histórico de status das unidades do empreendimento",
        sql: `SELECT count(*) FROM unit_status_history h JOIN units u ON u.id = h."unitId" WHERE u."developmentId" = $1`,
        params: [A.development],
      },
    ];

    async function measure(client: Client, sql: string, params: unknown[], org: string | null) {
      const times: number[] = [];
      let rows = 0;
      for (let i = 0; i < 6; i++) {
        await client.query("BEGIN");
        if (org) await client.query(`SELECT set_config('app.current_org_id', $1, true)`, [org]);
        const { rows: plan } = await client.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`, params);
        const res = await client.query(sql, params);
        await client.query("ROLLBACK");
        rows = res.rowCount ?? 0;
        if (i > 0) times.push(plan[0]["QUERY PLAN"][0]["Execution Time"]);
        if (i === 1) (measure as unknown as { lastPlan: unknown }).lastPlan = plan[0]["QUERY PLAN"][0].Plan;
      }
      times.sort((a, b) => a - b);
      return { median: times[2], rows };
    }

    // BENCH_PLAN=<n>: imprime o plano (com RLS) da consulta n (1 = primeira).
    const planIndex = Number(process.env.BENCH_PLAN ?? 0);
    if (planIndex > 0) {
      const q = queries[planIndex - 1];
      await app.query("BEGIN");
      await app.query(`SELECT set_config('app.current_org_id', $1, true)`, [A.org]);
      const { rows } = await app.query(`EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF) ${q.sql}`, q.params);
      await app.query("ROLLBACK");
      console.log(`\nPlano com RLS — ${q.name}:\n${rows.map((r) => r["QUERY PLAN"]).join("\n")}`);
    }

    console.log(`\n${"consulta".padEnd(82)} sem RLS    com RLS   ×`);
    const results = [];
    for (const q of queries) {
      const off = await measure(admin, q.sql, q.params, null);
      const on = await measure(app, q.sql, q.params, A.org);
      results.push({ ...q, off: off.median, on: on.median });
      console.log(`${q.name.padEnd(82)} ${off.median.toFixed(2).padStart(7)} ms ${on.median.toFixed(2).padStart(7)} ms  ${(on.median / off.median).toFixed(1)}`);
    }
    console.log("\n(última consulta: 'sem RLS' lê as 3 organizações; 'com RLS' lê só a A — compara custo da policy contra leitura sem filtro)");
    return results;
  } finally {
    console.log("\nLimpando...");
    for (const { portfolio } of orgs) {
      await admin.query(`DELETE FROM installment_payments WHERE "installmentId" IN (SELECT id FROM installments WHERE "portfolioId" = $1)`, [portfolio]);
      await admin.query(`DELETE FROM financial_calculations WHERE "installmentId" IN (SELECT id FROM installments WHERE "portfolioId" = $1)`, [portfolio]);
      await admin.query(`DELETE FROM installments WHERE "portfolioId" = $1 AND sequence > 1000`, [portfolio]);
    }
    for (const { development } of orgs) {
      await admin.query(`DELETE FROM unit_status_history WHERE "unitId" IN (SELECT id FROM units WHERE "developmentId" = $1)`, [development]);
    }
    fx.inserted.splice(0, fx.inserted.length, ...fx.inserted.filter((r) => r.table !== "unit_status_history"));
    await fx.cleanup();
    await admin.end();
    await app.end();
    void randomUUID;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
