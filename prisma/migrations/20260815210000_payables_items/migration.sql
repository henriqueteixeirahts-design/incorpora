-- AlterEnum
ALTER TYPE "DocumentCategory" ADD VALUE 'FISCAL_DOCUMENT';

-- CreateTable
CREATE TABLE "payable_items" (
    "id" UUID NOT NULL,
    "payableId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "payable_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payable_items_payableId_idx" ON "payable_items"("payableId");

-- AddForeignKey
ALTER TABLE "payable_items" ADD CONSTRAINT "payable_items_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "payables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
