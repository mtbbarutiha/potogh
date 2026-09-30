-- AlterTable
ALTER TABLE "DiamondOrder" ADD COLUMN "paymentMethod" TEXT NOT NULL DEFAULT 'card';
ALTER TABLE "DiamondOrder" ADD COLUMN "starsAmount" INTEGER;
ALTER TABLE "DiamondOrder" ADD COLUMN "telegramPaymentChargeId" TEXT;
ALTER TABLE "DiamondOrder" ADD COLUMN "receiptFileId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "DiamondOrder_telegramPaymentChargeId_key" ON "DiamondOrder"("telegramPaymentChargeId");
CREATE INDEX "DiamondOrder_status_paymentMethod_idx" ON "DiamondOrder"("status", "paymentMethod");
CREATE INDEX "DiamondOrder_userId_status_idx" ON "DiamondOrder"("userId", "status");
