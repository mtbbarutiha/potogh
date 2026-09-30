-- درخواست فروش سکه / تسویه ریالی
CREATE TABLE "CoinSellRequest" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "coins" INTEGER NOT NULL,
    "rateToman" INTEGER NOT NULL,
    "amountToman" INTEGER NOT NULL,
    "cardNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "CoinSellRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CoinSellRequest_status_createdAt_idx" ON "CoinSellRequest"("status", "createdAt");
CREATE INDEX "CoinSellRequest_userId_idx" ON "CoinSellRequest"("userId");

ALTER TABLE "CoinSellRequest" ADD CONSTRAINT "CoinSellRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
