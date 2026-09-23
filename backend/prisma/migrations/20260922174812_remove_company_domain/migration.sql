/*
  Warnings:

  - You are about to drop the column `domain` on the `Company` table. All the data in the column will be lost.
  - Made the column `name` on table `Company` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "Company_domain_key";

-- AlterTable
ALTER TABLE "Company" DROP COLUMN "domain",
ALTER COLUMN "name" SET NOT NULL;
