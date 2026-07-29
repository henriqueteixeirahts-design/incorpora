-- CreateEnum
CREATE TYPE "SpeInvestorLoanInterestPeriod" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "SpeContributionForecastOrigin" AS ENUM ('CASH_FLOW_PLANNING', 'PUNCTUAL_AGREEMENT', 'CAPITAL_CALL');

-- CreateEnum
CREATE TYPE "SpeContributionForecastStatus" AS ENUM ('PLANNED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED');

-- AlterTable
ALTER TABLE "spe_investors" ADD COLUMN     "committedCapital" DECIMAL(14,2),
ADD COLUMN     "loanGraceMonths" INTEGER,
ADD COLUMN     "loanIndexRuleId" UUID,
ADD COLUMN     "loanInterestPeriod" "SpeInvestorLoanInterestPeriod",
ADD COLUMN     "loanInterestRate" DECIMAL(6,3),
ADD COLUMN     "loanTermMonths" INTEGER,
ADD COLUMN     "returnBankAccount" TEXT,
ADD COLUMN     "returnBankAgency" TEXT,
ADD COLUMN     "returnBankName" TEXT,
ADD COLUMN     "returnPixKeyType" TEXT,
ADD COLUMN     "returnPixKeyValue" TEXT;

-- CreateTable
CREATE TABLE "spe_investor_contribution_forecasts" (
    "id" UUID NOT NULL,
    "investorId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "expectedDate" TIMESTAMP(3) NOT NULL,
    "origin" "SpeContributionForecastOrigin" NOT NULL,
    "status" "SpeContributionForecastStatus" NOT NULL DEFAULT 'PLANNED',
    "cancelReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spe_investor_contribution_forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spe_investor_contributions" (
    "id" UUID NOT NULL,
    "investorId" UUID NOT NULL,
    "forecastId" UUID,
    "amount" DECIMAL(14,2) NOT NULL,
    "creditDate" TIMESTAMP(3) NOT NULL,
    "bankAccountId" UUID NOT NULL,
    "method" TEXT,
    "receiptFilePath" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spe_investor_contributions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "spe_investors" ADD CONSTRAINT "spe_investors_loanIndexRuleId_fkey" FOREIGN KEY ("loanIndexRuleId") REFERENCES "index_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spe_investor_contribution_forecasts" ADD CONSTRAINT "spe_investor_contribution_forecasts_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "spe_investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spe_investor_contributions" ADD CONSTRAINT "spe_investor_contributions_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "spe_investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spe_investor_contributions" ADD CONSTRAINT "spe_investor_contributions_forecastId_fkey" FOREIGN KEY ("forecastId") REFERENCES "spe_investor_contribution_forecasts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spe_investor_contributions" ADD CONSTRAINT "spe_investor_contributions_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
