-- CreateEnum
CREATE TYPE "ExchangeContractType" AS ENUM ('PHYSICAL', 'FINANCIAL', 'MIXED');

-- CreateEnum
CREATE TYPE "ExchangeContractStatus" AS ENUM ('ACTIVE', 'SETTLED', 'TERMINATED');

-- AlterTable
ALTER TABLE "units" ADD COLUMN     "exchangeContractId" UUID;

-- CreateTable
CREATE TABLE "permutantes" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "type" "CustomerType" NOT NULL DEFAULT 'INDIVIDUAL',
    "name" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "zipCode" TEXT,
    "street" TEXT,
    "number" TEXT,
    "complement" TEXT,
    "neighborhood" TEXT,
    "city" TEXT,
    "state" VARCHAR(2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permutantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_contracts" (
    "id" UUID NOT NULL,
    "developmentId" UUID NOT NULL,
    "permutanteId" UUID NOT NULL,
    "type" "ExchangeContractType" NOT NULL,
    "appraisalValue" DECIMAL(14,2),
    "contractDate" TIMESTAMP(3) NOT NULL,
    "contractDocumentPath" TEXT,
    "notes" TEXT,
    "status" "ExchangeContractStatus" NOT NULL DEFAULT 'ACTIVE',
    "managedBySystem" BOOLEAN,
    "administrationFeePct" DECIMAL(6,3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exchange_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_contract_lands" (
    "id" UUID NOT NULL,
    "exchangeContractId" UUID NOT NULL,
    "landId" UUID NOT NULL,

    CONSTRAINT "exchange_contract_lands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "permutantes_organizationId_document_key" ON "permutantes"("organizationId", "document");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_contract_lands_exchangeContractId_landId_key" ON "exchange_contract_lands"("exchangeContractId", "landId");

-- AddForeignKey
ALTER TABLE "permutantes" ADD CONSTRAINT "permutantes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_contracts" ADD CONSTRAINT "exchange_contracts_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "developments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_contracts" ADD CONSTRAINT "exchange_contracts_permutanteId_fkey" FOREIGN KEY ("permutanteId") REFERENCES "permutantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_contract_lands" ADD CONSTRAINT "exchange_contract_lands_exchangeContractId_fkey" FOREIGN KEY ("exchangeContractId") REFERENCES "exchange_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_contract_lands" ADD CONSTRAINT "exchange_contract_lands_landId_fkey" FOREIGN KEY ("landId") REFERENCES "spe_lands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_exchangeContractId_fkey" FOREIGN KEY ("exchangeContractId") REFERENCES "exchange_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
