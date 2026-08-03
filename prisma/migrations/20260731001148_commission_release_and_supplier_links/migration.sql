-- CreateEnum
CREATE TYPE "CommissionReleaseTrigger" AS ENUM ('ON_CONTRACT_SIGNATURE', 'ON_DOWN_PAYMENT_RECEIVED', 'ON_INSTALLMENTS_PAID_PERCENT');

-- AlterEnum
ALTER TYPE "CommissionStatus" ADD VALUE 'RELEASED';

-- AlterTable
ALTER TABLE "commission_splits" ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "payableId" UUID,
ADD COLUMN     "releasedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "installments" ADD COLUMN     "isDownPayment" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "agencyId" UUID,
ADD COLUMN     "brokerId" UUID;

-- CreateTable
CREATE TABLE "commission_release_rules" (
    "id" UUID NOT NULL,
    "developmentId" UUID NOT NULL,
    "trigger" "CommissionReleaseTrigger" NOT NULL DEFAULT 'ON_CONTRACT_SIGNATURE',
    "installmentsPaidPercent" INTEGER NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_release_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "commission_release_rules_developmentId_key" ON "commission_release_rules"("developmentId");

-- CreateIndex
CREATE UNIQUE INDEX "commission_splits_payableId_key" ON "commission_splits"("payableId");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_brokerId_key" ON "suppliers"("brokerId");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_agencyId_key" ON "suppliers"("agencyId");

-- AddForeignKey
ALTER TABLE "commission_splits" ADD CONSTRAINT "commission_splits_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "payables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_release_rules" ADD CONSTRAINT "commission_release_rules_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "developments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "brokers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "real_estate_agencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

