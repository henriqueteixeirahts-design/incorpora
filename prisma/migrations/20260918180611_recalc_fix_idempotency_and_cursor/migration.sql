-- Correção do recalculate-installments (deadline 2026-09-25) — idempotência
-- do recálculo (item 2) e checkpoint de retomada dos jobs (item 3).
--
-- financial_calculations: hoje é um "create" incondicional a cada chamada
-- de recalculateInstallment — reprocessar a mesma parcela no mesmo mês
-- (reentrada do job depois de um timeout, ou uma segunda execução manual)
-- duplica linha de auditoria sem motivo. Adiciona "competenceMonth" (dia 1
-- do mês em que o cálculo rodou) e um índice único em
-- (installmentId, competenceMonth): dentro do mesmo mês de competência, a
-- aplicação passa a fazer upsert (código já alterado em
-- src/server/receivables.ts); um novo mês de competência sempre cria linha
-- nova, preservando o histórico entre meses.
--
-- Backfill: toda linha existente usa o mês de "asOfDate" como competência —
-- reflete exatamente quando cada cálculo já existente rodou.
ALTER TABLE "financial_calculations" ADD COLUMN "competenceMonth" DATE;
ALTER TABLE "financial_calculations" ADD COLUMN "updatedAt" TIMESTAMP(3);

UPDATE "financial_calculations"
SET "competenceMonth" = date_trunc('month', "asOfDate")::date,
    "updatedAt" = "createdAt"
WHERE "competenceMonth" IS NULL;

ALTER TABLE "financial_calculations" ALTER COLUMN "competenceMonth" SET NOT NULL;
ALTER TABLE "financial_calculations" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "financial_calculations" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- Pode haver mais de uma linha antiga por (installmentId, mês) no histórico
-- real (o bug que motiva esta correção é justamente a ausência dessa
-- restrição até agora) — mantém só a mais recente de cada grupo antes de
-- criar o índice único, e apaga as duplicatas mais antigas (são histórico
-- de auditoria de um cálculo já superado pelo cálculo mais novo do mesmo
-- mês, não um dado de negócio independente).
DELETE FROM "financial_calculations" fc
USING "financial_calculations" newer
WHERE fc."installmentId" = newer."installmentId"
  AND fc."competenceMonth" = newer."competenceMonth"
  AND fc."createdAt" < newer."createdAt";

CREATE UNIQUE INDEX "financial_calculations_installmentId_competenceMonth_key"
  ON "financial_calculations" ("installmentId", "competenceMonth");

-- job_runs: checkpoint de retomada pra execuções que esgotam o orçamento de
-- tempo (maxDuration=60s do plano Hobby da Vercel) antes de processar toda
-- parcela em aberto. NULL = execução concluída (ou job que não usa
-- checkpoint); não-nulo = retomar dele na próxima invocação.
ALTER TABLE "job_runs" ADD COLUMN "cursor" TEXT;
