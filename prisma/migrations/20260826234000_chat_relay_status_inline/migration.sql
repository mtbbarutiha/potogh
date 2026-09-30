-- AlterTable
ALTER TABLE "ChatRelayStatus" ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'reaction';
ALTER TABLE "ChatRelayStatus" ADD COLUMN IF NOT EXISTS "textBody" TEXT;
