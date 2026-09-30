import { Composer, InlineKeyboard } from "grammy";
import { findByTelegram, patchUser } from "../db/users.js";
import { requireRegistered } from "../services/register.js";
import {
  mainKeyboard,
  coinsShopKeyboard,
  searchPanelKeyboard,
  locationKeyboard,
  chattingKeyboard,
  confirmEndChatKeyboard,
} from "../keyboards/main.js";
import { btnAll, langOf, t, fullGuide } from "../i18n/index.js";
import {
  formatNum,
  BOOST_COST,
  BOOST_HOURS,
  REFERRAL_BONUS,
  coinsShopIntroText,
} from "../data/packages.js";
import { tryQuickMatch, leaveQueueOrChat, promptQuickMatchGender } from "../services/match.js";
import { prisma } from "../db/prisma.js";
import { safeAnswerCallback } from "../lib/telegramSafe.js";

export const menuHandler = new Composer();

/** Main-menu actions must not replace the chat reply keyboard mid-chat. */
async function blockIfChatting(
  ctx: { reply: (text: string, extra?: object) => Promise<unknown> },
  user: { state: string; secureChat: boolean; language?: string | null },
): Promise<boolean> {
  if (user.state !== "chatting") return false;
  const lang = langOf(user);
  await ctx.reply(
    lang === "en"
      ? "You're in a chat. End it first (/end)."
      : "الان در چت هستی. اول قطع کن (/end).",
    { reply_markup: chattingKeyboard(user.secureChat, lang) },
  );
  return true;
}

menuHandler.hears(btnAll("PROFILE"), async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  if (await blockIfChatting(ctx, user)) return;
  const { sendProfileCard } = await import("../services/profile.js");
  await sendProfileCard(ctx, user.id);
});

menuHandler.hears(btnAll("QUICK_CHAT"), async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  if (await blockIfChatting(ctx, user)) return;
  await promptQuickMatchGender(ctx, user.id);
});

menuHandler.hears(btnAll("NEARBY"), async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  if (await blockIfChatting(ctx, user)) return;
  const lang = langOf(user);
  const hasSaved =
    user.latitude != null &&
    user.longitude != null &&
    Number.isFinite(user.latitude) &&
    Number.isFinite(user.longitude);

  if (hasSaved) {
    // شعاع همان اول — بدون مرحلهٔ لوکیشن ذخیره‌شده/تازه
    const { askNearbyRadius } = await import("../services/nearbyUi.js");
    await askNearbyRadius(ctx, lang, { showUpdateLocation: true });
    return;
  }

  await patchUser(user.id, { state: "await_location" });
  await ctx.reply(
    lang === "en"
      ? [
          t(lang, "nearby_title"),
          "",
          "You don't have a saved location yet.",
          "Share your current location, then pick a radius (5–100 km).",
          "Exact coordinates are never shown to others.",
        ].join("\n")
      : [
          t(lang, "nearby_title"),
          "",
          "هنوز موقعیت ذخیره‌شده نداری.",
          "موقعیت فعلی‌ات را بفرست، بعد شعاع ۵ تا ۱۰۰ کیلومتر را انتخاب کن.",
          "مختصات دقیق به کسی نشان داده نمی‌شود.",
        ].join("\n"),
    { reply_markup: locationKeyboard(lang) },
  );
});

menuHandler.hears(btnAll("SEARCH"), async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  if (await blockIfChatting(ctx, user)) return;
  const lang = langOf(user);
  await ctx.reply(t(lang, "search_pick"), {
    reply_markup: searchPanelKeyboard(lang),
  });
});

menuHandler.hears(btnAll("GUIDE"), async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  if (await blockIfChatting(ctx, user)) return;
  const lang = langOf(user);
  // بدون reply_markup تا کیبورد اصلی وسط اسکرول دوباره لنگر نشود
  await ctx.reply(fullGuide(lang));
});

