throw new Error("BLOCKED: rewrite to channelPublish() after explicit approval. See CHANNEL_PUBLISH.md");
/**
 * پست کانال — ویدیوی آموزشی HQ «کسب درآمد» (با موسیقی پس‌زمینه)
 * Usage: npx tsx scripts/send-channel-earn-tutorial-hq.ts
 *
 * Optional env:
 *   DELETE_OLD_TUTORIAL_IDS=179,180  (comma-separated message ids to delete first)
 */
import "dotenv/config";
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
  "assets/banners/channel-posts/channel-earn-tutorial-hq.mp4",
);

const THUMB = path.resolve(
  process.cwd(),
  "assets/banners/channel-posts/earn-tutorial-hq/composed/01_hq_01_title.png",
);

const CAPTION = [
  "آموزش کسب درآمد در دوردوریا ✨",
  "",
  "ویدیوی کوتاه و واضح — مسیر فروش سکه گام‌به‌گام:",
  "",
  "۱) منوی اصلی ربات",
  "۲) معرفی دوستان ← ۲۵ سکه",
  "۳) دکمه «کسب درآمد 💵»",
  "۴) نرخ ۱٬۰۰۰ تومان / سکه · حداقل ۱٬۰۰۰ سکه",
  "۵) فروش ← تأیید ← کارت ۱۶ رقمی",
  "۶) واریز پس از بررسی ادمین",
  "",
  "نسخه باکیفیت‌تر با موسیقی پس‌زمینه 🎵",
  "",
  "همین حالا شروع کن 👇",
  BOT_LINK,
  "",
  "#دوردوریا #کسب_درآمد #آموزش #فروش_سکه",
].join("\n");

async function maybeDeleteOld(bot: Bot, chatId: string | number) {
  const raw = process.env.DELETE_OLD_TUTORIAL_IDS || "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
  for (const id of ids) {
    try {
      await bot.api.deleteMessage(chatId, id);
      console.log("deleted old message_id", id);
    } catch (e) {
      console.warn("could not delete", id, String(e));
    }
  }
}

async function main() {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error("BOT_TOKEN missing");
  if (!fs.existsSync(FILE)) throw new Error(`video missing: ${FILE}`);

  const kb = new InlineKeyboard().url("ورود به ربات", BOT_LINK);
  const bot = new Bot(token);

  console.log(`posting HQ video → ${CHAT}`);
  console.log(`caption chars: ${CAPTION.length}`);
  console.log(`file size MB: ${(fs.statSync(FILE).size / (1024 * 1024)).toFixed(2)}`);

  await maybeDeleteOld(bot, CHAT);

  const opts: Parameters<typeof bot.api.sendVideo>[2] = {
    caption: CAPTION,
    reply_markup: kb,
    supports_streaming: true,
    duration: 37,
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
