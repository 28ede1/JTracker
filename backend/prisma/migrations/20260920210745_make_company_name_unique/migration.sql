/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `Company` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Company" ALTER COLUMN "name" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Company_name_key" ON "Company"("name");
