-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentCategory" ADD VALUE 'ARTICLES_OF_ASSOCIATION';
ALTER TYPE "DocumentCategory" ADD VALUE 'CNPJ_CARD';
ALTER TYPE "DocumentCategory" ADD VALUE 'CLEARANCE_CERTIFICATE';
ALTER TYPE "DocumentCategory" ADD VALUE 'POWER_OF_ATTORNEY';
ALTER TYPE "DocumentCategory" ADD VALUE 'AFFECTATION_DEED';
ALTER TYPE "DocumentCategory" ADD VALUE 'RET_OPTION_TERM';
ALTER TYPE "DocumentCategory" ADD VALUE 'PERMIT_LICENSE';

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "description" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3);
