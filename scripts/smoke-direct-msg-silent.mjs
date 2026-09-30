/**
 * Smoke: silent mode must not gate DM; delivery errors must classify clearly.
 * No sendChatAction pre-check; blocked_bot only on explicit Telegram wording.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

async function loadTsOrJs(rel) {
  const js = path.join(root, "dist", rel.replace(/\.ts$/, ".js"));
  try {
    return await import(pathToFileURL(js).href);
  } catch {
    const require = createRequire(import.meta.url);
    // fallback: not built yet
    throw new Error(`Missing ${js} — run npm run build first`);
  }
}

const { classifyBotDeliveryError } = await loadTsOrJs("lib/telegramSafe.js");
const silent = await loadTsOrJs("services/chatSilent.js");

assert.equal(
  classifyBotDeliveryError(
    new Error("Call to 'sendMessage' failed! (403: Forbidden: bot was blocked by the user)"),
  ),
  "blocked_bot",
);
assert.equal(
  classifyBotDeliveryError(
    new Error("Call to 'sendChatAction' failed! (403: Forbidden: bot was blocked by the user)"),
  ),
  "blocked_bot",
);
// Prefer API description field when present
assert.equal(
  classifyBotDeliveryError({ description: "Forbidden: bot was blocked by the user" }),
  "blocked_bot",
);
assert.equal(
  classifyBotDeliveryError(new Error("403: Forbidden: user is deactivated")),
  "deactivated",
);
assert.equal(
  classifyBotDeliveryError(new Error("400: Bad Request: chat not found")),
  "never_started",
);
assert.equal(
  classifyBotDeliveryError(
    new Error("403: Forbidden: bot can't initiate conversation with a user"),
  ),
  "forbidden",
);
// Loose "forbidden"+"blocked" must NOT be blocked_bot (false positive source)
assert.equal(
  classifyBotDeliveryError(new Error("403: Forbidden: Something was blocked elsewhere")),
  "forbidden",
);
// Silent mode is app-side only — no Telegram error string → never blocked_bot
assert.equal(classifyBotDeliveryError(new Error("silent")), null);
assert.equal(classifyBotDeliveryError(new Error("timeout")), null);
assert.equal(classifyBotDeliveryError(new Error("429: Too Many Requests: retry after 3")), null);

const dmSrc = fs.readFileSync(path.join(root, "src/services/directMsg.ts"), "utf8");
// Aggressive sendChatAction pre-check must be gone (comments may still mention it)
assert.equal(dmSrc.includes("probeBotCanMessage"), false);
assert.equal(/\bapi\.sendChatAction\b|\.sendChatAction\(/.test(dmSrc), false);
assert.match(dmSrc, /targetClearlyReceivesBot/);
assert.match(dmSrc, /treatAsReachable/);
assert.match(dmSrc, /این کاربر ربات را در تلگرام بلاک کرده/);
assert.match(dmSrc, /telegramChatId/);
assert.match(dmSrc, /isCurrentChatPartner/);
assert.match(dmSrc, /treatAsReachable/);
// Old false-positive / long parenthetical copies must not remain
assert.equal(
  dmSrc.includes("امکان ارسال دایرکت نیست؛ این کاربر دریافت پیام از ربات را بسته است"),
  false,
);
assert.equal(dmSrc.includes("سایلنت بودن درخواست‌چت مانع دایرکت نیست"), false);
assert.equal(dmSrc.includes("بلاک کرده و الان نمی‌تواند پیام دایرکت بگیرد"), false);
assert.equal(dmSrc.includes("این کاربر فعلاً پیام ربات را نمی‌پذیرد"), false);
assert.equal(dmSrc.includes("فعلاً پیام ربات را نمی‌پذیرد"), false);
assert.equal(/\bapi\.sendChatAction\b|\.sendChatAction\(/.test(fs.readFileSync(path.join(root, "dist/services/directMsg.js"), "utf8")), false);
assert.equal(fs.readFileSync(path.join(root, "dist/services/directMsg.js"), "utf8").includes("سایلنت بودن درخواست‌چت مانع دایرکت نیست"), false);

const forever = new Date("9999-12-31T23:59:59.000Z");
assert.equal(silent.isChatSilent({ chatSilentUntil: forever }), true);
assert.equal(silent.isChatSilent({ chatSilentUntil: null }), false);
assert.equal(silent.isChatSilent({ chatSilentUntil: new Date(0) }), false);

const text = silent.silentRejectMessage("تست", "fa");
assert.match(text, /پیام دایرکت/);
assert.match(text, /نه دایرکت|سایلنت فقط/);

console.log("smoke-direct-msg-silent: ok");
