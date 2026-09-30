/**
 * Smoke-test: channel dedupe guard.
 * Never sends to Telegram. Uses an isolated temp log + dryRun.
 *
 * Usage: npx tsx scripts/smoke-channel-dedupe.ts
 * Exit 0 = pass, 1 = fail
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  appendLogEntry,
  buildFingerprint,
  channelPublish,
  normalizeCaption,
  type PublishLogEntry,
} from "./lib/channelPublish.ts";

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "channel-dedupe-"));
  const logFile = path.join(tmpDir, "channel-publish-log.json");
  process.env.CHANNEL_PUBLISH_LOG = logFile;

  const caption =
    "از خونه، بدون خروج\nروزی ۴۰ دعوت → حدود ماهی ۳۰ میلیون تومان\nدوردوریا smoke-test-unique-" +
    Date.now();

  // 1) dry-run should succeed (no log write)
  const first = await channelPublish({
    kind: "text",
    caption,
    dryRun: true,
    label: "smoke-1",
  });
  if (!first.ok) {
    console.error("FAIL: first dry-run should succeed", first);
    process.exit(1);
  }
  if (fs.existsSync(logFile)) {
    console.error("FAIL: dry-run must not write durable log");
    process.exit(1);
  }
  console.log("OK dry-run #1:", first.fingerprint.slice(0, 16));

  // 2) simulate a prior successful publish by seeding the log
  const seeded: PublishLogEntry = {
    message_id: 999001,
    fingerprint: first.fingerprint,
    captionNorm: normalizeCaption(caption),
    mediaHash: null,
    mediaName: null,
    kind: "text",
    createdAt: new Date().toISOString(),
    chatId: "@Patoghchatbot",
    label: "smoke-seed",
  };
  appendLogEntry(seeded, logFile);

  // 3) identical caption must be blocked
  const second = await channelPublish({
    kind: "text",
    caption,
    dryRun: true,
    label: "smoke-2",
  });
  if (second.ok) {
    console.error("FAIL: duplicate should be blocked", second);
    process.exit(1);
  }
  if (second.code !== "DUPLICATE") {
    console.error("FAIL: expected DUPLICATE", second);
    process.exit(1);
  }
  if (!/تکراری|Duplicate/i.test(second.reason + second.reasonFa)) {
    console.error("FAIL: bilingual reason missing", second);
    process.exit(1);
  }
  console.log("OK blocked duplicate:", second.reasonFa);

  // 4) emoji / whitespace variance of same caption must also block
  const variant =
    caption.replace(/\n/g, "  \n  ") + " ✨🎵";
  const third = await channelPublish({
    kind: "text",
    caption: variant,
    dryRun: true,
    label: "smoke-3",
  });
  if (third.ok || third.code !== "DUPLICATE") {
    console.error("FAIL: normalized caption variant should block", third);
    process.exit(1);
  }
  console.log("OK blocked caption variant");

  // 5) fingerprint helpers sanity
  const a = normalizeCaption("Hello ✨ World");
  const b = normalizeCaption("hello   world");
  if (a !== b) {
    console.error("FAIL: normalizeCaption mismatch", a, b);
    process.exit(1);
  }
  const fp = buildFingerprint(a, null, "text");
  if (fp.length !== 64) {
    console.error("FAIL: fingerprint length", fp);
    process.exit(1);
  }
  console.log("OK normalize + fingerprint");

  // cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log("SMOKE PASS — no Telegram sends performed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
