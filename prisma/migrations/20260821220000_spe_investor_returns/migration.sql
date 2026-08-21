-- docs/ESPEC_APORTES_INVESTIDORES.md, Etapa 4 (devoluções/distribuições). Aditiva.

-- AlterEnum
ALTER TYPE "PayableCategory" ADD VALUE 'INVESTOR_RETURN';
ALTER TYPE "PayableCategory" ADD VALUE 'RESULT_DISTRIBUTION';

-- AlterTable: suppliers — find-or-create pro investidor, mesmo padrão de broker/agency/customer
ALTER TABLE "suppliers" ADD COLUMN "speInvestorId" UUID;
CREATE UNIQUE INDEX "suppliers_speInvestorId_key" ON "suppliers"("speInvestorId");
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_speInvestorId_fkey" FOREIGN KEY ("speInvestorId") REFERENCES "spe_investors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "SpeInvestorReturnType" AS ENUM ('RESULT_DISTRIBUTION', 'LOAN_AMORTIZATION');

-- CreateTable
CREATE TABLE "spe_investor_returns" (
    "id" UUID NOT NULL,
    "investorId" UUID NOT NULL,
    "type" "SpeInvestorReturnType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "referenceDate" TIMESTAMP(3) NOT NULL,
    "payableId" UUID NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spe_investor_returns_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "spe_investor_returns_payableId_key" ON "spe_investor_returns"("payableId");

ALTER TABLE "spe_investor_returns" ADD CONSTRAINT "spe_investor_returns_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "spe_investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "spe_investor_returns" ADD CONSTRAINT "spe_investor_returns_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "payables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
