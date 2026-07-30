-- CreateEnum
CREATE TYPE "DownPaymentDestination" AS ENUM ('SPE_ACCOUNT', 'BROKER_COMMISSION');

-- CreateEnum
CREATE TYPE "RatePeriod" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "ProposalEvaluationStatus" AS ENUM ('APPROVED_AUTO', 'PENDING_ANALYSIS', 'REJECTED_AUTO');

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "downPaymentCommissionExcess" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "proposals" ADD COLUMN     "evaluationChecks" JSONB,
ADD COLUMN     "evaluationReason" TEXT,
ADD COLUMN     "evaluationStatus" "ProposalEvaluationStatus",
ADD COLUMN     "npvDeviationPercent" DECIMAL(7,3),
ADD COLUMN     "npvProposed" DECIMAL(14,2),
ADD COLUMN     "npvStandard" DECIMAL(14,2),
ADD COLUMN     "proposedPaymentFlow" JSONB;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "downPaymentDestinationOverride" "DownPaymentDestination";

-- AlterTable
ALTER TABLE "sales_tables" ADD COLUMN     "downPaymentDestination" "DownPaymentDestination" NOT NULL DEFAULT 'SPE_ACCOUNT',
ADD COLUMN     "preHabiteSeIndexRuleId" UUID,
ADD COLUMN     "preHabiteSeInterestType" "InterestType" NOT NULL DEFAULT 'COMPOUND',
ADD COLUMN     "preHabiteSeMonthlyInterestPercent" DECIMAL(5,2);

-- CreateTable
CREATE TABLE "proposal_evaluation_rules" (
    "id" UUID NOT NULL,
    "developmentId" UUID NOT NULL,
    "allowOffTable" BOOLEAN NOT NULL DEFAULT true,
    "discountRatePercent" DECIMAL(6,3) NOT NULL DEFAULT 1,
    "discountRatePeriod" "RatePeriod" NOT NULL DEFAULT 'MONTHLY',
    "vplTolerancePercent" DECIMAL(6,3) NOT NULL DEFAULT 3,
    "vplAnalysisLimitPercent" DECIMAL(6,3) NOT NULL DEFAULT 10,
    "minDownPaymentPercent" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "maxTermMonths" INTEGER NOT NULL DEFAULT 120,
    "maxPostKeysPercent" DECIMAL(5,2) NOT NULL DEFAULT 30,
    "analysisApprovalLevels" "ApprovalLevel"[] DEFAULT ARRAY['SALES_MANAGER']::"ApprovalLevel"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proposal_evaluation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proposal_evaluation_rules_developmentId_key" ON "proposal_evaluation_rules"("developmentId");

-- AddForeignKey
ALTER TABLE "sales_tables" ADD CONSTRAINT "sales_tables_preHabiteSeIndexRuleId_fkey" FOREIGN KEY ("preHabiteSeIndexRuleId") REFERENCES "index_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_evaluation_rules" ADD CONSTRAINT "proposal_evaluation_rules_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "developments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