menuHandler.hears(btnAll("DIAMONDS"), async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  if (await blockIfChatting(ctx, user)) return;
  const lang = langOf(user);
  await ctx.reply(coinsShopIntroText(lang, user.diamonds), {
    reply_markup: coinsShopKeyboard(user.lastDailyCoinAt, lang),
  });
});

menuHandler.hears(btnAll("EARN"), async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  if (await blockIfChatting(ctx, user)) return;
  const lang = langOf(user);
  const {
    earnIntroText,
    userHasOpenSell,
  } = await import("../services/coinSell.js");
  const { InlineKeyboard } = await import("grammy");
  const { MIN_SELL_COINS } = await import("../data/packages.js");
  const balance = user.diamonds ?? 0;
  const pending = await userHasOpenSell(user.id);
  const kb = new InlineKeyboard();
  if (pending) {
    kb.text(
      lang === "en" ? "⏳ Payout pending review" : "⏳ در انتظار بررسی ادمین",
      "earn:close",
    ).row();
  } else if (balance >= MIN_SELL_COINS) {
    kb.text(lang === "en" ? "💵 Sell my balance" : "💵 فروش موجودی", "earn:sell")
      .success()
      .row();
  } else {
    // موجودی کم — دکمه را نشان بده ولی خاموش/قفل تا کاربر بداند چرا
    kb.text(
      lang === "en"
        ? `🔒 Sell (need ${formatNum(MIN_SELL_COINS)} coins)`
        : `🔒 فروش (حداقل ${formatNum(MIN_SELL_COINS)} سکه)`,
      "earn:need_more",
    ).row();
  }
  kb.text(lang === "en" ? "↩️ Close" : "↩️ بستن", "earn:close");
  await ctx.reply(earnIntroText(lang, balance), { reply_markup: kb });
});

menuHandler.hears(btnAll("REFERRAL"), async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  if (await blockIfChatting(ctx, user)) return;
  const lang = langOf(user);
  const me = await ctx.api.getMe();
  const link = `https://t.me/${me.username}?start=ref_${user.referralCode}`;
  const { sendBotShareCard } = await import("../services/botShare.js");
  await sendBotShareCard(ctx, {
    lang: lang === "en" ? "en" : "fa",
    kind: "referral",
    link,
    bonusLabel:
      lang === "en"
        ? `Each successful invite: ${formatNum(REFERRAL_BONUS)} free coins 💰`
        : `هر دعوت موفق: ${formatNum(REFERRAL_BONUS)} سکه رایگان برای تو 💰`,
  });
});

menuHandler.hears(btnAll("ANON_LINK"), async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  if (await blockIfChatting(ctx, user)) return;
  const lang = langOf(user);
  const me = await ctx.api.getMe();
  const link = `https://t.me/${me.username}?start=anon_${user.anonCode}`;
  const { sendBotShareCard } = await import("../services/botShare.js");
  await sendBotShareCard(ctx, {
    lang: lang === "en" ? "en" : "fa",
    kind: "anon",
    link,
  });
});

