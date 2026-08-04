-- CreateEnum
CREATE TYPE "ContractDistratoStatus" AS ENUM ('DRAFT', 'SIGNED');

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "customerId" UUID;

-- CreateTable
CREATE TABLE "distrato_rules" (
    "id" UUID NOT NULL,
    "developmentId" UUID NOT NULL,
    "retentionPercent" DECIMAL(5,2) NOT NULL DEFAULT 25,
    "reverseCommissionOnDistrato" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "distrato_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_distratos" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "distratoNumber" TEXT NOT NULL,
    "status" "ContractDistratoStatus" NOT NULL DEFAULT 'DRAFT',
    "totalPaid" DECIMAL(14,2) NOT NULL,
    "retentionPercent" DECIMAL(5,2) NOT NULL,
    "retentionAmount" DECIMAL(14,2) NOT NULL,
    "brokerageDeductionAmount" DECIMAL(14,2),
    "occupancyFeeAmount" DECIMAL(14,2),
    "refundAmount" DECIMAL(14,2) NOT NULL,
    "refundDueDate" TIMESTAMP(3) NOT NULL,
    "refundTerms" TEXT,
    "refundPayableId" UUID,
    "reason" TEXT,
    "signedAt" TIMESTAMP(3),
    "signedDocumentPath" TEXT,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_distratos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "distrato_rules_developmentId_key" ON "distrato_rules"("developmentId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_distratos_contractId_key" ON "contract_distratos"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_distratos_refundPayableId_key" ON "contract_distratos"("refundPayableId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_distratos_organizationId_distratoNumber_key" ON "contract_distratos"("organizationId", "distratoNumber");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_customerId_key" ON "suppliers"("customerId");

-- AddForeignKey
ALTER TABLE "distrato_rules" ADD CONSTRAINT "distrato_rules_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "developments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_distratos" ADD CONSTRAINT "contract_distratos_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_distratos" ADD CONSTRAINT "contract_distratos_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_distratos" ADD CONSTRAINT "contract_distratos_refundPayableId_fkey" FOREIGN KEY ("refundPayableId") REFERENCES "payables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

