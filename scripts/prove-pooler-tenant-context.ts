/**
 * Prova do pooler — pré-requisito da Etapa 4 do RLS (decisão do usuário,
 * 2026-11-09). Antes de ativar qualquer policy, provar que o contexto de
 * organização (`app.current_org_id`, definido com `set_config(..., TRUE)`
 * pela extensão de src/lib/prisma.ts) sobrevive ao pooler em MODO
 * TRANSAÇÃO — exatamente o modo em que um `SET` de sessão escorrega entre
 * clientes, porque a conexão física é reaproveitada a cada transação.
 *
 * Usa a extensão REAL do app (`prisma` + `withOrgContext`), não SQL escrito
 * à mão. Não cria tabela, migration nem linha em tabela real: a única DDL é
 * uma tabela TEMPORÁRIA com ON COMMIT DROP, que some no fim da transação.
 *
 * Provas:
 *   1. VISÍVEL      — dentro de cada transação, as duas leituras de
 *                     current_setting veem a organização do contexto, no
 *                     mesmo processo do Postgres. Também em chamada avulsa.
 *   2. SEM VAZAMENTO — leitores sem a extensão, em paralelo, nunca veem o id
 *                     de organização nenhuma.
 *   3. POLICY       — numa tabela temporária com RLS forçado e policy por
 *                     current_setting, só as linhas da organização do
 *                     contexto aparecem; sem contexto, zero linhas.
 *   4. REUSO (controle) — o mesmo processo do Postgres precisa ter atendido
 *                     organizações diferentes, e leitores do passo 2 precisam
 *                     ter caído em processos usados pelas organizações. Sem
 *                     reuso, o resultado é INCONCLUSIVO (saída 2) — nunca
 *                     verde: sem conexão física compartilhada, as provas 1-2
 *                     não teriam o que provar.
 *   5. CONTROLE NEGATIVO — um `SET` de SESSÃO (sem LOCAL) numa variável de
 *                     teste sem relação com o app (`app.leak_probe`): mostra
 *                     se o pooler deixa estado de sessão vazar entre clientes.
 *                     Se vazar, o teste é capaz de detectar vazamento e fica
 *                     confirmado que só o LOCAL protege.
 *
 * Uso (produção — a mesma DATABASE_URL da Vercel, que conecta pelo
 * Supavisor em modo transação, porta 6543, como app_user):
 *
 *   DATABASE_URL='postgresql://app_user.<ref>:<senha>@<host>:6543/postgres' \
 *     npx tsx scripts/prove-pooler-tenant-context.ts
 *
 * Recusa porta diferente de 6543 e usuário diferente de app_user. No CI
 * (PgBouncer em modo transação, porta 6432): POOLER_PROOF_PORT=6432 e
 * POOLER_PROOF_REQUIRE_LEAK_DETECTION=1 (lá o controle negativo é obrigatório).
 *
 * Saída: 0 = APROVADO, 1 = FALHOU, 2 = INCONCLUSIVO. A senha nunca é impressa.
 */
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

const WORKERS = Number(process.env.POOLER_PROOF_WORKERS ?? 10);
const ITERATIONS = Number(process.env.POOLER_PROOF_ITERATIONS ?? 50);
const READERS = Number(process.env.POOLER_PROOF_READERS ?? 4);
const EXPECTED_PORT = process.env.POOLER_PROOF_PORT ?? "6543";
const REQUIRE_LEAK_DETECTION = process.env.POOLER_PROOF_REQUIRE_LEAK_DETECTION === "1";
const PLACEHOLDER = "00000000-0000-0000-0000-000000000000";

const failures: string[] = [];
function fail(message: string) {
  if (failures.length < 20) console.error(`  ✗ ${message}`);
  failures.push(message);
}

function checkTarget(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    console.error("DATABASE_URL não definida.");
    process.exit(1);
  }
  const url = new URL(raw);
  const port = url.port || "5432";
  const user = decodeURIComponent(url.username);
  console.log(`Alvo: ${url.hostname}:${port}, usuário ${user}, banco ${url.pathname.slice(1)} (senha não impressa)`);
  if (port !== EXPECTED_PORT) {
    console.error(`Recusado: porta ${port}; esperado ${EXPECTED_PORT} (pooler em modo transação).`);
    process.exit(1);
  }
  if (user !== "app_user" && !user.startsWith("app_user.")) {
    console.error(`Recusado: usuário ${user}; a prova tem que rodar como app_user (como a aplicação conecta).`);
    process.exit(1);
  }
  return raw;
}