/** سازگاری دستورات قدیمی */
menuHandler.hears(btnAll("BOOST"), async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  if (await blockIfChatting(ctx, user)) return;
  const lang = langOf(user);
  const locale = lang === "en" ? "en-US" : "fa-IR";
  if (user.boostUntil && user.boostUntil > new Date()) {
    await ctx.reply(
      lang === "en"
        ? `💎 Your Pro subscription is active until ${user.boostUntil.toLocaleString(locale)}`
        : `💎 اشتراک پرو تو فعال است تا ${user.boostUntil.toLocaleString(locale)}`,
    );
    return;
  }
  if (user.diamonds < BOOST_COST) {
    await ctx.reply(
      lang === "en"
        ? [
            "💎 Pro subscription",
            `Cost: ${formatNum(BOOST_COST)} coins for ${BOOST_HOURS} hours`,
            `Balance: ${formatNum(user.diamonds)} coins`,
            "Not enough coins — buy from «🪙 Coins».",
          ].join("\n")
        : [
            "💎 اشتراک پرو",
            `هزینه: ${formatNum(BOOST_COST)} سکه برای ${BOOST_HOURS} ساعت`,
            `موجودی: ${formatNum(user.diamonds)} سکه`,
            "سکه کافی نیست — از «🪙 سکه» بخر.",
          ].join("\n"),
    );
    return;
  }
  const { debitCoins } = await import("../services/coins.js");
  const until = new Date(Date.now() + BOOST_HOURS * 3600_000);
  const ok = await debitCoins(user.id, BOOST_COST);
  if (!ok) {
    await ctx.reply(
      lang === "en"
        ? "Not enough coins."
        : "سکه کافی نیست.",
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
});

menuHandler.hears(btnAll("STATS"), async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  if (await blockIfChatting(ctx, user)) return;
  const lang = langOf(user);
  const totalUsers = await prisma.user.count({ where: { registered: true } });
  await ctx.reply(
    lang === "en"
      ? [
          "📊 Stats",
          `• Views: ${formatNum(user.viewsCount)}`,
          `• Likes: ${formatNum(user.likesCount)}`,
          `• Chats: ${formatNum(user.chatsCount)}`,
          `• Coins: ${formatNum(user.diamonds)}`,
          `Patogh users: ${formatNum(totalUsers)}`,
        ].join("\n")
      : [
          "📊 آمار",
          `• بازدید: ${formatNum(user.viewsCount)}`,
          `• لایک: ${formatNum(user.likesCount)}`,
          `• چت‌ها: ${formatNum(user.chatsCount)}`,
          `• سکه: ${formatNum(user.diamonds)}`,
          `کاربران پاتوق: ${formatNum(totalUsers)}`,
        ].join("\n"),
  );
});

menuHandler.hears(btnAll("CANCEL_WAIT"), async (ctx) => {
  const user = await findByTelegram(ctx.from!.id);
  if (!user) return;
  if (await blockIfChatting(ctx, user)) return;
  const lang = langOf(user);
  await leaveQueueOrChat(ctx.api, user, false);
  await patchUser(user.id, { state: "idle" });
  await ctx.reply(t(lang, "search_cancelled"), {
    reply_markup: mainKeyboard(lang),
  });
});

menuHandler.hears(btnAll("END_CHAT"), async (ctx) => {
  const user = await findByTelegram(ctx.from!.id);
  if (!user) return;
  const lang = langOf(user);
  if (user.state !== "chatting" && !user.chatPartnerId) {
    await ctx.reply(t(lang, "not_chatting"));
    return;
  }
  await ctx.reply(t(lang, "end_chat_confirm"), {
    reply_markup: confirmEndChatKeyboard(lang),
  });
});

menuHandler.callbackQuery("chat:end", async (ctx) => {
  await safeAnswerCallback(ctx);
  const user = await findByTelegram(ctx.from!.id);
  if (!user) return;
  const lang = langOf(user);
  if (user.state !== "chatting" && !user.chatPartnerId) {
    await ctx.reply(t(lang, "not_chatting"));
    return;
  }
  await ctx.reply(t(lang, "end_chat_confirm"), {
    reply_markup: confirmEndChatKeyboard(lang),
  });
});

menuHandler.callbackQuery("chat:end:yes", async (ctx) => {
  await safeAnswerCallback(ctx);
  const user = await findByTelegram(ctx.from!.id);
  if (!user) return;
  const lang = langOf(user);
  if (user.state !== "chatting" && !user.chatPartnerId) {
    await ctx.reply(t(lang, "not_chatting"));
    return;
  }
  const partnerId = user.chatPartnerId;
  await leaveQueueOrChat(ctx.api, user, true);
  await ctx.reply(t(lang, "chat_ended"), { reply_markup: mainKeyboard(lang) });
  if (partnerId) {
    const { offerWipeAfterEnd } = await import("../services/match.js");
    await offerWipeAfterEnd(ctx.api, user.id, partnerId);
  }
});

