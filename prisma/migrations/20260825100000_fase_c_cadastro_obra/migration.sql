-- docs/ESPEC_FASE_C_DASHBOARD_EMPREENDIMENTOS.md, Etapas 1-2 (cadastro
-- enriquecido + fases de obra/evolução física). Aditiva.

-- AlterEnum
ALTER TYPE "DocumentCategory" ADD VALUE 'CONDOMINIUM_CONVENTION';
ALTER TYPE "DocumentCategory" ADD VALUE 'CONSTRUCTION_INSURANCE';

-- AlterTable
ALTER TABLE "developments" ADD COLUMN "registrationDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "construction_phases" (
    "id" UUID NOT NULL,
    "developmentId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "weightPct" DECIMAL(5,2) NOT NULL,
    "plannedStart" TIMESTAMP(3),
    "plannedEnd" TIMESTAMP(3),
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "construction_phases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_measurements" (
    "id" UUID NOT NULL,
    "developmentId" UUID NOT NULL,
    "measurementDate" TIMESTAMP(3) NOT NULL,
    "overallPercentComplete" DECIMAL(5,2) NOT NULL,
    "notes" TEXT,
    "informedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "construction_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_phase_measurement_values" (
    "id" UUID NOT NULL,
    "measurementId" UUID NOT NULL,
    "phaseId" UUID NOT NULL,
    "percentComplete" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "construction_phase_measurement_values_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "construction_phases_developmentId_idx" ON "construction_phases"("developmentId");

-- CreateIndex
CREATE INDEX "construction_measurements_developmentId_idx" ON "construction_measurements"("developmentId");

-- CreateIndex
CREATE UNIQUE INDEX "construction_phase_measurement_values_measurementId_phaseId_key" ON "construction_phase_measurement_values"("measurementId", "phaseId");

-- AddForeignKey
ALTER TABLE "construction_phases" ADD CONSTRAINT "construction_phases_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "developments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_measurements" ADD CONSTRAINT "construction_measurements_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "developments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_phase_measurement_values" ADD CONSTRAINT "construction_phase_measurement_values_measurementId_fkey" FOREIGN KEY ("measurementId") REFERENCES "construction_measurements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_phase_measurement_values" ADD CONSTRAINT "construction_phase_measurement_values_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "construction_phases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
