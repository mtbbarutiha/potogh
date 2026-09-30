-- CreateTable
CREATE TABLE "ProfileViewNotify" (
    "id" SERIAL NOT NULL,
    "viewerId" INTEGER NOT NULL,
    "vieweeId" INTEGER NOT NULL,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileViewNotify_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProfileViewNotify_viewerId_vieweeId_key" ON "ProfileViewNotify"("viewerId", "vieweeId");

-- CreateIndex
CREATE INDEX "ProfileViewNotify_vieweeId_lastSentAt_idx" ON "ProfileViewNotify"("vieweeId", "lastSentAt");

-- AddForeignKey
ALTER TABLE "ProfileViewNotify" ADD CONSTRAINT "ProfileViewNotify_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileViewNotify" ADD CONSTRAINT "ProfileViewNotify_vieweeId_fkey" FOREIGN KEY ("vieweeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Grants for app role
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "ProfileViewNotify" TO patogh;
GRANT USAGE, SELECT ON SEQUENCE "ProfileViewNotify_id_seq" TO patogh;
