-- CreateEnum
CREATE TYPE "IndexValueSource" AS ENUM ('MANUAL', 'OFFICIAL');

-- AlterTable
ALTER TABLE "index_values" ADD COLUMN     "source" "IndexValueSource" NOT NULL DEFAULT 'MANUAL';
