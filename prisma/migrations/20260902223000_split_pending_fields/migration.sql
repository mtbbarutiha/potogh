-- Split shared pendingAnonTo bus so sell/report/DM/anon don't clobber each other.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pendingDirectTo" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pendingSellCard" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pendingReportOther" TEXT;

-- Migrate in-flight sell_card:N out of pendingAnonTo
UPDATE "User"
SET
  "pendingSellCard" = substring("pendingAnonTo" from length('sell_card:') + 1),
  "pendingAnonTo" = NULL
WHERE "pendingAnonTo" LIKE 'sell_card:%'
  AND "pendingSellCard" IS NULL;

-- Migrate in-flight report_other:ID
UPDATE "User"
SET
  "pendingReportOther" = substring("pendingAnonTo" from length('report_other:') + 1),
  "pendingAnonTo" = NULL
WHERE "pendingAnonTo" LIKE 'report_other:%'
  AND "pendingReportOther" IS NULL;

-- Migrate in-flight DM compose targets
UPDATE "User"
SET
  "pendingDirectTo" = "pendingAnonTo",
  "pendingAnonTo" = NULL
WHERE state = 'await_direct_msg'
  AND "pendingAnonTo" IS NOT NULL
  AND "pendingDirectTo" IS NULL;
