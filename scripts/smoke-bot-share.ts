import { Bot } from "grammy";
import { sendBotShareCard } from "../src/services/botShare.js";

async function main() {
  const token = process.env.BOT_TOKEN!;
  const adminId = Number(process.env.ADMIN_ID);
  if (!token || !adminId) throw new Error("BOT_TOKEN/ADMIN_ID required");
  const bot = new Bot(token);
  const me = await bot.api.getMe();
  const link = `https://t.me/${me.username}`;

  const ctx = {
    api: bot.api,
    replyWithPhoto: (photo: string, extra: object) =>
      bot.api.sendPhoto(adminId, photo, extra as never),
    reply: (text: string, extra?: object) =>
      bot.api.sendMessage(adminId, text, extra as never),
  };

  await sendBotShareCard(ctx as never, {
    lang: "fa",
    kind: "referral",
    link,
    bonusLabel: "تست کارت اشتراک‌گذاری — عکس + توضیح + دکمه شِیر",
  });
  console.log("ok sent to", adminId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
