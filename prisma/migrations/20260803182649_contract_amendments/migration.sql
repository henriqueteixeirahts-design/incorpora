-- CreateEnum
CREATE TYPE "ContractAmendmentType" AS ENUM ('FLOW_RENEGOTIATION', 'UNIT_CHANGE', 'TERM_CHANGE', 'OTHER');

-- CreateEnum
CREATE TYPE "ContractAmendmentStatus" AS ENUM ('DRAFT', 'SIGNED');

-- CreateTable
CREATE TABLE "contract_amendments" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "amendmentNumber" TEXT NOT NULL,
    "type" "ContractAmendmentType" NOT NULL,
    "status" "ContractAmendmentStatus" NOT NULL DEFAULT 'DRAFT',
    "proposedPaymentFlow" JSONB,
    "notes" TEXT,
    "signedAt" TIMESTAMP(3),
    "signedDocumentPath" TEXT,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_amendments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contract_amendments_contractId_sequenceNumber_key" ON "contract_amendments"("contractId", "sequenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "contract_amendments_organizationId_amendmentNumber_key" ON "contract_amendments"("organizationId", "amendmentNumber");

-- AddForeignKey
ALTER TABLE "contract_amendments" ADD CONSTRAINT "contract_amendments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_amendments" ADD CONSTRAINT "contract_amendments_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
