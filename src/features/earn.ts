import { Composer, InlineKeyboard } from "grammy";
import { findByTelegram, patchUser } from "../db/users.js";
import { requireRegistered } from "../services/register.js";
import { mainKeyboard } from "../keyboards/main.js";
import { langOf } from "../i18n/index.js";
import {
  COIN_SELL_PRICE_TOMAN,
  MIN_SELL_COINS,
  formatNum,
  formatToman,
} from "../data/packages.js";
import {
  earnIntroText,
  parseSellCardPending,
  sellAmountToman,
  submitCoinSell,
  userHasOpenSell,
  notifyAdminsNewCoinSell,
  validateIranCard,
} from "../services/coinSell.js";

export const earnHandler = new Composer();

function cancelSellKb(lang: "fa" | "en") {
  return new InlineKeyboard().text(
    lang === "en" ? "↩️ Cancel" : "↩️ انصراف",
    "earn:cancel",
  );
}

function confirmSellKb(lang: "fa" | "en", coins: number) {
  return new InlineKeyboard()
    .text(
      lang === "en" ? "✅ Confirm sell" : "✅ تأیید فروش",
      `earn:confirm:${coins}`,
    )
    .success()
    .row()
    .text(lang === "en" ? "↩️ Cancel" : "↩️ انصراف", "earn:cancel");
}

earnHandler.callbackQuery("earn:close", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx
    .editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } })
    .catch(() => undefined);
});

earnHandler.callbackQuery("earn:cancel", async (ctx) => {
  const user = await findByTelegram(ctx.from!.id);
  if (user && parseSellCardPending(user.pendingSellCard) != null) {
    // فقط pending فروش را پاک کن — DM/anon/report دست نخورَد
    await patchUser(user.id, { pendingSellCard: null });
  }
  const lang = user?.language === "en" ? "en" : "fa";
  await ctx.answerCallbackQuery({
    text: lang === "en" ? "Cancelled" : "لغو شد",
  });
  await ctx
    .editMessageText(lang === "en" ? "Sell cancelled." : "فروش لغو شد.")
    .catch(() => undefined);
});

earnHandler.callbackQuery("earn:sell", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const lang = langOf(user);
  const balance = user.diamonds ?? 0;

  if (await userHasOpenSell(user.id)) {
    await ctx.answerCallbackQuery({
      text:
        lang === "en"
          ? "You already have a pending payout"
          : "یک درخواست تسویه باز داری",
      show_alert: true,
    });
    return;
  }

  if (balance < MIN_SELL_COINS) {
    await ctx.answerCallbackQuery({
      text:
        lang === "en"
          ? `Need at least ${MIN_SELL_COINS} coins`
          : `حداقل ${formatNum(MIN_SELL_COINS)} سکه لازم است`,
      show_alert: true,
    });
    return;
  }

  const coins = balance;
  const toman = sellAmountToman(coins, COIN_SELL_PRICE_TOMAN);
  await ctx.answerCallbackQuery();
  const text =
    lang === "en"
      ? [
          "💵 Confirm sell",
          "",
          `Coins: ${formatNum(coins)}`,
          `Rate: ${formatNum(COIN_SELL_PRICE_TOMAN)} Toman / coin`,
          `Payout: ${formatToman(toman)}`,
          "",
          "Coins are held when you submit your card until admin pays or rejects.",
        ].join("\n")
      : [
          "💵 تأیید فروش",
          "",
          `تعداد سکه: ${formatNum(coins)}`,
          `نرخ: هر سکه ${formatNum(COIN_SELL_PRICE_TOMAN)} تومان`,
          `مبلغ پرداختی: ${formatToman(toman)}`,
          "",
          "با ارسال شماره کارت، سکه‌ها تا تأیید/رد ادمین نگه داشته می‌شوند.",
        ].join("\n");

  await ctx.editMessageText(text, { reply_markup: confirmSellKb(lang, coins) }).catch(
    async () => {
      await ctx.reply(text, { reply_markup: confirmSellKb(lang, coins) });
    },
  );
});

