-- CreateTable
CREATE TABLE IF NOT EXISTS "UserReport" (
    "id" SERIAL NOT NULL,
    "reporterUserId" INTEGER NOT NULL,
    "reportedUserId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedNote" TEXT,

    CONSTRAINT "UserReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "UserReport_status_createdAt_idx" ON "UserReport"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "UserReport_reportedUserId_idx" ON "UserReport"("reportedUserId");
CREATE INDEX IF NOT EXISTS "UserReport_reporterUserId_idx" ON "UserReport"("reporterUserId");
CREATE INDEX IF NOT EXISTS "UserReport_createdAt_idx" ON "UserReport"("createdAt");

DO $$ BEGIN
  ALTER TABLE "UserReport" ADD CONSTRAINT "UserReport_reporterUserId_fkey"
    FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "UserReport" ADD CONSTRAINT "UserReport_reportedUserId_fkey"
    FOREIGN KEY ("reportedUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
