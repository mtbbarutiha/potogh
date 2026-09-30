import { Composer, InlineKeyboard, type Context } from "grammy";
import { requireRegistered } from "../services/register.js";
import {
  mainKeyboard,
  chattingKeyboard,
  coinsShopKeyboard,
  searchPanelKeyboard,
} from "../keyboards/main.js";
import { langOf, t, tr, btnAll } from "../i18n/index.js";
import { sendProfileCard } from "../services/profile.js";
import { promptQuickMatchGender } from "../services/match.js";
import { patchUser, ensureUserCode } from "../db/users.js";
import { formatNum, BOOST_COST, BOOST_HOURS, coinsShopIntroText } from "../data/packages.js";
import { prisma } from "../db/prisma.js";
import { showProfileByUserCode } from "../services/explore.js";

export const commandsHandler = new Composer();

/** منوی اصلی — کیبورد پایین + راهنما */
export async function showMainMenu(
  ctx: {
    reply: (t: string, extra?: object) => Promise<unknown>;
    from?: { id: number } | undefined;
  },
  lang?: ReturnType<typeof langOf>,
) {
  const L = lang ?? "fa";
  await ctx.reply(t(L, "main_menu"), { reply_markup: mainKeyboard(L) });
}

commandsHandler.command("menu", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  const lang = langOf(user);
  // /menu mid-chat must NOT swap reply keyboard back to main menu
  if (user.state === "chatting") {
    await ctx.reply(
      lang === "en"
        ? "You're in a chat. End it first (/end)."
        : "الان در چت هستی. اول قطع کن (/end).",
      { reply_markup: chattingKeyboard(user.secureChat, lang) },
    );
    return;
  }
  await showMainMenu(ctx, lang);
});

/** قطع چت — از منوی اسلش حین چت */
commandsHandler.command("end", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  const lang = langOf(user);
  if (user.state !== "chatting" && !user.chatPartnerId) {
    await ctx.reply(t(lang, "not_chatting"));
    return;
  }
  const { confirmEndChatKeyboard } = await import("../keyboards/main.js");
  await ctx.reply(t(lang, "end_chat_confirm"), {
    reply_markup: confirmEndChatKeyboard(lang),
  });
});

/** سلامت ربات — برای دیباگ سریع */
commandsHandler.command("ping", async (ctx) => {
  const t0 = Date.now();
  await ctx.reply(`pong ✅ (${Date.now() - t0}ms)`);
});

/** کاربر اشتباهاً /setinline را داخل خود بات می‌زند */
commandsHandler.command("setinline", async (ctx) => {
  await ctx.reply(
    [
      "❌ این دستور را نباید اینجا بزنی.",
      "",
      "✅ درست این‌طوریه:",
      "۱) از این چت برو بیرون",
      "۲) باز کن: @BotFather",
      "۳) بفرست: /setinline",
      "۴) از لیست انتخاب کن: @Patoghchatbot",
      "۵) متن نمونه را بفرست، مثلاً:",
      "جستجوی کاربران",
      "",
      "اگر BotFather گفت Inline mode enabled — تمام است.",
      "بعد برگرد اینجا و دوباره «🎯 پیدا کردن» را بزن.",
    ].join("\n"),
    {
      reply_markup: new InlineKeyboard().url(
        "فتح BotFather",
        "https://t.me/BotFather",
      ),
    },
  );
});

/** /user_XXXX — باز کردن پروفایل از لیست سرچ */
commandsHandler.hears(/^\/user_([A-Za-z0-9]+)/, async (ctx, next) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  // اگر ادمین وسط افزودن سکه است، این پیام را ندزد
  if (
    user.state === "admin_give_code" ||
    user.state === "admin_give_amount" ||
    user.state === "admin_give_confirm" ||
    user.state === "admin_clear_photo_code" ||
    user.state === "admin_ban_code" ||
    user.state === "admin_unban_code"
  ) {
    return next();
  }
  const code = ctx.match[1]!;
  await showProfileByUserCode(ctx, user.id, code);
});

commandsHandler.command("profile", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  if (user.state === "chatting") {
    const lang = langOf(user);
    await ctx.reply(
      lang === "en"
        ? "You're in a chat. End it first (/end)."
        : "الان در چت هستی. اول قطع کن (/end).",
      { reply_markup: chattingKeyboard(user.secureChat, lang) },
    );
    return;
  }
  if (!user.userCode) await ensureUserCode(user.id, user.userCode);
  await sendProfileCard(ctx, user.id);
});

commandsHandler.command("explore", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  const lang = langOf(user);
  if (user.state === "chatting") {
    await ctx.reply(
      lang === "en"
        ? "End your current chat first (/end)."
        : "اول چت فعلی را قطع کن (/end).",
      { reply_markup: chattingKeyboard(user.secureChat, lang) },
    );
    return;
  }
  await ctx.reply(t(lang, "search_pick"), {
    reply_markup: searchPanelKeyboard(lang),
  });
});

commandsHandler.command("chat", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  const lang = langOf(user);
  if (user.state === "chatting") {
    await ctx.reply(
      lang === "en"
        ? "You're in a chat. End it first."
        : "الان در چت هستی. اول قطع کن.",
      { reply_markup: chattingKeyboard(user.secureChat, lang) },
    );
    return;
  }
  await promptQuickMatchGender(ctx, user.id);
});

commandsHandler.command("anon", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  const lang = langOf(user);
  if (user.state === "chatting") {
    await ctx.reply(
      lang === "en"
        ? "You're in a chat. End it first (/end)."
        : "الان در چت هستی. اول قطع کن (/end).",
      { reply_markup: chattingKeyboard(user.secureChat, lang) },
    );
    return;
  }
  const me = await ctx.api.getMe();
  const link = `https://t.me/${me.username}?start=anon_${user.anonCode}`;
  const { sendBotShareCard } = await import("../services/botShare.js");
  await sendBotShareCard(ctx, {
    lang: lang === "en" ? "en" : "fa",
    kind: "anon",
    link,
  });
});