earnHandler.callbackQuery(/^earn:confirm:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const lang = langOf(user);
  const coins = Number(ctx.match![1]);
  if (!Number.isFinite(coins) || coins < MIN_SELL_COINS) {
    await ctx.answerCallbackQuery({
      text: lang === "en" ? "Invalid amount" : "مقدار نامعتبر",
      show_alert: true,
    });
    return;
  }
  if ((user.diamonds ?? 0) < coins) {
    await ctx.answerCallbackQuery({
      text: lang === "en" ? "Not enough coins" : "سکه کافی نیست",
      show_alert: true,
    });
    return;
  }
  if (await userHasOpenSell(user.id)) {
    await ctx.answerCallbackQuery({
      text:
        lang === "en"
          ? "You already have a pending payout"
          : "یک درخواست تسویه باز داری",
      show_alert: true,
    });
    return;
  }

  // state/DM/anon را دست نزن — فیلد جدا برای شماره کارت؛ report متنی را آزاد کن
  await patchUser(user.id, {
    pendingSellCard: String(coins),
    pendingReportOther: null,
  });
  await ctx.answerCallbackQuery();
  const prompt =
    lang === "en"
      ? [
          "🏦 Send your 16-digit bank card number for payout.",
          `Amount held: ${formatNum(coins)} coins ≈ ${formatToman(sellAmountToman(coins))}`,
          "",
          "Only digits (spaces/dashes ok). Iranian card (Luhn check).",
        ].join("\n")
      : [
          "🏦 شماره کارت بانکی ۱۶ رقمی را برای واریز بفرست.",
          `مبلغ در انتظار: ${formatNum(coins)} سکه ≈ ${formatToman(sellAmountToman(coins))}`,
          "",
          "فقط رقم (فاصله/خط تیره مجاز است). کارت بانکی ایران.",
        ].join("\n");

  await ctx.editMessageText(prompt, { reply_markup: cancelSellKb(lang) }).catch(
    async () => {
      await ctx.reply(prompt, { reply_markup: cancelSellKb(lang) });
    },
  );
});

/** شماره کارت — قبل از chat relay؛ state/partner را پاک نکن */
earnHandler.on("message:text", async (ctx, next) => {
  if (!ctx.from) return next();
  const user = await findByTelegram(ctx.from.id);
  if (!user) return next();
  const coins = parseSellCardPending(user.pendingSellCard);
  if (!coins) return next();

  const lang = langOf(user);
  const text = (ctx.message.text || "").trim();
  if (!text || text.startsWith("/")) return next();

  const cardCheck = validateIranCard(text);
  if (!cardCheck.ok) {
    await ctx.reply(
      lang === "en"
        ? cardCheck.reason === "luhn"
          ? "Card number failed validation. Check the 16 digits and try again."
          : "Send a valid 16-digit Iranian bank card number."
        : cardCheck.reason === "luhn"
          ? "شماره کارت معتبر نیست (چک رقم). ۱۶ رقم را دوباره بفرست."
          : "شماره کارت ۱۶ رقمی بانکی ایران را درست بفرست.",
      { reply_markup: cancelSellKb(lang) },
    );
    return;
  }

  const result = await submitCoinSell({
    userId: user.id,
    coins,
    cardNumber: cardCheck.card,
  });
  await patchUser(user.id, { pendingSellCard: null });

  if (!result.ok) {
    const msg =
      result.reason === "min"
        ? lang === "en"
          ? `Minimum is ${MIN_SELL_COINS} coins.`
          : `حداقل ${formatNum(MIN_SELL_COINS)} سکه لازم است.`
        : result.reason === "balance"
          ? lang === "en"
            ? "Not enough coins."
            : "سکه کافی نیست."
          : result.reason === "pending"
            ? lang === "en"
              ? "You already have a pending payout request."
              : "یک درخواست تسویه باز داری."
            : lang === "en"
              ? "Could not submit."
              : "ثبت درخواست ممکن نشد.";
    await ctx.reply(msg, { reply_markup: mainKeyboard(lang) });
    return;
  }

  await ctx.reply(
    lang === "en"
      ? [
          "✅ Sell request submitted.",
          `Request #${result.requestId}`,
          `${formatNum(coins)} coins held · ${formatToman(result.amountToman)}`,
          "",
          "Thanks! Payout is pending admin review.",
        ].join("\n")
      : [
          "✅ درخواست فروش ثبت شد.",
          `شماره درخواست: #${result.requestId}`,
          `${formatNum(coins)} سکه رزرو شد · ${formatToman(result.amountToman)}`,
          "",
          "ممنون! پرداخت پس از بررسی ادمین انجام می‌شود.",
        ].join("\n"),
    // اگر وسط چت/انتظار بودیم، منوی اصلی را دوباره نفرست
    user.state === "chatting" || user.state === "await_direct_msg"
      ? undefined
      : { reply_markup: mainKeyboard(lang) },
  );

  await notifyAdminsNewCoinSell(ctx.api, result.requestId);
});
