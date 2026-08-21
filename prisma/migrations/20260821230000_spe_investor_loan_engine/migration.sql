-- docs/ESPEC_APORTES_INVESTIDORES.md, Etapa 5 (motor de mútuo). Aditiva.

-- AlterTable: spe_investors — tipo de juros do mútuo (reaproveita o enum InterestType já existente)
ALTER TABLE "spe_investors" ADD COLUMN "loanInterestType" "InterestType";

-- AlterTable: spe_investor_returns — composição juros/principal da amortização
ALTER TABLE "spe_investor_returns" ADD COLUMN "amortizedInterest" DECIMAL(14,2);
ALTER TABLE "spe_investor_returns" ADD COLUMN "amortizedPrincipal" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "spe_investor_loan_calculations" (
    "id" UUID NOT NULL,
    "investorId" UUID NOT NULL,
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "totalPrincipal" DECIMAL(14,2) NOT NULL,
    "totalAccruedInterest" DECIMAL(14,2) NOT NULL,
    "totalAmortized" DECIMAL(14,2) NOT NULL,
    "netBalance" DECIMAL(14,2) NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spe_investor_loan_calculations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "spe_investor_loan_calculations_investorId_idx" ON "spe_investor_loan_calculations"("investorId");

ALTER TABLE "spe_investor_loan_calculations" ADD CONSTRAINT "spe_investor_loan_calculations_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "spe_investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
