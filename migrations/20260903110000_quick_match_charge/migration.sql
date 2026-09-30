-- CreateTable
CREATE TABLE "QuickMatchCharge" (
    "id" SERIAL NOT NULL,
    "payerId" INTEGER NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 2,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),

    CONSTRAINT "QuickMatchCharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuickMatchCharge_payerId_partnerId_refundedAt_idx" ON "QuickMatchCharge"("payerId", "partnerId", "refundedAt");

-- CreateIndex
CREATE INDEX "QuickMatchCharge_partnerId_endedAt_idx" ON "QuickMatchCharge"("partnerId", "endedAt");

-- CreateIndex
CREATE INDEX "QuickMatchCharge_connectedAt_idx" ON "QuickMatchCharge"("connectedAt");

-- AddForeignKey
ALTER TABLE "QuickMatchCharge" ADD CONSTRAINT "QuickMatchCharge_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickMatchCharge" ADD CONSTRAINT "QuickMatchCharge_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Grants for app role
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "QuickMatchCharge" TO patogh;
GRANT USAGE, SELECT ON SEQUENCE "QuickMatchCharge_id_seq" TO patogh;
