-- CreateEnum
CREATE TYPE "ReservationWaitlistStatus" AS ENUM ('WAITING', 'CONVERTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "fromWaitlist" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "renewalCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "reservation_rules" (
    "id" UUID NOT NULL,
    "developmentId" UUID NOT NULL,
    "validityHours" INTEGER NOT NULL DEFAULT 48,
    "maxActiveReservationsPerBroker" INTEGER,
    "waitlistEnabled" BOOLEAN NOT NULL DEFAULT true,
    "waitlistPriorityHours" INTEGER NOT NULL DEFAULT 24,
    "renewalAllowed" BOOLEAN NOT NULL DEFAULT true,
    "maxRenewals" INTEGER NOT NULL DEFAULT 1,
    "requiresApprovalForRenewal" BOOLEAN NOT NULL DEFAULT true,
    "requireIdentifiedCustomer" BOOLEAN NOT NULL DEFAULT true,
    "allowedReserverRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_waitlist_entries" (
    "id" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "brokerId" UUID,
    "agencyId" UUID,
    "status" "ReservationWaitlistStatus" NOT NULL DEFAULT 'WAITING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "convertedAt" TIMESTAMP(3),
    "convertedReservationId" UUID,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "reservation_waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reservation_rules_developmentId_key" ON "reservation_rules"("developmentId");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_waitlist_entries_convertedReservationId_key" ON "reservation_waitlist_entries"("convertedReservationId");

-- CreateIndex
CREATE INDEX "reservation_waitlist_entries_unitId_status_idx" ON "reservation_waitlist_entries"("unitId", "status");

-- AddForeignKey
ALTER TABLE "reservation_rules" ADD CONSTRAINT "reservation_rules_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "developments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_waitlist_entries" ADD CONSTRAINT "reservation_waitlist_entries_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_waitlist_entries" ADD CONSTRAINT "reservation_waitlist_entries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_waitlist_entries" ADD CONSTRAINT "reservation_waitlist_entries_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "brokers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_waitlist_entries" ADD CONSTRAINT "reservation_waitlist_entries_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "real_estate_agencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_waitlist_entries" ADD CONSTRAINT "reservation_waitlist_entries_convertedReservationId_fkey" FOREIGN KEY ("convertedReservationId") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
