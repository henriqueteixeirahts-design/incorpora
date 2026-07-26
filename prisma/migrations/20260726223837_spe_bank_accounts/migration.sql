-- CreateEnum
CREATE TYPE "BankAccountType" AS ENUM ('CHECKING', 'SAVINGS', 'PAYMENT');

-- CreateEnum
CREATE TYPE "BankAccountStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "bankCode" TEXT,
    "bankName" TEXT NOT NULL,
    "agency" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "type" "BankAccountType" NOT NULL,
    "pixKeyType" TEXT,
    "pixKeyValue" TEXT,
    "nickname" TEXT,
    "status" "BankAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spe_bank_accounts" (
    "id" UUID NOT NULL,
    "speId" UUID NOT NULL,
    "bankAccountId" UUID NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spe_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "spe_bank_accounts_speId_bankAccountId_key" ON "spe_bank_accounts"("speId", "bankAccountId");

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spe_bank_accounts" ADD CONSTRAINT "spe_bank_accounts_speId_fkey" FOREIGN KEY ("speId") REFERENCES "special_purpose_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spe_bank_accounts" ADD CONSTRAINT "spe_bank_accounts_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
