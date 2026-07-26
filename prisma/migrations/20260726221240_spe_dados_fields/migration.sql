-- CreateEnum
CREATE TYPE "SpeStatus" AS ENUM ('ACTIVE', 'IN_FORMATION', 'CLOSED');

-- AlterTable
ALTER TABLE "special_purpose_entities" ADD COLUMN     "city" TEXT,
ADD COLUMN     "cnae" TEXT,
ADD COLUMN     "complement" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "foundedAt" TIMESTAMP(3),
ADD COLUMN     "legalNature" TEXT,
ADD COLUMN     "neighborhood" TEXT,
ADD COLUMN     "nire" TEXT,
ADD COLUMN     "number" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "state" VARCHAR(2),
ADD COLUMN     "status" "SpeStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "street" TEXT,
ADD COLUMN     "tradeName" TEXT,
ADD COLUMN     "website" TEXT,
ADD COLUMN     "zipCode" TEXT;
