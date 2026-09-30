/**
 * Smoke: profile-view notify wiring (no Telegram / DB).
 * Run: node scripts/smoke-profile-view-notify.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const svc = fs.readFileSync(
  path.join(root, "src/services/profileViewNotify.ts"),
  "utf8",
);
const explore = fs.readFileSync(
  path.join(root, "src/services/explore.ts"),
  "utf8",
);
const profile = fs.readFileSync(
  path.join(root, "src/services/profile.ts"),
  "utf8",
);
const watch = fs.readFileSync(
  path.join(root, "src/services/chatEndWatch.ts"),
  "utf8",
);
const match = fs.readFileSync(path.join(root, "src/services/match.ts"), "utf8");
const mainKb = fs.readFileSync(
  path.join(root, "src/keyboards/main.ts"),
  "utf8",
);
const earn = fs.readFileSync(path.join(root, "src/features/earn.ts"), "utf8");
const referral = fs.readFileSync(
  path.join(root, "src/services/referral.ts"),
  "utf8",
);

assert(
  svc.includes("PROFILE_VIEW_NOTIFY_COOLDOWN_MS = 15 * 60 * 1000"),
  "15-minute cooldown",
);
assert(
  svc.includes(
    "کاربر ${displayName} با آیدی /user_${userCode} پروفایل شما را مشاهده کرد",
  ),
  "persian notify template",
);
assert(svc.includes("notifyProfileViewSafe"), "safe wrapper exported");
assert(!/diamonds:\s*\{\s*decrement/.test(svc), "notify is free (no coin debit)");
assert(svc.includes("isBlockedEither"), "skip if blocked either way");
assert(svc.includes("viewerId === vieweeId"), "skip self view");
assert(svc.includes("9000000000n"), "skip fake/demo users");
assert(svc.includes("deletedAt"), "skip deleted users");

assert(
  /notifyProfileViewSafe\(ctx\.api, viewerId, candidate\.id\)/.test(explore),
  "explore /user_ profile notifies",
);
assert(
  /notifyProfileViewSafe\(ctx\.api, viewerId, partner\.id\)/.test(profile),
  "mid-chat partner profile notifies",
);
assert(
  !/notifyProfileViewSafe\(ctx\.api, userId/.test(profile),
  "own sendProfileCard does not notify",
);

assert(watch.includes("CHAT_END_WATCH_COST = 1"), "ChatEndWatch still 1 coin");
assert(
  match.includes("`آیدی: /user_${code}`"),
  "expired request counterpart id kept",
);
assert(
  mainKb.includes("اطلاع پایان چت (۱💰)"),
  "ChatEndWatch keyboard label kept",
);
assert(earn.includes("export"), "earn module present");
assert(referral.includes("REFERRAL_BONUS") || referral.length > 100, "referral present");

const schema = fs.readFileSync(
  path.join(root, "prisma/schema.prisma"),
  "utf8",
);
assert(schema.includes("model ProfileViewNotify"), "prisma model");
assert(schema.includes("model ChatEndWatch"), "ChatEndWatch model kept");

const mig = fs.readFileSync(
  path.join(
    root,
    "prisma/migrations/20260903100000_profile_view_notify/migration.sql",
  ),
  "utf8",
);
assert(mig.includes('CREATE TABLE "ProfileViewNotify"'), "migration table");
assert(mig.includes("GRANT SELECT, INSERT, UPDATE, DELETE"), "grant to app role");

console.log("smoke-profile-view-notify: OK");
