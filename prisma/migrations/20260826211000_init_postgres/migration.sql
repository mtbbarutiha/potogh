-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "displayName" TEXT,
    "bio" TEXT,
    "interests" TEXT,
    "diamonds" INTEGER NOT NULL DEFAULT 0,
    "secureChat" BOOLEAN NOT NULL DEFAULT false,
    "userCode" TEXT,
    "referralCode" TEXT NOT NULL,
    "anonCode" TEXT NOT NULL,
    "referredById" INTEGER,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "locationAt" TIMESTAMP(3),
    "gender" TEXT,
    "lookingFor" TEXT,
    "age" INTEGER,
    "language" TEXT,
    "country" TEXT,
    "province" TEXT,
    "city" TEXT,
    "photoFileId" TEXT,
    "photoPendingFileId" TEXT,
    "photoStatus" TEXT NOT NULL DEFAULT 'none',
    "faceVerified" BOOLEAN NOT NULL DEFAULT false,
    "facePendingFileId" TEXT,
    "facePendingKind" TEXT,
    "faceStatus" TEXT NOT NULL DEFAULT 'none',
    "registered" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "state" TEXT NOT NULL DEFAULT 'language',
    "pendingAnonTo" TEXT,
    "chatPartnerId" INTEGER,
    "boostUntil" TIMESTAMP(3),
    "chatSilentUntil" TIMESTAMP(3),
    "isPro" BOOLEAN NOT NULL DEFAULT false,
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "chatsCount" INTEGER NOT NULL DEFAULT 0,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBlock" (
    "id" SERIAL NOT NULL,
    "blockerUserId" INTEGER NOT NULL,
    "blockedUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" SERIAL NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "contactUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeletedAccount" (
    "id" SERIAL NOT NULL,
    "originalUserId" INTEGER NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "username" TEXT,
    "displayName" TEXT,
    "gender" TEXT,
    "age" INTEGER,
    "province" TEXT,
    "city" TEXT,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reRegisteredUserId" INTEGER,

    CONSTRAINT "DeletedAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interaction" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "fromUserId" INTEGER NOT NULL,
    "toUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Interaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExploreSeen" (
    "id" SERIAL NOT NULL,
    "viewerId" INTEGER NOT NULL,
    "shownId" INTEGER NOT NULL,

    CONSTRAINT "ExploreSeen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiamondOrder" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "packageId" TEXT NOT NULL,
    "diamonds" INTEGER NOT NULL,
    "amountToman" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paymentCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiamondOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnonMessage" (
    "id" SERIAL NOT NULL,
    "toUserId" INTEGER NOT NULL,
    "fromUserId" INTEGER,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnonMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectMessage" (
    "id" SERIAL NOT NULL,
    "fromUserId" INTEGER NOT NULL,
    "toUserId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "replyToId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatRequest" (
    "id" SERIAL NOT NULL,
    "fromUserId" INTEGER NOT NULL,
    "toUserId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT NOT NULL DEFAULT 'direct',
    "expiresAt" TIMESTAMP(3),
    "toChatId" BIGINT,
    "toMessageId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMsgLog" (
    "id" SERIAL NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "partnerUserId" INTEGER NOT NULL,
    "telegramChatId" BIGINT NOT NULL,
    "messageId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMsgLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "User_userCode_key" ON "User"("userCode");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- CreateIndex
CREATE UNIQUE INDEX "User_anonCode_key" ON "User"("anonCode");

-- CreateIndex
CREATE INDEX "UserBlock_blockerUserId_idx" ON "UserBlock"("blockerUserId");

-- CreateIndex
CREATE INDEX "UserBlock_blockedUserId_idx" ON "UserBlock"("blockedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBlock_blockerUserId_blockedUserId_key" ON "UserBlock"("blockerUserId", "blockedUserId");

-- CreateIndex
CREATE INDEX "Contact_ownerUserId_idx" ON "Contact"("ownerUserId");

-- CreateIndex
CREATE INDEX "Contact_contactUserId_idx" ON "Contact"("contactUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_ownerUserId_contactUserId_key" ON "Contact"("ownerUserId", "contactUserId");

-- CreateIndex
CREATE INDEX "DeletedAccount_telegramId_idx" ON "DeletedAccount"("telegramId");

-- CreateIndex
CREATE INDEX "DeletedAccount_originalUserId_idx" ON "DeletedAccount"("originalUserId");

-- CreateIndex
CREATE INDEX "Interaction_toUserId_type_idx" ON "Interaction"("toUserId", "type");

-- CreateIndex
CREATE INDEX "Interaction_fromUserId_type_idx" ON "Interaction"("fromUserId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ExploreSeen_viewerId_shownId_key" ON "ExploreSeen"("viewerId", "shownId");

-- CreateIndex
CREATE UNIQUE INDEX "DiamondOrder_paymentCode_key" ON "DiamondOrder"("paymentCode");

-- CreateIndex
CREATE INDEX "DirectMessage_fromUserId_status_idx" ON "DirectMessage"("fromUserId", "status");

-- CreateIndex
CREATE INDEX "DirectMessage_toUserId_status_idx" ON "DirectMessage"("toUserId", "status");

-- CreateIndex
CREATE INDEX "DirectMessage_replyToId_idx" ON "DirectMessage"("replyToId");

-- CreateIndex
CREATE INDEX "ChatRequest_toUserId_status_idx" ON "ChatRequest"("toUserId", "status");

-- CreateIndex
CREATE INDEX "ChatRequest_fromUserId_status_idx" ON "ChatRequest"("fromUserId", "status");

-- CreateIndex
CREATE INDEX "ChatRequest_status_expiresAt_idx" ON "ChatRequest"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "ChatMsgLog_ownerUserId_partnerUserId_idx" ON "ChatMsgLog"("ownerUserId", "partnerUserId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockerUserId_fkey" FOREIGN KEY ("blockerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedUserId_fkey" FOREIGN KEY ("blockedUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_contactUserId_fkey" FOREIGN KEY ("contactUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExploreSeen" ADD CONSTRAINT "ExploreSeen_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExploreSeen" ADD CONSTRAINT "ExploreSeen_shownId_fkey" FOREIGN KEY ("shownId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiamondOrder" ADD CONSTRAINT "DiamondOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnonMessage" ADD CONSTRAINT "AnonMessage_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnonMessage" ADD CONSTRAINT "AnonMessage_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

