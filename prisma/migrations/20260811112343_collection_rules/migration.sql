-- CreateTable
CREATE TABLE "collection_rules" (
    "id" UUID NOT NULL,
    "developmentId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collection_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_rule_steps" (
    "id" UUID NOT NULL,
    "collectionRuleId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "offsetDays" INTEGER NOT NULL,
    "actionLabel" TEXT NOT NULL,

    CONSTRAINT "collection_rule_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_contact_logs" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "channel" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "nextStepNote" TEXT,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_contact_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "collection_rules_developmentId_key" ON "collection_rules"("developmentId");

-- CreateIndex
CREATE UNIQUE INDEX "collection_rule_steps_collectionRuleId_sequence_key" ON "collection_rule_steps"("collectionRuleId", "sequence");

-- CreateIndex
CREATE INDEX "collection_contact_logs_organizationId_customerId_idx" ON "collection_contact_logs"("organizationId", "customerId");

-- AddForeignKey
ALTER TABLE "collection_rules" ADD CONSTRAINT "collection_rules_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "developments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_rule_steps" ADD CONSTRAINT "collection_rule_steps_collectionRuleId_fkey" FOREIGN KEY ("collectionRuleId") REFERENCES "collection_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_contact_logs" ADD CONSTRAINT "collection_contact_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_contact_logs" ADD CONSTRAINT "collection_contact_logs_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

