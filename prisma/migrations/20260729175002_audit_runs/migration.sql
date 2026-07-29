-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('OK', 'ALERT');

-- CreateEnum
CREATE TYPE "AuditCheckCode" AS ENUM ('V1_INDEX_FRESHNESS', 'V2_CORRECTION_COVERAGE', 'V3_MEMORY_CONSISTENCY', 'V4_JOB_EXECUTION', 'V5_SOURCE_DIVERGENCE');

-- AlterTable
ALTER TABLE "index_rules" ADD COLUMN     "publicationDeadlineDay" INTEGER;

-- CreateTable
CREATE TABLE "audit_runs" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "status" "AuditStatus" NOT NULL DEFAULT 'OK',
    "triggeredBy" "JobTrigger" NOT NULL,
    "fullCheck" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "audit_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_check_results" (
    "id" UUID NOT NULL,
    "auditRunId" UUID NOT NULL,
    "code" "AuditCheckCode" NOT NULL,
    "status" "AuditStatus" NOT NULL,
    "summary" JSONB NOT NULL,
    "issues" JSONB,

    CONSTRAINT "audit_check_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_runs_organizationId_startedAt_idx" ON "audit_runs"("organizationId", "startedAt");

-- CreateIndex
CREATE INDEX "audit_check_results_auditRunId_idx" ON "audit_check_results"("auditRunId");

-- AddForeignKey
ALTER TABLE "audit_runs" ADD CONSTRAINT "audit_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_check_results" ADD CONSTRAINT "audit_check_results_auditRunId_fkey" FOREIGN KEY ("auditRunId") REFERENCES "audit_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