commandsHandler.command("diamonds", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  const lang = langOf(user);
  if (user.state === "chatting") {
    await ctx.reply(
      lang === "en"
        ? "You're in a chat. End it first (/end)."
        : "الان در چت هستی. اول قطع کن (/end).",
      { reply_markup: chattingKeyboard(user.secureChat, lang) },
    );
    return;
  }
  const L = lang === "en" ? "en" : "fa";
  await ctx.reply(coinsShopIntroText(L, user.diamonds), {
    reply_markup: coinsShopKeyboard(user.lastDailyCoinAt, lang),
  });
});

commandsHandler.command("voucher", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  const lang = langOf(user);
  if (user.state === "chatting") {
    await ctx.reply(
      lang === "en"
        ? "You're in a chat. End it first (/end)."
        : "الان در چت هستی. اول قطع کن (/end).",
      { reply_markup: chattingKeyboard(user.secureChat, lang) },
    );
    return;
  }
  const parts = (ctx.message?.text ?? "").trim().split(/\s+/);
  const code = parts.slice(1).join(" ");
  if (!code) {
    const { patchUser } = await import("../db/users.js");
    await patchUser(user.id, { state: "await_voucher_code" });
    await ctx.reply(
      tr(
        lang,
        "🎟 کد هدیه را بفرست:\nمثال: /voucher PATOGH100",
        "🎟 Send gift code:\nExample: /voucher PATOGH100",
      ),
    );
    return;
  }
  const { redeemVoucher } = await import("../services/vouchers.js");
  const { patchUser } = await import("../db/users.js");
  const result = await redeemVoucher(user.id, code);
  await patchUser(user.id, { state: "idle" });
  if (!result.ok) {
    await ctx.reply(
      tr(lang, "❌ کد قابل استفاده نیست.", "❌ Code cannot be used."),
      { reply_markup: mainKeyboard(lang) },
    );
    return;
  }
  await ctx.reply(
    tr(
      lang,
      `✅ +${formatNum(result.amount)} سکه\nموجودی: ${formatNum(result.balance)} 💰`,
      `✅ +${formatNum(result.amount)} coins\nBalance: ${formatNum(result.balance)} 💰`,
    ),
    { reply_markup: mainKeyboard(lang) },
  );
});

/** اجرای شتاب‌دهی — از دستور /boost و دکمه منو */
async function runBoost(ctx: Context) {
  const user = await requireRegistered(ctx);
  if (!user) return;
  const lang = langOf(user);
  if (user.state === "chatting") {
    await ctx.reply(
      lang === "en"
        ? "You're in a chat. End it first (/end)."
        : "الان در چت هستی. اول قطع کن (/end).",
      { reply_markup: chattingKeyboard(user.secureChat, lang) },
    );
    return;
  }
  const locale = lang === "en" ? "en-US" : "fa-IR";
  if (user.boostUntil && user.boostUntil > new Date()) {
    await ctx.reply(
      lang === "en"
        ? `⚡ Boost active until ${user.boostUntil.toLocaleString(locale)}`
        : `⚡ شتاب‌دهی فعال تا ${user.boostUntil.toLocaleString(locale)}`,
    );
    return;
  }
  if (user.diamonds < BOOST_COST) {
    await ctx.reply(
      lang === "en"
        ? `Not enough coins. Need: ${formatNum(BOOST_COST)}`
        : `سکه کافی نیست. نیاز: ${formatNum(BOOST_COST)}`,
    );
    return;
  }
  const { debitCoins } = await import("../services/coins.js");
  const until = new Date(Date.now() + BOOST_HOURS * 3600_000);
  const ok = await debitCoins(user.id, BOOST_COST);
  if (!ok) {
    await ctx.reply(
      lang === "en" ? "Not enough coins." : "سکه کافی نیست.",
    );
    return;
  }
  await patchUser(user.id, { boostUntil: until });
  await ctx.reply(
    t(lang, "boost_on", {
      until: until.toLocaleString(locale),
      cost: formatNum(BOOST_COST),
    }),
  );
}

commandsHandler.command("boost", runBoost);
commandsHandler.hears(btnAll("BOOST"), runBoost);

commandsHandler.command("stats", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  const lang = langOf(user);
  if (user.state === "chatting") {
    await ctx.reply(
      lang === "en"
        ? "You're in a chat. End it first (/end)."
        : "الان در چت هستی. اول قطع کن (/end).",
      { reply_markup: chattingKeyboard(user.secureChat, lang) },
    );
    return;
  }
  const totalUsers = await prisma.user.count({ where: { registered: true } });
  await ctx.reply(
    lang === "en"
      ? [
          "📊 Stats",
          `👁 Views: ${formatNum(user.viewsCount)}`,
          `❤️ Likes: ${formatNum(user.likesCount)}`,
          `💬 Chats: ${formatNum(user.chatsCount)}`,
          `💰 Coins: ${formatNum(user.diamonds)}`,
          `Active users: ${formatNum(totalUsers)}`,
        ].join("\n")
      : [
          "📊 آمار",
          `👁 بازدید: ${formatNum(user.viewsCount)}`,
          `❤️ لایک: ${formatNum(user.likesCount)}`,
          `💬 چت: ${formatNum(user.chatsCount)}`,
          `💰 سکه: ${formatNum(user.diamonds)}`,
          `کاربران فعال: ${formatNum(totalUsers)}`,
        ].join("\n"),
  );
});
