-- docs/ESPEC_PERMUTANTES.md, Etapas 3-4 (repasse físico sob gestão + motor
-- de apuração financeira). Aditiva.

-- CreateEnum
CREATE TYPE "ExchangeRetentionReleaseTrigger" AS ENUM ('HABITE_SE', 'DELIVERY', 'FIXED_DATE', 'CONSTRUCTION_PROGRESS');

-- CreateEnum
CREATE TYPE "ExchangeIncidenceScope" AS ENUM ('ALL_UNITS', 'SPECIFIC_UNITS', 'VALUE_CAP');

-- CreateEnum
CREATE TYPE "ExchangePayoutFlow" AS ENUM ('ON_RECEIPT', 'MONTHLY_CONSOLIDATED', 'MILESTONES');

-- CreateEnum
CREATE TYPE "ExchangeDeductionBase" AS ENUM ('GROSS', 'NET');

-- CreateEnum
CREATE TYPE "ExchangeApurationPeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterEnum
ALTER TYPE "PayableCategory" ADD VALUE 'EXCHANGE_REPASSE';
ALTER TYPE "PayableCategory" ADD VALUE 'EXCHANGE_RETENTION_RELEASE';

-- AlterTable: exchange_contracts — retenção da física sob gestão
ALTER TABLE "exchange_contracts" ADD COLUMN "retentionPct" DECIMAL(6,3),
ADD COLUMN "retentionReleaseDate" TIMESTAMP(3),
ADD COLUMN "retentionReleaseTrigger" "ExchangeRetentionReleaseTrigger";

-- AlterTable: suppliers — find-or-create pro permutante, mesmo padrão de investidor/corretor
ALTER TABLE "suppliers" ADD COLUMN "permutanteId" UUID;

-- CreateTable
CREATE TABLE "exchange_contract_financial_terms" (
    "id" UUID NOT NULL,
    "exchangeContractId" UUID NOT NULL,
    "percent" DECIMAL(6,3) NOT NULL,
    "incidenceScope" "ExchangeIncidenceScope" NOT NULL DEFAULT 'ALL_UNITS',
    "incidenceCapValue" DECIMAL(14,2),
    "payoutFlow" "ExchangePayoutFlow" NOT NULL,
    "milestoneDescription" TEXT,
    "milestoneTargetUnitsSoldPct" DECIMAL(6,3),
    "deductionBase" "ExchangeDeductionBase" NOT NULL DEFAULT 'GROSS',
    "deductCommission" BOOLEAN NOT NULL DEFAULT false,
    "deductTax" BOOLEAN NOT NULL DEFAULT false,
    "retentionPct" DECIMAL(6,3),
    "retentionReleaseTrigger" "ExchangeRetentionReleaseTrigger",
    "retentionReleaseDate" TIMESTAMP(3),
    "correctionIndexRuleId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exchange_contract_financial_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_contract_financial_units" (
    "id" UUID NOT NULL,
    "financialTermsId" UUID NOT NULL,
    "unitId" UUID NOT NULL,

    CONSTRAINT "exchange_contract_financial_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_apuration_periods" (
    "id" UUID NOT NULL,
    "exchangeContractId" UUID NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "ExchangeApurationPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "commissionDeduction" DECIMAL(14,2),
    "taxDeduction" DECIMAL(14,2),
    "deductionsInformedByUserId" UUID,
    "deductionsInformedAt" TIMESTAMP(3),
    "retainedAmount" DECIMAL(14,2),
    "netAmount" DECIMAL(14,2),
    "payableId" UUID,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_apuration_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_repasses" (
    "id" UUID NOT NULL,
    "exchangeContractId" UUID NOT NULL,
    "apurationPeriodId" UUID,
    "installmentPaymentId" UUID NOT NULL,
    "grossBase" DECIMAL(14,2) NOT NULL,
    "administrationFeeAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "externalCommissionAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "internalCommissionAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "share" DECIMAL(14,2) NOT NULL,
    "payableId" UUID,
    "referenceDate" TIMESTAMP(3) NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_repasses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_retention_releases" (
    "id" UUID NOT NULL,
    "exchangeContractId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "releaseDate" TIMESTAMP(3) NOT NULL,
    "payableId" UUID NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_retention_releases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exchange_contract_financial_terms_exchangeContractId_key" ON "exchange_contract_financial_terms"("exchangeContractId");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_contract_financial_units_financialTermsId_unitId_key" ON "exchange_contract_financial_units"("financialTermsId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_apuration_periods_payableId_key" ON "exchange_apuration_periods"("payableId");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_repasses_payableId_key" ON "exchange_repasses"("payableId");

-- CreateIndex
CREATE INDEX "exchange_repasses_exchangeContractId_idx" ON "exchange_repasses"("exchangeContractId");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_retention_releases_payableId_key" ON "exchange_retention_releases"("payableId");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_permutanteId_key" ON "suppliers"("permutanteId");

-- AddForeignKey
ALTER TABLE "exchange_contract_financial_terms" ADD CONSTRAINT "exchange_contract_financial_terms_exchangeContractId_fkey" FOREIGN KEY ("exchangeContractId") REFERENCES "exchange_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_contract_financial_terms" ADD CONSTRAINT "exchange_contract_financial_terms_correctionIndexRuleId_fkey" FOREIGN KEY ("correctionIndexRuleId") REFERENCES "index_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_contract_financial_units" ADD CONSTRAINT "exchange_contract_financial_units_financialTermsId_fkey" FOREIGN KEY ("financialTermsId") REFERENCES "exchange_contract_financial_terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_contract_financial_units" ADD CONSTRAINT "exchange_contract_financial_units_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_apuration_periods" ADD CONSTRAINT "exchange_apuration_periods_exchangeContractId_fkey" FOREIGN KEY ("exchangeContractId") REFERENCES "exchange_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_apuration_periods" ADD CONSTRAINT "exchange_apuration_periods_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "payables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_repasses" ADD CONSTRAINT "exchange_repasses_exchangeContractId_fkey" FOREIGN KEY ("exchangeContractId") REFERENCES "exchange_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_repasses" ADD CONSTRAINT "exchange_repasses_apurationPeriodId_fkey" FOREIGN KEY ("apurationPeriodId") REFERENCES "exchange_apuration_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_repasses" ADD CONSTRAINT "exchange_repasses_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "payables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_retention_releases" ADD CONSTRAINT "exchange_retention_releases_exchangeContractId_fkey" FOREIGN KEY ("exchangeContractId") REFERENCES "exchange_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_retention_releases" ADD CONSTRAINT "exchange_retention_releases_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "payables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_permutanteId_fkey" FOREIGN KEY ("permutanteId") REFERENCES "permutantes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
