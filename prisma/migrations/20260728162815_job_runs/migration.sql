-- CreateEnum
CREATE TYPE "JobRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILURE');

-- CreateEnum
CREATE TYPE "JobTrigger" AS ENUM ('CRON', 'MANUAL', 'EVENT');

-- CreateTable
CREATE TABLE "job_runs" (
    "id" UUID NOT NULL,
    "jobName" TEXT NOT NULL,
    "organizationId" UUID,
    "status" "JobRunStatus" NOT NULL DEFAULT 'RUNNING',
    "triggeredBy" "JobTrigger" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "summary" JSONB,
    "error" TEXT,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_runs_jobName_startedAt_idx" ON "job_runs"("jobName", "startedAt");

-- CreateIndex
CREATE INDEX "job_runs_organizationId_startedAt_idx" ON "job_runs"("organizationId", "startedAt");

-- AddForeignKey
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
