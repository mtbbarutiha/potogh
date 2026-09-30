-- CreateTable
CREATE TABLE "ChatRelayStatus" (
    "id" SERIAL NOT NULL,
    "senderUserId" INTEGER NOT NULL,
    "partnerUserId" INTEGER NOT NULL,
    "senderChatId" BIGINT NOT NULL,
    "senderMessageId" INTEGER NOT NULL,
    "statusMessageId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatRelayStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatRelayStatus_senderUserId_partnerUserId_status_idx" ON "ChatRelayStatus"("senderUserId", "partnerUserId", "status");

-- CreateIndex
CREATE INDEX "ChatRelayStatus_partnerUserId_status_idx" ON "ChatRelayStatus"("partnerUserId", "status");
