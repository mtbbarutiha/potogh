/**
 * Earn teaser — goes through channelPublish gateway (dedupe).
 * Live post: https://t.me/Patoghchatbot/218 — republish will be refused.
 *
 * Usage (will exit 1 if duplicate of 218):
 *   npx tsx scripts/send-channel-earn-teaser-pro.ts
 *   npx tsx scripts/send-channel-earn-teaser-pro.ts --dry-run
 *
 * Always use channelPublish; never raw sendVideo to the channel.
 * See CHANNEL_PUBLISH.md
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { InlineKeyboard } from "grammy";
import {
  channelPublish,
  formatResult,
  seedPublishLog,
  buildFingerprint,
  normalizeCaption,
  hashFile,
} from "./lib/channelPublish.ts";

const BOT_LINK = "https://t.me/Patoghchatbot";
const FILE = path.resolve(
  process.cwd(),
  "assets/banners/channel-posts/channel-earn-teaser-pro.mp4",
);
const THUMB = path.resolve(
  process.cwd(),
  "assets/banners/channel-posts/earn-teaser-pro/composed/02_hook.png",
);
const CAPTION = [
  "از خونه، بدون خروج ✨",
  "",
  "روزی ۴۰ دعوت → حدود ماهی ۳۰ میلیون تومان",
  "۲۵ سکه × ۴۰ × ۱٬۰۰۰ تومان",
  "",
  "معرفی دوستان ← سکه ← کسب درآمد ← فروش/کارت",
  "",
  "دوردوریا",
  BOT_LINK,
].join("\n");

async function ensureSeeded() {
  const chatId =
    process.env.FORCE_JOIN_CHAT_ID ||
    process.env.FORCE_JOIN_CHANNEL ||
    "@Patoghchatbot";
  const mediaHash = fs.existsSync(FILE) ? hashFile(FILE) : null;
  const captionNorm = normalizeCaption(CAPTION);
  seedPublishLog({
    message_id: 218,
    fingerprint: buildFingerprint(captionNorm, mediaHash, "video"),
    captionNorm,
    mediaHash,
    mediaName: "channel-earn-teaser-pro.mp4",
    kind: "video",
    chatId: String(chatId),
    label: "earn-teaser-pro-live",
  });
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  await ensureSeeded();

  const result = await channelPublish({
    kind: "video",
    mediaPath: FILE,
    caption: CAPTION,
    ...(fs.existsSync(THUMB) ? { thumbnailPath: THUMB } : {}),
    replyMarkup: new InlineKeyboard().url("شروع در دوردوریا", BOT_LINK),
    duration: 30,
    width: 1080,
    height: 1920,
    supportsStreaming: true,
    dryRun,
    label: "send-channel-earn-teaser-pro",
  });

  console.log(formatResult(result));
  if (!result.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
