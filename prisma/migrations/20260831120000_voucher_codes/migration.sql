-- CreateTable
CREATE TABLE "VoucherCode" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "coinAmount" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "currentUses" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoucherCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoucherRedemption" (
    "id" SERIAL NOT NULL,
    "voucherId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoucherRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VoucherCode_code_key" ON "VoucherCode"("code");

-- CreateIndex
CREATE INDEX "VoucherCode_isActive_expiresAt_idx" ON "VoucherCode"("isActive", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "VoucherRedemption_voucherId_userId_key" ON "VoucherRedemption"("voucherId", "userId");

-- CreateIndex
CREATE INDEX "VoucherRedemption_userId_idx" ON "VoucherRedemption"("userId");

-- AddForeignKey
ALTER TABLE "VoucherRedemption" ADD CONSTRAINT "VoucherRedemption_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "VoucherCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
