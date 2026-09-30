/**
 * Smoke checks for paid anonymous match + 20s partner-leave refund.
 * Run: node scripts/smoke-quick-match-pay.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("OK:", msg);
  }
}

const packages = read("src/data/packages.ts");
const match = read("src/services/match.ts");
const pay = read("src/services/quickMatchPay.ts");
const schema = read("prisma/schema.prisma");
const mig = read(
  "prisma/migrations/20260903110000_quick_match_charge/migration.sql",
);
const features = read("src/handlers/features.ts");

assert(/QUICK_MATCH_COST\s*=\s*2/.test(packages), "QUICK_MATCH_COST = 2");
assert(
  /QUICK_MATCH_REFUND_MS\s*=\s*20_000/.test(packages),
  "QUICK_MATCH_REFUND_MS = 20s",
);
assert(/model QuickMatchCharge/.test(schema), "QuickMatchCharge in schema");
assert(/CREATE TABLE "QuickMatchCharge"/.test(mig), "migration creates table");

assert(
  /debitQuickMatchPayersInTx/.test(match) && /debitQuickMatchPayersInTx/.test(pay),
  "atomic debit helper wired",
);
assert(
  /settleQuickMatchOnChatEnd/.test(match),
  "leaveQueueOrChat settles refund",
);
assert(
  /quickPayers:\s*\[me\.id,\s*peer\.id\]/.test(match),
  "queue match charges both searchers",
);
assert(
  /quickPayers:\s*\[req\.fromUserId\]/.test(match),
  "accept quick charges only fromUser",
);
assert(
  /charge\.payerId !== endedByUserId && elapsed < QUICK_MATCH_REFUND_MS/.test(
    pay,
  ),
  "refund only when partner leaves early",
);
assert(
  /refundedAt:\s*null/.test(pay) && /updateMany/.test(pay),
  "double-refund guard via updateMany",
);
assert(
  /quickMatchInsufficientCoinsText/.test(match),
  "Persian insufficient-coins path",
);
assert(
  /"no_coins"/.test(match) && /result === "no_coins"/.test(features),
  "no_coins handled in UI",
);
assert(
  !/QUICK_MATCH_COST/.test(read("src/services/chatEndWatch.ts")),
  "ChatEndWatch untouched by quick-match cost",
);
assert(
  /CHAT_END_WATCH_COST = 1/.test(read("src/services/chatEndWatch.ts")),
  "ChatEndWatch still 1 coin",
);

if (process.exitCode) {
  console.error("\nsmoke-quick-match-pay FAILED");
  process.exit(1);
}
console.log("\nsmoke-quick-match-pay PASSED");
