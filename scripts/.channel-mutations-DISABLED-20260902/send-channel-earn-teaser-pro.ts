throw new Error("BLOCKED: use scripts/channel-publish.ts (channelPublish). Teaser live @218 — gateway refuses duplicate. See CHANNEL_PUBLISH.md");
/**
 * پست کانال — تیزر حرفه‌ای «کسب درآمد / دعوت» (با موسیقی)
 * Usage: npx tsx scripts/send-channel-earn-teaser-pro.ts
 *
 * HARD RULE: publish ONCE to @Patoghchatbot only after local review.
 * Do NOT post to private chats / bot DMs.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Bot, InlineKeyboard, InputFile } from "grammy";

const CHAT =
  process.env.FORCE_JOIN_CHAT_ID ||
  process.env.FORCE_JOIN_CHANNEL ||
  "@Patoghchatbot";

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

function probe(file: string) {
  const out = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration,size:stream=codec_type,codec_name,width,height",
      "-of",
      "json",
      file,
    ],
    { encoding: "utf8" },
  );
  return JSON.parse(out) as {
    format: { duration: string; size: string };
    streams: Array<{
      codec_type: string;
      codec_name: string;
      width?: number;
      height?: number;
    }>;
  };
}

async function main() {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error("BOT_TOKEN missing");
  if (!fs.existsSync(FILE)) throw new Error(`video missing: ${FILE}`);

  const info = probe(FILE);
  const duration = Math.round(Number(info.format.duration));
  const hasAudio = info.streams.some((s) => s.codec_type === "audio");
  const video = info.streams.find((s) => s.codec_type === "video");
  if (!hasAudio) throw new Error("refusing to publish: no audio stream");
  if (!video || video.width !== 1080 || video.height !== 1920) {
    throw new Error(
      `refusing to publish: expected 1080x1920, got ${video?.width}x${video?.height}`,
    );
  }
  if (duration < 20 || duration > 45) {
    throw new Error(`refusing to publish: unexpected duration ${duration}s`);
  }

  // Safety: never allow accidental DM / private chat targets
  const chatStr = String(CHAT);
  if (!chatStr.includes("Patoghchatbot") && !chatStr.startsWith("-100")) {
    throw new Error(`refusing non-channel target: ${CHAT}`);
  }

  const kb = new InlineKeyboard().url("شروع در دوردوریا", BOT_LINK);
  const bot = new Bot(token);

  console.log(`posting pro teaser → ${CHAT}`);
  console.log(`duration=${duration}s audio=${hasAudio} sizeMB=${(
    Number(info.format.size) /
    (1024 * 1024)
  ).toFixed(2)}`);
  console.log(`caption chars: ${CAPTION.length}`);

  const opts: Parameters<typeof bot.api.sendVideo>[2] = {
    caption: CAPTION,
    reply_markup: kb,
    supports_streaming: true,
    duration,
    width: 1080,
    height: 1920,
  };
  if (fs.existsSync(THUMB)) {
    opts.thumbnail = new InputFile(THUMB);
  }

  const sent = await bot.api.sendVideo(CHAT, new InputFile(FILE), opts);
  console.log("ok message_id", sent.message_id);
  console.log(`https://t.me/Patoghchatbot/${sent.message_id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
