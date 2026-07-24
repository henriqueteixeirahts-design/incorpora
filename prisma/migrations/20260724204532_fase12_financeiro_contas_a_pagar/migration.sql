-- CreateEnum
CREATE TYPE "PayableCategory" AS ENUM ('CONSTRUCTION', 'LAND', 'PROJECTS', 'APPROVALS', 'NOTARY', 'MARKETING', 'AGENCY', 'MEDIA', 'SALES_BOOTH', 'SALES_BOOTH_MAINTENANCE', 'SALES_TEAM', 'BROKERAGE', 'FEES', 'TAXES', 'LEGAL', 'ACCOUNTING', 'INSURANCE', 'BANK_FEES', 'UTILITIES', 'ADMINISTRATION', 'CANCELLATION_REFUND', 'OTHER');

-- CreateEnum
CREATE TYPE "PayableStatus" AS ENUM ('ENTERED', 'REVIEWED', 'APPROVED', 'SCHEDULED', 'PAID', 'RECONCILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_centers" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "developmentId" UUID,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payables" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "developmentId" UUID,
    "speId" UUID,
    "supplierId" UUID,
    "costCenterId" UUID,
    "category" "PayableCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "competenceDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paymentMethod" TEXT,
    "bankAccount" TEXT,
    "fiscalDocument" TEXT,
    "contractId" UUID,
    "status" "PayableStatus" NOT NULL DEFAULT 'ENTERED',
    "paidAt" TIMESTAMP(3),
    "paidAmount" DECIMAL(14,2),
    "notes" TEXT,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cost_centers_organizationId_name_key" ON "cost_centers"("organizationId", "name");

-- CreateIndex
CREATE INDEX "payables_organizationId_status_idx" ON "payables"("organizationId", "status");

-- CreateIndex
CREATE INDEX "payables_organizationId_developmentId_idx" ON "payables"("organizationId", "developmentId");

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "developments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "developments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_speId_fkey" FOREIGN KEY ("speId") REFERENCES "special_purpose_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
