/**
 * Smoke: compact user-profile inline buttons (no Telegram / DB).
 * Run: node scripts/smoke-profile-buttons.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const main = fs.readFileSync(path.join(root, "src/keyboards/main.ts"), "utf8");
const nearby = fs.readFileSync(
  path.join(root, "src/keyboards/nearby.ts"),
  "utf8",
);
const features = fs.readFileSync(
  path.join(root, "src/handlers/features.ts"),
  "utf8",
);

const helperStart = main.indexOf("export function userProfileActionKeyboard");
const helperEnd = main.indexOf("export function partnerInChatKeyboard");
assert(helperStart >= 0 && helperEnd > helperStart, "helper present");
const helper = main.slice(helperStart, helperEnd);

assert(helper.includes("`exp:like:${targetId}`"), "heart button likes");
assert(!helper.includes("exp:likes:"), "no separate show-likes callback");
assert(!helper.includes("❤️ لایک (+۱💰)"), "old like label gone");
assert(helper.includes("👤 مخاطب"), "compact contact label");
assert(helper.includes("🚩 گزارش"), "compact report label");
assert(!helper.includes("افزودن به مخاطبین"), "long contact label gone");
assert(!helper.includes("گزارش تخلف"), "long report label gone");
assert(helper.includes("اطلاع پایان چت (۱💰)"), "short chat-end label");
assert(!helper.includes("اطلاع پایان چت (+۱💰)"), "old +coin chat-end gone");
assert(helper.includes("`report:start:${targetId}`"), "report callback kept");
assert(helper.includes("`contact:add:${targetId}`"), "contact add kept");
assert(helper.includes("`watchend:ask:${targetId}`"), "ChatEndWatch kept");
assert(helper.includes("`nearby_chat:${targetId}`"), "nearby chat request");
assert(helper.includes("`exp:chat:${targetId}`"), "explore chat request");

assert(
  nearby.includes('from "./main.js"'),
  "nearby shares profile helper",
);
assert(
  nearby.includes('"nearby"'),
  "nearby uses nearby chat-request mode",
);

assert(
  /exp:likes\?:/.test(features),
  "like + show-likes share one callback",
);
assert(
  features.includes("اگر قبلاً لایک شده"),
  "already-liked shows count",
);

const chatKb = main.slice(
  main.indexOf("export function chattingKeyboard"),
  main.indexOf("export function chattingInlineKeyboard"),
);
assert(chatKb.includes("ADD_CONTACT"), "chat reply menu still has add-contact");
assert(
  !chatKb.includes("userProfileActionKeyboard"),
  "chat reply menu unchanged",
);

console.log("smoke-profile-buttons: OK");
