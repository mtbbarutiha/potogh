import type { Api, Bot } from "grammy";
import { getAdminIds } from "./lib/admin.js";
import { normalizeLang, type Lang } from "./i18n/index.js";

type BotCommand = { command: string; description: string };

/** دستورهای منوی عمومی — برای کاربر ثبت‌نام‌شدهٔ غیرچت (فارسی) */
export const FA_COMMANDS: BotCommand[] = [
  { command: "menu", description: "📋 منوی اصلی" },
  { command: "chat", description: "🙊 وصل به ناشناس" },
  { command: "explore", description: "🔍 جستجو کاربران" },
  { command: "profile", description: "👤 پروفایل" },
  { command: "diamonds", description: "💰 سکه" },
  { command: "anon", description: "🎭 لینک ناشناس من" },
  { command: "boost", description: "🚀 شتاب‌دهی" },
  { command: "pro", description: "🅿️ اشتراک پرو" },
  { command: "stats", description: "📊 آمار" },
];

/** Public command menu — for registered, non-chatting users (English) */
export const EN_COMMANDS: BotCommand[] = [
  { command: "menu", description: "📋 Main menu" },
  { command: "chat", description: "🙊 Connect to a stranger" },
  { command: "explore", description: "🔍 Search users" },
  { command: "profile", description: "👤 Profile" },
  { command: "diamonds", description: "💰 Coins" },
  { command: "anon", description: "🎭 My anonymous link" },
  { command: "boost", description: "🚀 Boost" },
  { command: "pro", description: "🅿️ Pro membership" },
  { command: "stats", description: "📊 Stats" },
];

/** سازگاری با کدهای قبلی */
export const BOT_COMMANDS = FA_COMMANDS;

/**
 * فقط حین چت — منوی اسلش را خلوت نگه دار تا /menu و بقیه
 * وسط چت کیبورد اصلی را برنگردانند.
 */
export const FA_CHATTING_COMMANDS: BotCommand[] = [
  { command: "end", description: "🔚 قطع چت" },
];

export const EN_CHATTING_COMMANDS: BotCommand[] = [
  { command: "end", description: "🔚 End chat" },
];

/** سازگاری با کدهای قبلی */
export const CHATTING_COMMANDS = FA_CHATTING_COMMANDS;

/** فقط برای ادمین — در منوی چت ادمین دیده می‌شود */
export const FA_ADMIN_COMMANDS: BotCommand[] = [
  ...FA_COMMANDS,
  { command: "admin", description: "🛠 پنل ادمین" },
  { command: "launch", description: "📡 داشبورد لانچ" },
  { command: "uptime", description: "⏱ آپ‌تایم ربات" },
  { command: "botlog", description: "📋 لاگ هنگ / تشخیص" },
  { command: "restart", description: "♻️ ری‌استارت ربات" },
];

export const EN_ADMIN_COMMANDS: BotCommand[] = [
  ...EN_COMMANDS,
  { command: "admin", description: "🛠 Admin panel" },
  { command: "launch", description: "📡 Launch dashboard" },
  { command: "uptime", description: "⏱ Bot uptime" },
  { command: "botlog", description: "📋 Hang diagnostics log" },
  { command: "restart", description: "♻️ Restart bot" },
];

/** سازگاری با کدهای قبلی */
export const ADMIN_COMMANDS = FA_ADMIN_COMMANDS;

function commandsFor(lang: Lang | string | null, set: "base" | "chatting" | "admin"): BotCommand[] {
  const L = normalizeLang(lang);
  if (set === "chatting") return L === "en" ? EN_CHATTING_COMMANDS : FA_CHATTING_COMMANDS;
  if (set === "admin") return L === "en" ? EN_ADMIN_COMMANDS : FA_ADMIN_COMMANDS;
  return L === "en" ? EN_COMMANDS : FA_COMMANDS;
}

export async function setupBotMenu(bot: Bot) {
  // منوی پیش‌فرض همه کاربران — بدون شروع ثبت‌نام و قطع چت
  await bot.api.setMyCommands([...FA_COMMANDS]);
  await bot.api.setMyCommands([...EN_COMMANDS], { language_code: "en" });

  const webAppUrl = (process.env.WEB_APP_URL ?? "").trim();
  if (webAppUrl.startsWith("https://")) {
    // همان URL مینی‌اپی که در BotFather می‌گذاری
    await bot.api.setChatMenuButton({
      menu_button: {
        type: "web_app",
        text: "دوردوریا",
        web_app: { url: webAppUrl },
      },
    });
    console.log("Mini App menu button set:", webAppUrl);
  } else {
    await bot.api.setChatMenuButton({
      menu_button: { type: "commands" },
    });
    if (webAppUrl) {
      console.warn(
        "WEB_APP_URL ignored (must be https://). Falling back to commands menu.",
      );
    }
  }

  // منوی اختصاصی ادمین‌ها
  for (const adminId of getAdminIds()) {
    try {
      await bot.api.setMyCommands([...FA_ADMIN_COMMANDS], {
        scope: { type: "chat", chat_id: adminId },
      });
    } catch (err) {
      console.error("setMyCommands for admin failed", adminId, err);
    }
  }
}

/** منوی عادی (ثبت‌نام‌شده، غیرچت) — بدون start/end */
export async function syncIdleUserMenu(
  api: Api,
  telegramId: bigint | number,
  lang: Lang | string | null = "fa",
) {
  const chatId = Number(telegramId);
  if (!Number.isFinite(chatId) || chatId <= 0 || chatId >= 9_000_000_000) return;
  const isAdmin = getAdminIds().includes(chatId);
  const cmds = isAdmin
    ? commandsFor(lang, "admin")
    : commandsFor(lang, "base");
  await api
    .setMyCommands(cmds, { scope: { type: "chat", chat_id: chatId } })
    .catch((err) => console.error("syncIdleUserMenu failed", chatId, err));
}

/** منوی حین چت — قطع چت اضافه می‌شود */
export async function syncChattingUserMenu(
  api: Api,
  telegramId: bigint | number,
  lang: Lang | string | null = "fa",
) {
  const chatId = Number(telegramId);
  if (!Number.isFinite(chatId) || chatId <= 0 || chatId >= 9_000_000_000) return;
  const isAdmin = getAdminIds().includes(chatId);
  const cmds = isAdmin
    ? [
        ...commandsFor(lang, "chatting"),
        {
          command: "admin",
          description: normalizeLang(lang) === "en" ? "🛠 Admin panel" : "🛠 پنل ادمین",
        },
      ]
    : commandsFor(lang, "chatting");
  await api
    .setMyCommands(cmds, { scope: { type: "chat", chat_id: chatId } })
    .catch((err) => console.error("syncChattingUserMenu failed", chatId, err));
}
