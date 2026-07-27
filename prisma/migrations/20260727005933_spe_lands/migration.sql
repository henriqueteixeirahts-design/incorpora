-- CreateEnum
CREATE TYPE "LandAcquisitionMethod" AS ENUM ('PURCHASE', 'PHYSICAL_EXCHANGE', 'FINANCIAL_EXCHANGE', 'CAPITAL_CONTRIBUTION', 'OTHER');

-- CreateTable
CREATE TABLE "spe_lands" (
    "id" UUID NOT NULL,
    "speId" UUID NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "registryOffice" TEXT NOT NULL,
    "zipCode" TEXT,
    "street" TEXT,
    "number" TEXT,
    "complement" TEXT,
    "neighborhood" TEXT,
    "city" TEXT,
    "state" VARCHAR(2),
    "totalArea" DECIMAL(12,2) NOT NULL,
    "municipalRegistration" TEXT,
    "acquisitionMethod" "LandAcquisitionMethod",
    "previousOwner" TEXT,
    "acquisitionValue" DECIMAL(14,2),
    "acquisitionDate" TIMESTAMP(3),
    "affectationEstablished" BOOLEAN NOT NULL DEFAULT false,
    "affectationRegisteredAt" TIMESTAMP(3),
    "encumbrances" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spe_lands_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "spe_lands" ADD CONSTRAINT "spe_lands_speId_fkey" FOREIGN KEY ("speId") REFERENCES "special_purpose_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
