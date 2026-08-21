-- docs/ESPEC_CORRETOR_COMISSIONAMENTO.md — Etapa 1 (schema only, sem mudança
-- de comportamento). Aditiva: nenhuma coluna/tabela existente é removida;
-- CommissionSplit.payableId/payable ficam intocados pro fluxo legado.

-- CreateEnum
CREATE TYPE "BrokerRole" AS ENUM ('BROKER', 'MANAGER');

-- CreateEnum
CREATE TYPE "SplitTierKind" AS ENUM ('FIXED_AGENCY', 'FIXED_BROKER', 'DYNAMIC_BROKER_OF_SALE', 'DYNAMIC_MANAGER_OF_BROKER');

-- CreateEnum
CREATE TYPE "ExternalCommissionStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InternalCommissionAppliesTo" AS ENUM ('ALL_SALES', 'PARTICIPATED_ONLY');

-- CreateEnum
CREATE TYPE "PartnershipPartnerType" AS ENUM ('AGENCY', 'AUTONOMOUS_BROKER');

-- CreateEnum
CREATE TYPE "PartnershipAgreementStatus" AS ENUM ('DRAFT', 'SIGNED');

-- AlterEnum (novos tipos de template pra Parte 5 — contratos de parceria)
ALTER TYPE "DocumentTemplateType" ADD VALUE 'PARTNERSHIP_AGENCY';
ALTER TYPE "DocumentTemplateType" ADD VALUE 'PARTNERSHIP_BROKER';

-- AlterTable: real_estate_agencies — endereço + auditoria + os 2 beneficiários fixos do split
ALTER TABLE "real_estate_agencies"
  ADD COLUMN "zipCode" TEXT,
  ADD COLUMN "street" TEXT,
  ADD COLUMN "number" TEXT,
  ADD COLUMN "complement" TEXT,
  ADD COLUMN "neighborhood" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "state" VARCHAR(2),
  ADD COLUMN "regionalManagerBrokerId" UUID,
  ADD COLUMN "productManagerBrokerId" UUID,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "real_estate_agencies_organizationId_document_key" ON "real_estate_agencies"("organizationId", "document");

-- AlterTable: brokers — endereço + auditoria + hierarquia + faturamento
ALTER TABLE "brokers"
  ADD COLUMN "managerId" UUID,
  ADD COLUMN "role" "BrokerRole" NOT NULL DEFAULT 'BROKER',
  ADD COLUMN "creci" TEXT,
  ADD COLUMN "zipCode" TEXT,
  ADD COLUMN "street" TEXT,
  ADD COLUMN "number" TEXT,
  ADD COLUMN "complement" TEXT,
  ADD COLUMN "neighborhood" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "state" VARCHAR(2),
  ADD COLUMN "billingType" "CustomerType",
  ADD COLUMN "billingDocument" TEXT,
  ADD COLUMN "billingName" TEXT,
  ADD COLUMN "billingBankName" TEXT,
  ADD COLUMN "billingBankAgency" TEXT,
  ADD COLUMN "billingBankAccount" TEXT,
  ADD COLUMN "billingPixKey" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "brokers_organizationId_document_key" ON "brokers"("organizationId", "document");

ALTER TABLE "brokers" ADD CONSTRAINT "brokers_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "brokers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: agency_split_tiers
CREATE TABLE "agency_split_tiers" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "percent" DECIMAL(5,2) NOT NULL,
    "kind" "SplitTierKind" NOT NULL,
    "fixedBrokerId" UUID,
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agency_split_tiers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agency_split_tiers_agencyId_idx" ON "agency_split_tiers"("agencyId");

ALTER TABLE "agency_split_tiers" ADD CONSTRAINT "agency_split_tiers_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "real_estate_agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: commission_rules
CREATE TABLE "commission_rules" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "developmentId" UUID,
    "externalCommissionPercent" DECIMAL(5,2),
    "internalCommissionPercent" DECIMAL(5,2),
    "internalCommissionAppliesTo" "InternalCommissionAppliesTo" NOT NULL DEFAULT 'ALL_SALES',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "commission_rules_developmentId_key" ON "commission_rules"("developmentId");

ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "developments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: external_commission_splits
CREATE TABLE "external_commission_splits" (
    "id" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "beneficiaryType" "CommissionBeneficiaryType" NOT NULL,
    "brokerId" UUID,
    "agencyId" UUID,
    "label" TEXT,
    "percent" DECIMAL(5,2) NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "ExternalCommissionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_commission_splits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "external_commission_splits_saleId_idx" ON "external_commission_splits"("saleId");

ALTER TABLE "external_commission_splits" ADD CONSTRAINT "external_commission_splits_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: commission_splits — acúmulo proporcional (Natureza 2, regime caixa)
ALTER TABLE "commission_splits"
  ADD COLUMN "accruedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "settledAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable: commission_split_payables (liquidação consolidada — join table)
CREATE TABLE "commission_split_payables" (
    "id" UUID NOT NULL,
    "splitId" UUID NOT NULL,
    "payableId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_split_payables_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "commission_split_payables_splitId_idx" ON "commission_split_payables"("splitId");
CREATE INDEX "commission_split_payables_payableId_idx" ON "commission_split_payables"("payableId");

ALTER TABLE "commission_split_payables" ADD CONSTRAINT "commission_split_payables_splitId_fkey" FOREIGN KEY ("splitId") REFERENCES "commission_splits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "commission_split_payables" ADD CONSTRAINT "commission_split_payables_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "payables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: installments — fracionamento pra comissão externa (Natureza 1)
ALTER TABLE "installments" ADD COLUMN "externalCommissionPortion" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable: sales — gerente interno creditado (Natureza 2, PARTICIPATED_ONLY)
ALTER TABLE "sales" ADD COLUMN "internalManagerBrokerId" UUID;

-- CreateTable: partnership_agreements
CREATE TABLE "partnership_agreements" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "partnerType" "PartnershipPartnerType" NOT NULL,
    "agencyId" UUID,
    "brokerId" UUID,
    "templateId" UUID,
    "documentPath" TEXT,
    "status" "PartnershipAgreementStatus" NOT NULL DEFAULT 'DRAFT',
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partnership_agreements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "partnership_agreements_organizationId_idx" ON "partnership_agreements"("organizationId");

ALTER TABLE "partnership_agreements" ADD CONSTRAINT "partnership_agreements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "partnership_agreements" ADD CONSTRAINT "partnership_agreements_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "document_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
