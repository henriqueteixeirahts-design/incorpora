-- CreateEnum
CREATE TYPE "DocumentTemplateType" AS ENUM ('SALES_CONTRACT', 'ASSIGNMENT', 'RESCISSION', 'AMENDMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentTemplateStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "maritalStatus" TEXT,
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "profession" TEXT;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "documentTemplateId" UUID,
ADD COLUMN     "documentTemplateVersion" INTEGER;

-- CreateTable
CREATE TABLE "document_templates" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "templateGroupId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "type" "DocumentTemplateType" NOT NULL,
    "status" "DocumentTemplateStatus" NOT NULL DEFAULT 'ACTIVE',
    "effectiveDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content" TEXT NOT NULL,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_template_developments" (
    "id" UUID NOT NULL,
    "documentTemplateId" UUID NOT NULL,
    "developmentId" UUID NOT NULL,

    CONSTRAINT "document_template_developments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_templates_organizationId_templateGroupId_idx" ON "document_templates"("organizationId", "templateGroupId");

-- CreateIndex
CREATE INDEX "document_templates_organizationId_type_status_idx" ON "document_templates"("organizationId", "type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "document_template_developments_documentTemplateId_developme_key" ON "document_template_developments"("documentTemplateId", "developmentId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_documentTemplateId_fkey" FOREIGN KEY ("documentTemplateId") REFERENCES "document_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_template_developments" ADD CONSTRAINT "document_template_developments_documentTemplateId_fkey" FOREIGN KEY ("documentTemplateId") REFERENCES "document_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_template_developments" ADD CONSTRAINT "document_template_developments_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "developments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
