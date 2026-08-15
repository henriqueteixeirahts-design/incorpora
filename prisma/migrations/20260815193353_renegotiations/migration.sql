-- CreateEnum
CREATE TYPE "RenegotiationAgreementStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'SIGNED', 'BROKEN', 'REJECTED');

-- AlterTable
ALTER TABLE "installments" ADD COLUMN     "correctionExempt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "destinationAgreementId" UUID,
ADD COLUMN     "originAgreementId" UUID;

-- CreateTable
CREATE TABLE "renegotiation_rules" (
    "id" UUID NOT NULL,
    "developmentId" UUID NOT NULL,
    "maxDiscountOnChargesPercent" DECIMAL(5,2) NOT NULL DEFAULT 20,
    "maxTermMonths" INTEGER NOT NULL DEFAULT 24,
    "brokenDealGraceDays" INTEGER NOT NULL DEFAULT 15,
    "reactivateOriginalOnBreak" BOOLEAN NOT NULL DEFAULT false,
    "approvalLevels" "ApprovalLevel"[] DEFAULT ARRAY['SALES_MANAGER']::"ApprovalLevel"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "renegotiation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "renegotiation_agreements" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "agreementNumber" TEXT NOT NULL,
    "status" "RenegotiationAgreementStatus" NOT NULL DEFAULT 'DRAFT',
    "agreementDate" TIMESTAMP(3) NOT NULL,
    "consolidatedPrincipal" DECIMAL(14,2) NOT NULL,
    "consolidatedCharges" DECIMAL(14,2) NOT NULL,
    "chargesDiscountPercent" DECIMAL(5,2) NOT NULL,
    "chargesDiscountAmount" DECIMAL(14,2) NOT NULL,
    "downPayment" DECIMAL(14,2),
    "finalValue" DECIMAL(14,2) NOT NULL,
    "applyFutureCorrection" BOOLEAN NOT NULL DEFAULT true,
    "proposedPaymentFlow" JSONB,
    "reason" TEXT,
    "brokenAt" TIMESTAMP(3),
    "reactivatedOriginal" BOOLEAN NOT NULL DEFAULT false,
    "signedAt" TIMESTAMP(3),
    "signedDocumentPath" TEXT,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "renegotiation_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "renegotiation_approvals" (
    "id" UUID NOT NULL,
    "agreementId" UUID NOT NULL,
    "level" "ApprovalLevel" NOT NULL,
    "approverUserId" UUID,
    "decision" "ApprovalDecision" NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "renegotiation_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "renegotiation_rules_developmentId_key" ON "renegotiation_rules"("developmentId");

-- CreateIndex
CREATE UNIQUE INDEX "renegotiation_agreements_contractId_sequenceNumber_key" ON "renegotiation_agreements"("contractId", "sequenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "renegotiation_agreements_organizationId_agreementNumber_key" ON "renegotiation_agreements"("organizationId", "agreementNumber");

-- CreateIndex
CREATE UNIQUE INDEX "renegotiation_approvals_agreementId_level_key" ON "renegotiation_approvals"("agreementId", "level");

-- AddForeignKey
ALTER TABLE "renegotiation_rules" ADD CONSTRAINT "renegotiation_rules_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "developments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renegotiation_agreements" ADD CONSTRAINT "renegotiation_agreements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renegotiation_agreements" ADD CONSTRAINT "renegotiation_agreements_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renegotiation_approvals" ADD CONSTRAINT "renegotiation_approvals_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "renegotiation_agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_originAgreementId_fkey" FOREIGN KEY ("originAgreementId") REFERENCES "renegotiation_agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_destinationAgreementId_fkey" FOREIGN KEY ("destinationAgreementId") REFERENCES "renegotiation_agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