menuHandler.callbackQuery("chat:end:no", async (ctx) => {
  const user = await findByTelegram(ctx.from!.id);
  const lang = langOf(user);
  await safeAnswerCallback(ctx, { text: t(lang, "end_chat_cancelled") });
  if (!user || user.state !== "chatting") return;
  await ctx.reply(t(lang, "end_chat_cancelled"), {
    reply_markup: chattingKeyboard(user.secureChat, lang),
  });
});

menuHandler.hears(btnAll("VIEW_PARTNER"), async (ctx) => {
  const user = await findByTelegram(ctx.from!.id);
  if (!user) return;
  const lang = langOf(user);
  if (user.state !== "chatting" || !user.chatPartnerId) {
    await ctx.reply(t(lang, "only_in_chat"));
    return;
  }
  const { showPartnerProfileInChat } = await import("../services/profile.js");
  await showPartnerProfileInChat(ctx, user.id, user.chatPartnerId);
});

menuHandler.callbackQuery("chat:partner", async (ctx) => {
  await safeAnswerCallback(ctx);
  const user = await findByTelegram(ctx.from!.id);
  if (!user) return;
  const lang = langOf(user);
  if (user.state !== "chatting" || !user.chatPartnerId) {
    await ctx.reply(t(lang, "only_in_chat"));
    return;
  }
  const { showPartnerProfileInChat } = await import("../services/profile.js");
  await showPartnerProfileInChat(ctx, user.id, user.chatPartnerId);
});

menuHandler.hears(btnAll("ADD_CONTACT"), async (ctx) => {
  const user = await findByTelegram(ctx.from!.id);
  if (!user) return;
  const lang = langOf(user);
  if (user.state !== "chatting" || !user.chatPartnerId) {
    await ctx.reply(t(lang, "only_in_chat"));
    return;
  }
  const { addContact } = await import("../services/contacts.js");
  const result = await addContact(user.id, user.chatPartnerId);
  const kb = chattingKeyboard(user.secureChat, lang);
  if (result === "ok") {
    await ctx.reply(t(lang, "contact_added"), { reply_markup: kb });
    return;
  }
  if (result === "exists") {
    await ctx.reply(t(lang, "contact_exists"), { reply_markup: kb });
    return;
  }
  if (result === "demo") {
    await ctx.reply(
      lang === "en"
        ? "This is a demo profile; it can't be saved to contacts."
        : "پروفایل نمونه است؛ قابل ذخیره در مخاطبین نیست.",
      { reply_markup: kb },
    );
    return;
  }
  await ctx.reply(
    lang === "en" ? "Could not add to contacts." : "افزودن به مخاطبین ممکن نشد.",
    { reply_markup: kb },
  );
});

menuHandler.callbackQuery("chat:contact", async (ctx) => {
  await safeAnswerCallback(ctx);
  const user = await findByTelegram(ctx.from!.id);
  if (!user) return;
  const lang = langOf(user);
  if (user.state !== "chatting" || !user.chatPartnerId) {
    await ctx.reply(t(lang, "only_in_chat"));
    return;
  }
  const { addContact } = await import("../services/contacts.js");
  const result = await addContact(user.id, user.chatPartnerId);
  const kb = chattingKeyboard(user.secureChat, lang);
  const msg =
    result === "ok"
      ? t(lang, "contact_added")
      : result === "exists"
        ? t(lang, "contact_exists")
        : result === "demo"
          ? lang === "en"
            ? "This is a demo profile; it can't be saved to contacts."
            : "پروفایل نمونه است؛ قابل ذخیره در مخاطبین نیست."
          : lang === "en"
            ? "Could not add to contacts."
            : "افزودن به مخاطبین ممکن نشد.";
  await ctx.reply(msg, { reply_markup: kb });
});

