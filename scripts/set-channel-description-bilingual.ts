/**
 * Set @Patoghchatbot description (FA+EN) with tappable bot link in the body.
 * Does not post or pin — bot entry lives in the description, not a stub message.
 *
 * Usage: npx tsx scripts/set-channel-description-bilingual.ts
 * Requires: bot admin with can_change_info.
 */
import "dotenv/config";
import { Bot } from "grammy";

const CHAT =
  process.env.FORCE_JOIN_CHAT_ID ||
  process.env.FORCE_JOIN_CHANNEL ||
  "@Patoghchatbot";

/** Keep ≤255 chars. URL/@username are clickable in Telegram channel descriptions. */
const CHANNEL_DESCRIPTION = [
  "دوردوریا — جایی برای گپ ناشناس با نزدیک‌ها، دایرکت و ویس.",
  "سکه بگیر و دوستات رو دعوت کن.",
  "ربات: https://t.me/Patoghchatbot · @Patoghchatbot",
  "Patogh — anonymous chat, nearby, coins & invites.",
].join("\n");

async function main() {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error("BOT_TOKEN missing");
  if (CHANNEL_DESCRIPTION.length > 255) {
    throw new Error(
      `description too long: ${CHANNEL_DESCRIPTION.length} (max 255)`,
    );
  }

  const bot = new Bot(token);
  const me = await bot.api.getMe();
  const member = await bot.api.getChatMember(CHAT, me.id);
  if (member.status !== "administrator" && member.status !== "creator") {
    throw new Error(
      `Bot @${me.username} is not admin in ${CHAT} (status: ${member.status})`,
    );
  }

  try {
    await bot.api.setChatDescription(CHAT, CHANNEL_DESCRIPTION);
  } catch (err: unknown) {
    const text = err instanceof Error ? err.message : String(err);
    if (!/not modified/i.test(text)) throw err;
    console.log("description unchanged");
  }

  const chat = await bot.api.getChat(CHAT);
  if ("description" in chat) {
    console.log("description:\n" + chat.description);
  }
  if ("pinned_message" in chat && chat.pinned_message) {
    console.log(
      "warning: still pinned message_id=",
      chat.pinned_message.message_id,
    );
  } else {
    console.log("pinned: none");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