type Probe = { v: string | null; pid: number };

async function main() {
  const connectionString = checkTarget();
  // Import tardio: src/lib/prisma.ts lê DATABASE_URL na carga.
  const { prisma } = await import("../src/lib/prisma");
  const { withOrgContext } = await import("../src/lib/tenant-context");

  const orgs = Array.from({ length: WORKERS }, () => randomUUID());
  const orgSet = new Set<string>(orgs);
  const orgsByPid = new Map<number, Set<string>>();
  const note = (pid: number, org: string) => {
    if (!orgsByPid.has(pid)) orgsByPid.set(pid, new Set());
    orgsByPid.get(pid)!.add(org);
  };

  // ── Provas 1 e 2, em paralelo ────────────────────────────────────────
  console.log(`\n[1] ${WORKERS} organizações × ${ITERATIONS} transações + chamadas avulsas, com ${READERS} leitores sem contexto em paralelo`);
  let txChecks = 0;
  let standaloneChecks = 0;
  let workersDone = false;

  const worker = async (org: string) => {
    for (let i = 0; i < ITERATIONS; i++) {
      await withOrgContext(org, () =>
        prisma.$transaction(async (tx) => {
          const [a] = await tx.$queryRaw<Probe[]>`SELECT current_setting('app.current_org_id', true) AS v, pg_backend_pid() AS pid`;
          await tx.$executeRaw`SELECT pg_sleep(0.005)`;
          const [b] = await tx.$queryRaw<Probe[]>`SELECT current_setting('app.current_org_id', true) AS v, pg_backend_pid() AS pid`;
          if (a.v !== org || b.v !== org) fail(`transação de ${org} viu ${a.v} / ${b.v}`);
          if (a.pid !== b.pid) fail(`transação de ${org} trocou de processo no meio (${a.pid} → ${b.pid})`);
          note(a.pid, org);
          txChecks++;
        }),
      );
      // Chamada avulsa: caminho `$allOperations` da extensão (transação em array).
      const [c] = await withOrgContext(org, () =>
        prisma.$queryRaw<Probe[]>`SELECT current_setting('app.current_org_id', true) AS v, pg_backend_pid() AS pid`,
      );
      if (c.v !== org) fail(`chamada avulsa de ${org} viu ${c.v}`);
      note(c.pid, org);
      standaloneChecks++;
    }
  };

  const readerPool = new Pool({ connectionString, max: READERS });
  const readerPids = new Set<number>();
  let readerChecks = 0;
  const reader = async () => {
    while (!workersDone) {
      const { rows } = await readerPool.query<Probe>(
        `SELECT current_setting('app.current_org_id', true) AS v, pg_backend_pid() AS pid`,
      );
      const v = rows[0].v;
      if (v && v !== PLACEHOLDER) fail(`VAZAMENTO: leitor sem contexto viu '${v}'${orgSet.has(v) ? " (id de uma das organizações do teste)" : ""} no processo ${rows[0].pid}`);
      readerPids.add(rows[0].pid);
      readerChecks++;
    }
  };

  const readers = Array.from({ length: READERS }, () => reader());
  await Promise.all(orgs.map(worker));
  workersDone = true;
  await Promise.all(readers);
  console.log(`  ${txChecks} transações e ${standaloneChecks} chamadas avulsas conferidas; ${readerChecks} leituras sem contexto`);

  // ── Prova 3: policy de verdade numa tabela temporária ────────────────
  console.log("\n[3] Policy de RLS (tabela temporária, ON COMMIT DROP, RLS forçado)");
  const [orgA, orgB] = orgs;
  const policyRun = (org: string | null) => {
    const body = () =>
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`CREATE TEMP TABLE _pooler_proof (org uuid NOT NULL, label text) ON COMMIT DROP`);
        await tx.$executeRawUnsafe(`INSERT INTO _pooler_proof VALUES ($1::uuid, 'A'), ($2::uuid, 'B')`, orgA, orgB);
        await tx.$executeRawUnsafe(`ALTER TABLE _pooler_proof ENABLE ROW LEVEL SECURITY`);
        await tx.$executeRawUnsafe(`ALTER TABLE _pooler_proof FORCE ROW LEVEL SECURITY`);
        await tx.$executeRawUnsafe(
          `CREATE POLICY _pooler_proof_org ON _pooler_proof USING (org = nullif(current_setting('app.current_org_id', true), '')::uuid)`,
        );
        return tx.$queryRawUnsafe<{ label: string }[]>(`SELECT label FROM _pooler_proof ORDER BY label`);
      });
    return org ? withOrgContext(org, body) : body();
  };
  const seenA = (await policyRun(orgA)).map((r) => r.label).join(",");
  const seenB = (await policyRun(orgB)).map((r) => r.label).join(",");
  const seenNone = (await policyRun(null)).map((r) => r.label).join(",");
  console.log(`  contexto A → [${seenA}]  contexto B → [${seenB}]  sem contexto → [${seenNone}]`);
  if (seenA !== "A") fail(`policy com contexto A devolveu [${seenA}], esperado [A]`);
  if (seenB !== "B") fail(`policy com contexto B devolveu [${seenB}], esperado [B]`);
  if (seenNone !== "") fail(`policy sem contexto devolveu [${seenNone}], esperado nada`);

  // ── Prova 4: reuso de conexão física (controle) ──────────────────────
  console.log("\n[4] Reuso de conexão física (controle — sem reuso, inconclusivo)");
  const sharedPids = [...orgsByPid.entries()].filter(([, s]) => s.size >= 2);
  const readersOnOrgPids = [...readerPids].filter((pid) => orgsByPid.has(pid));
  console.log(
    `  ${orgsByPid.size} processos do Postgres atenderam as organizações; ${sharedPids.length} deles atenderam 2+ organizações ` +
      `(máx. ${Math.max(0, ...sharedPids.map(([, s]) => s.size))}); leitores caíram em ${readersOnOrgPids.length} desses processos`,
  );
  const reuseProven = sharedPids.length > 0 && readersOnOrgPids.length > 0;

  // ── Prova 5: controle negativo — SET de sessão ───────────────────────
  console.log("\n[5] Controle negativo: SET de sessão (sem LOCAL) em app.leak_probe");
  const probeValue = `leak-probe-${randomUUID()}`;
  const setter = new Pool({ connectionString, max: 1 });
  const probeReaders = new Pool({ connectionString, max: 8 });
  const { rows: setRows } = await setter.query<{ pid: number }>(
    `SELECT set_config('app.leak_probe', $1, false), pg_backend_pid() AS pid`,
    [probeValue],
  );
  const setterPid = setRows[0].pid;
  let landedOnSetterPid = 0;
  let sawLeak = 0;
  for (let round = 0; round < 25; round++) {
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        probeReaders.query<Probe>(`SELECT current_setting('app.leak_probe', true) AS v, pg_backend_pid() AS pid`),
      ),
    );
    for (const { rows } of results) {
      if (rows[0].pid === setterPid) landedOnSetterPid++;
      if (rows[0].v === probeValue) sawLeak++;
    }
  }
  await setter.end();
  await probeReaders.end();
  let leakControl: string;
  if (sawLeak > 0) {
    leakControl = `VAZOU: ${sawLeak} leituras de OUTROS clientes viram o SET de sessão — o pooler não limpa estado de sessão; o teste detecta vazamento, e só o LOCAL protege`;
  } else if (landedOnSetterPid > 0) {
    leakControl = `não vazou: ${landedOnSetterPid} leituras caíram no mesmo processo e não viram o valor — o pooler limpa estado de sessão entre clientes`;
  } else {
    leakControl = "inconclusivo: nenhum leitor caiu no processo onde o SET foi feito";
  }
  console.log(`  ${leakControl}`);
  if (REQUIRE_LEAK_DETECTION && sawLeak === 0) {
    fail("controle negativo exigido (POOLER_PROOF_REQUIRE_LEAK_DETECTION=1) e o vazamento do SET de sessão não foi detectado");
  }

  await readerPool.end();
  await prisma.$disconnect();

  // ── Veredito ─────────────────────────────────────────────────────────
  console.log("\n────────────────────────────────────────");
  if (failures.length > 0) {
    console.log(`FALHOU — ${failures.length} problema(s). Contexto de organização NÃO é confiável através deste pooler.`);
    process.exit(1);
  }
  if (!reuseProven) {
    console.log("INCONCLUSIVO — nenhuma conexão física foi compartilhada entre organizações/leitores; as provas não tiveram o que provar. Rodar de novo (mais WORKERS/ITERATIONS).");
    process.exit(2);
  }
  console.log("APROVADO — contexto visível em toda a transação, sem vazamento, policy filtrando, com reuso de conexão física comprovado.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
