-- CreateEnum
CREATE TYPE "TaxRegime" AS ENUM ('ACTUAL_PROFIT', 'PRESUMED_PROFIT', 'SIMPLES_NACIONAL', 'RET');

-- AlterTable
ALTER TABLE "special_purpose_entities" ADD COLUMN     "accountantCrc" TEXT,
ADD COLUMN     "accountantEmail" TEXT,
ADD COLUMN     "accountantName" TEXT,
ADD COLUMN     "accountantPhone" TEXT,
ADD COLUMN     "accountingFirm" TEXT,
ADD COLUMN     "accountingNotes" TEXT,
ADD COLUMN     "chartOfAccountsRef" TEXT,
ADD COLUMN     "dimobRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "efdContributionsRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "event109Cnpj" TEXT,
ADD COLUMN     "externalAccountingCode" TEXT,
ADD COLUMN     "retOptionSince" TIMESTAMP(3),
ADD COLUMN     "taxRegime" "TaxRegime";
