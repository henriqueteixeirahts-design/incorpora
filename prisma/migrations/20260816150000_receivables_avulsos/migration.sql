-- CreateEnum
CREATE TYPE "ReceivableCategory" AS ENUM ('ASSIGNMENT_FEE', 'SPACE_RENTAL', 'REFUND', 'YIELD', 'OTHER');

-- CreateEnum
CREATE TYPE "ReceivableStatus" AS ENUM ('PENDING', 'RECEIVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "receivables" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "developmentId" UUID,
    "speId" UUID,
    "customerId" UUID,
    "category" "ReceivableCategory" NOT NULL,
    "origin" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "ReceivableStatus" NOT NULL DEFAULT 'PENDING',
    "receivedAt" TIMESTAMP(3),
    "receivedAmount" DECIMAL(14,2),
    "notes" TEXT,
    "contractAssignmentId" UUID,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receivables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "receivables_contractAssignmentId_key" ON "receivables"("contractAssignmentId");

-- CreateIndex
CREATE INDEX "receivables_organizationId_status_idx" ON "receivables"("organizationId", "status");

-- CreateIndex
CREATE INDEX "receivables_organizationId_developmentId_idx" ON "receivables"("organizationId", "developmentId");

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "developments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_speId_fkey" FOREIGN KEY ("speId") REFERENCES "special_purpose_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_contractAssignmentId_fkey" FOREIGN KEY ("contractAssignmentId") REFERENCES "contract_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
