/*
  Warnings:

  - You are about to drop the column `signedDocumentUrl` on the `contracts` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "contracts" DROP COLUMN "signedDocumentUrl",
ADD COLUMN     "signedDocumentPath" TEXT;