menuHandler.hears(btnAll("SECURE_CHAT_ON"), async (ctx) => {
  const user = await findByTelegram(ctx.from!.id);
  const lang = langOf(user);
  if (!user || user.state !== "chatting") {
    await ctx.reply(t(lang, "only_in_chat"));
    return;
  }
  const { setSecureChat } = await import("../services/match.js");
  await setSecureChat(ctx.api, user.id, true);
});

menuHandler.hears(btnAll("SECURE_CHAT_OFF"), async (ctx) => {
  const user = await findByTelegram(ctx.from!.id);
  const lang = langOf(user);
  if (!user || user.state !== "chatting") {
    await ctx.reply(t(lang, "only_in_chat"));
    return;
  }
  const { setSecureChat } = await import("../services/match.js");
  await setSecureChat(ctx.api, user.id, false);
});

menuHandler.callbackQuery("chat:secure:on", async (ctx) => {
  await safeAnswerCallback(ctx);
  const user = await findByTelegram(ctx.from!.id);
  const lang = langOf(user);
  if (!user || user.state !== "chatting") {
    await ctx.reply(t(lang, "only_in_chat"));
    return;
  }
  const { setSecureChat } = await import("../services/match.js");
  await setSecureChat(ctx.api, user.id, true);
});

menuHandler.callbackQuery("chat:secure:off", async (ctx) => {
  await safeAnswerCallback(ctx);
  const user = await findByTelegram(ctx.from!.id);
  const lang = langOf(user);
  if (!user || user.state !== "chatting") {
    await ctx.reply(t(lang, "only_in_chat"));
    return;
  }
  const { setSecureChat } = await import("../services/match.js");
  await setSecureChat(ctx.api, user.id, false);
});

menuHandler.hears(btnAll("BACK"), async (ctx) => {
  const user = await findByTelegram(ctx.from!.id);
  if (!user) return;
  const lang = langOf(user);
  // Cancel DM even when mid-chat kept state=chatting + pendingDirectTo
  if (user.pendingDirectTo || user.state === "await_direct_msg") {
    const nextState = user.chatPartnerId ? "chatting" : "idle";
    const { cancelDirectCompose } = await import("../services/directMsg.js");
    await cancelDirectCompose(user.id);
    await patchUser(user.id, { state: nextState, pendingDirectTo: null });
    await ctx.reply(
      lang === "en"
        ? "Direct message cancelled."
        : "ارسال پیام دایرکت لغو شد.",
      {
        reply_markup:
          nextState === "chatting"
            ? chattingKeyboard(user.secureChat, lang)
            : mainKeyboard(lang),
      },
    );
    return;
  }
  if (user.state === "chatting") {
    await ctx.reply(
      lang === "en"
        ? "End the chat first (/end)."
        : "اول چت را قطع کن (/end).",
      { reply_markup: chattingKeyboard(user.secureChat, lang) },
    );
    return;
  }
  await leaveQueueOrChat(ctx.api, user, false);
  if (user.registered) {
    await patchUser(user.id, {
      state: "idle",
      chatPartnerId: null,
      pendingAnonTo: null,
      pendingDirectTo: null,
      pendingSellCard: null,
      pendingReportOther: null,
    });
    await ctx.reply(
      lang === "en" ? "Main menu:" : "منوی اصلی:",
      { reply_markup: mainKeyboard(lang) },
    );
  }
});

menuHandler.hears(btnAll("SEND_LOCATION"), async (ctx) => {
  const user = await findByTelegram(ctx.from!.id);
  if (!user) return;
  if (await blockIfChatting(ctx, user)) return;
  const lang = langOf(user);
  await ctx.reply(
    lang === "en"
      ? "Use Telegram's location button to share 📍"
      : "از دکمه تلگرام موقعیت را Share کن 📍",
    { reply_markup: locationKeyboard(lang) },
  );
});
