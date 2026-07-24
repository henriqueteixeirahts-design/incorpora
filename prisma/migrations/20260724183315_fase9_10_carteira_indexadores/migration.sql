-- CreateEnum
CREATE TYPE "IndexCode" AS ENUM ('INCC', 'IPCA', 'IGPM', 'FIXED');

-- CreateEnum
CREATE TYPE "InterestType" AS ENUM ('SIMPLE', 'COMPOUND');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InstallmentStatus" ADD VALUE 'PARTIALLY_PAID';
ALTER TYPE "InstallmentStatus" ADD VALUE 'OVERDUE';

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "indexRuleId" UUID,
ADD COLUMN     "interestType" "InterestType" NOT NULL DEFAULT 'COMPOUND',
ADD COLUMN     "latePaymentFinePercent" DECIMAL(5,2) NOT NULL DEFAULT 2,
ADD COLUMN     "latePaymentMonthlyInterestPercent" DECIMAL(5,2) NOT NULL DEFAULT 1,
ADD COLUMN     "monthlyInterestPercent" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "installments" ADD COLUMN     "correctedValue" DECIMAL(14,2),
ADD COLUMN     "lastCalculatedAt" TIMESTAMP(3),
ADD COLUMN     "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "installment_payments" (
    "id" UUID NOT NULL,
    "installmentId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "method" TEXT,
    "notes" TEXT,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "installment_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "index_rules" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" "IndexCode" NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "index_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "index_values" (
    "id" UUID NOT NULL,
    "indexRuleId" UUID NOT NULL,
    "referenceMonth" TIMESTAMP(3) NOT NULL,
    "ratePercent" DECIMAL(7,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "index_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_calculations" (
    "id" UUID NOT NULL,
    "installmentId" UUID NOT NULL,
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "baseValue" DECIMAL(14,2) NOT NULL,
    "indexFactor" DECIMAL(10,6) NOT NULL,
    "interestFactor" DECIMAL(10,6) NOT NULL,
    "correctedValue" DECIMAL(14,2) NOT NULL,
    "daysOverdue" INTEGER NOT NULL,
    "fineAmount" DECIMAL(14,2) NOT NULL,
    "overdueInterestAmount" DECIMAL(14,2) NOT NULL,
    "resultValue" DECIMAL(14,2) NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_calculations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "index_rules_organizationId_code_name_key" ON "index_rules"("organizationId", "code", "name");

-- CreateIndex
CREATE UNIQUE INDEX "index_values_indexRuleId_referenceMonth_key" ON "index_values"("indexRuleId", "referenceMonth");

-- CreateIndex
CREATE INDEX "financial_calculations_installmentId_idx" ON "financial_calculations"("installmentId");

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_indexRuleId_fkey" FOREIGN KEY ("indexRuleId") REFERENCES "index_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_payments" ADD CONSTRAINT "installment_payments_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "installments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "index_rules" ADD CONSTRAINT "index_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "index_values" ADD CONSTRAINT "index_values_indexRuleId_fkey" FOREIGN KEY ("indexRuleId") REFERENCES "index_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_calculations" ADD CONSTRAINT "financial_calculations_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "installments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
