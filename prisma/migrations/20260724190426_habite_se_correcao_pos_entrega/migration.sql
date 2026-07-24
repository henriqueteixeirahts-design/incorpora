-- AlterTable
ALTER TABLE "developments" ADD COLUMN     "habiteSeDate" TIMESTAMP(3),
ADD COLUMN     "postHabiteSeIndexRuleId" UUID,
ADD COLUMN     "postHabiteSeInterestType" "InterestType" NOT NULL DEFAULT 'COMPOUND',
ADD COLUMN     "postHabiteSeMonthlyInterestPercent" DECIMAL(5,2);

-- AddForeignKey
ALTER TABLE "developments" ADD CONSTRAINT "developments_postHabiteSeIndexRuleId_fkey" FOREIGN KEY ("postHabiteSeIndexRuleId") REFERENCES "index_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
