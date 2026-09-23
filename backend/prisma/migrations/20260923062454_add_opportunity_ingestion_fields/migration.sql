/*
  Warnings:

  - A unique constraint covering the columns `[dedupKey]` on the table `Opportunity` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "dedupKey" TEXT,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "source" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_dedupKey_key" ON "Opportunity"("dedupKey");
