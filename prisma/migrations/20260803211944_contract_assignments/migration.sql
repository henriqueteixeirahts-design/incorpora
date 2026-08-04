-- CreateEnum
CREATE TYPE "ContractAssignmentStatus" AS ENUM ('DRAFT', 'SIGNED');

-- CreateTable
CREATE TABLE "contract_assignments" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "assignmentNumber" TEXT NOT NULL,
    "previousCustomerId" UUID NOT NULL,
    "newCustomerId" UUID NOT NULL,
    "status" "ContractAssignmentStatus" NOT NULL DEFAULT 'DRAFT',
    "assignmentDate" TIMESTAMP(3) NOT NULL,
    "feeAmount" DECIMAL(14,2),
    "notes" TEXT,
    "signedAt" TIMESTAMP(3),
    "signedDocumentPath" TEXT,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contract_assignments_contractId_sequenceNumber_key" ON "contract_assignments"("contractId", "sequenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "contract_assignments_organizationId_assignmentNumber_key" ON "contract_assignments"("organizationId", "assignmentNumber");

-- AddForeignKey
ALTER TABLE "contract_assignments" ADD CONSTRAINT "contract_assignments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_assignments" ADD CONSTRAINT "contract_assignments_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_assignments" ADD CONSTRAINT "contract_assignments_previousCustomerId_fkey" FOREIGN KEY ("previousCustomerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_assignments" ADD CONSTRAINT "contract_assignments_newCustomerId_fkey" FOREIGN KEY ("newCustomerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

