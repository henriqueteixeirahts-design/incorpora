-- CreateTable
CREATE TABLE "payable_allocations" (
    "id" UUID NOT NULL,
    "payableId" UUID NOT NULL,
    "developmentId" UUID,
    "percent" DECIMAL(5,2),
    "amount" DECIMAL(14,2) NOT NULL,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "payable_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allocation_templates" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "allocation_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allocation_template_destinations" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "developmentId" UUID,
    "percent" DECIMAL(5,2) NOT NULL,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "allocation_template_destinations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payable_allocations_payableId_idx" ON "payable_allocations"("payableId");

-- CreateIndex
CREATE INDEX "payable_allocations_developmentId_idx" ON "payable_allocations"("developmentId");

-- CreateIndex
CREATE UNIQUE INDEX "allocation_templates_organizationId_name_key" ON "allocation_templates"("organizationId", "name");

-- CreateIndex
CREATE INDEX "allocation_template_destinations_templateId_idx" ON "allocation_template_destinations"("templateId");

-- AddForeignKey
ALTER TABLE "payable_allocations" ADD CONSTRAINT "payable_allocations_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "payables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payable_allocations" ADD CONSTRAINT "payable_allocations_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "developments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_templates" ADD CONSTRAINT "allocation_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_template_destinations" ADD CONSTRAINT "allocation_template_destinations_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "allocation_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_template_destinations" ADD CONSTRAINT "allocation_template_destinations_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "developments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
