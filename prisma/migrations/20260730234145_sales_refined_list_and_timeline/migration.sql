-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "reservationId" UUID,
ADD COLUMN     "saleNumber" TEXT;

-- Backfill saleNumber for existing rows, sequential per organization
-- ordered by createdAt (matches the format used for new sales going
-- forward: "V-<ano>-<sequencial>").
WITH numbered AS (
  SELECT
    id,
    "organizationId",
    'V-' || EXTRACT(YEAR FROM "createdAt")::text || '-' || LPAD(
      (ROW_NUMBER() OVER (
        PARTITION BY "organizationId", EXTRACT(YEAR FROM "createdAt")
        ORDER BY "createdAt"
      ))::text,
      4,
      '0'
    ) AS generated_number
  FROM "sales"
)
UPDATE "sales"
SET "saleNumber" = numbered.generated_number
FROM numbered
WHERE "sales".id = numbered.id;

-- AlterTable
ALTER TABLE "sales" ALTER COLUMN "saleNumber" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "sales_organizationId_saleNumber_key" ON "sales"("organizationId", "saleNumber");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
