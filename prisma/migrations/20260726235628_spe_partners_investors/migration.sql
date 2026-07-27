-- CreateEnum
CREATE TYPE "SpeDocumentHolderType" AS ENUM ('INDIVIDUAL', 'COMPANY');

-- CreateEnum
CREATE TYPE "SpePartnerRole" AS ENUM ('ADMINISTRATOR', 'QUOTAHOLDER', 'OTHER');

-- CreateEnum
CREATE TYPE "SpeInvestorModality" AS ENUM ('EQUITY', 'LOAN', 'PHYSICAL_EXCHANGE', 'FINANCIAL_EXCHANGE', 'OTHER');

-- CreateTable
CREATE TABLE "spe_partners" (
    "id" UUID NOT NULL,
    "speId" UUID NOT NULL,
    "type" "SpeDocumentHolderType" NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "participationPct" DECIMAL(6,3) NOT NULL,
    "role" "SpePartnerRole",
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spe_partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spe_investors" (
    "id" UUID NOT NULL,
    "speId" UUID NOT NULL,
    "type" "SpeDocumentHolderType" NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "modality" "SpeInvestorModality" NOT NULL,
    "contributedCapital" DECIMAL(14,2),
    "resultParticipationPct" DECIMAL(6,3),
    "contributionDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spe_investors_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "spe_partners" ADD CONSTRAINT "spe_partners_speId_fkey" FOREIGN KEY ("speId") REFERENCES "special_purpose_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spe_investors" ADD CONSTRAINT "spe_investors_speId_fkey" FOREIGN KEY ("speId") REFERENCES "special_purpose_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
