-- CreateTable
CREATE TABLE "ChatEndWatch" (
    "id" SERIAL NOT NULL,
    "watcherId" INTEGER NOT NULL,
    "targetId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "ChatEndWatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatEndWatch_targetId_consumedAt_idx" ON "ChatEndWatch"("targetId", "consumedAt");

-- CreateIndex
CREATE INDEX "ChatEndWatch_watcherId_targetId_idx" ON "ChatEndWatch"("watcherId", "targetId");

-- Partial unique: only one active watch per pair
CREATE UNIQUE INDEX "ChatEndWatch_watcherId_targetId_active_key"
  ON "ChatEndWatch"("watcherId", "targetId")
  WHERE "consumedAt" IS NULL;

-- AddForeignKey
ALTER TABLE "ChatEndWatch" ADD CONSTRAINT "ChatEndWatch_watcherId_fkey" FOREIGN KEY ("watcherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatEndWatch" ADD CONSTRAINT "ChatEndWatch_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Grants for app role
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "ChatEndWatch" TO patogh;
GRANT USAGE, SELECT ON SEQUENCE "ChatEndWatch_id_seq" TO patogh;
