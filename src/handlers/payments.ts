import { Composer, InlineKeyboard } from "grammy";
import { findByTelegram, patchUser } from "../db/users.js";
import { prisma } from "../db/prisma.js";
import { requireRegistered } from "../services/register.js";
import {
  findPackage,
  createOrder,
  cancelOrder,
  fulfillStarsOrder,
  fulfillCardOrderByAdmin,
  fulfillDemoOrder,
  isDemoPayAllowed,
  rejectCardOrder,
  submitCardReceipt,
  getPendingCardOrder,
  validateStarsCheckout,
  sendStarsInvoice,
  cardPaymentKeyboard,
  cardInstructionsText,
  notifyAdminsCardReceipt,
  adminCardReviewKeyboard,
  isCardPaymentConfigured,
  orderPendingKeyboard,
} from "../services/diamonds.js";
import {
  mainKeyboard,
  coinsShopKeyboard,
  paymentMethodKeyboard,
  cardReceiptReplyKeyboard,
} from "../keyboards/main.js";
import {
  formatNum,
  formatToman,
  coinsShopIntroText,
  packageCheckoutText,
} from "../data/packages.js";
import { claimDailyCoin } from "../services/dailyCoin.js";
import { redeemVoucher } from "../services/vouchers.js";
import { checkUserRate } from "../middleware/rateLimit.js";
import { langOf, tr, btnAll } from "../i18n/index.js";
import { isAdmin } from "../lib/admin.js";

export const paymentsHandler = new Composer();

const RECEIPT_BTN = new Set(btnAll("CARD_SEND_RECEIPT"));
const CARD_CANCEL_BTN = new Set(btnAll("CARD_CANCEL_PAY"));

async function promptCardReceipt(
  ctx: { reply: (t: string, x?: object) => Promise<unknown> },
  lang: ReturnType<typeof langOf>,
) {
  await ctx.reply(
    tr(
      lang,
      [
        "📸 الان عکس یا اسکرین‌شات رسید را بفرست.",
        "",
        "رسید برای ادمین ارسال می‌شود تا تأیید کند.",
      ].join("\n"),
      [
        "📸 Send a photo or screenshot of your receipt now.",
        "",
        "It will be sent to admin for approval.",
      ].join("\n"),
    ),
    { reply_markup: cardReceiptReplyKeyboard(lang) },
  );
}

async function processCardReceiptUpload(
  ctx: {
    from?: { id: number };
    reply: (t: string, x?: object) => Promise<unknown>;
    api: import("grammy").Api;
    message: {
      photo?: { file_id: string }[];
      document?: { file_id: string; mime_type?: string };
    };
  },
  user: NonNullable<Awaited<ReturnType<typeof findByTelegram>>>,
  fileId: string,
) {
  const result = await submitCardReceipt(user.id, fileId);
  if (!result.ok) {
    await ctx.reply(
      tr(
        langOf(user),
        "سفارش باز پیدا نشد. دوباره از منوی سکه بسته را انتخاب کن.",
        "No open order found. Pick a package again from the coins menu.",
      ),
      { reply_markup: mainKeyboard(langOf(user)) },
    );
    return;
  }

  const lang = langOf(user);
  await ctx.reply(
    tr(
      lang,
      "✅ رسید دریافت شد و برای ادمین ارسال شد.\nبعد از تأیید، سکه‌ها به حسابت اضافه می‌شوند.",
      "✅ Receipt received and sent to admin.\nCoins will be added after approval.",
    ),
    { reply_markup: mainKeyboard(lang) },
  );

  await notifyAdminsCardReceipt(ctx.api, result.orderId, user, fileId);
}

async function promptVoucherCode(
  ctx: { reply: (t: string, x?: object) => Promise<unknown> },
  lang: ReturnType<typeof langOf>,
) {
  await ctx.reply(
    tr(
      lang,
      [
        "🎟 کد هدیه / ووچر",
        "",
        "کد تبلیغاتی را بفرست تا سکه جایزه بگیری 💰",
        "مثال: PATOGH100",
        "",
        "هر کد فقط یک‌بار برای هر کاربر.",
      ].join("\n"),
      [
        "🎟 Gift code / voucher",
        "",
        "Send your promo code to receive bonus coins 💰",
        "Example: PATOGH100",
        "",
        "Each code can be used once per user.",
      ].join("\n"),
    ),
    { reply_markup: mainKeyboard(lang) },
  );
}

async function processVoucherRedeem(
  ctx: {
    from?: { id: number };
    reply: (t: string, x?: object) => Promise<unknown>;
  },
  user: NonNullable<Awaited<ReturnType<typeof findByTelegram>>>,
  code: string,
) {
  const lang = langOf(user);
  const result = await redeemVoucher(user.id, code);
  await patchUser(user.id, { state: "idle" });

  if (!result.ok) {
    const msg: Record<typeof result.reason, [string, string]> = {
      invalid: ["کد نامعتبر است.", "Invalid code."],
      not_found: ["کد پیدا نشد.", "Code not found."],
      inactive: ["این کد غیرفعال شده.", "This code is inactive."],
      expired: ["این کد منقضی شده.", "This code has expired."],
      exhausted: ["ظرفیت این کد تمام شده.", "This code has been fully used."],
      already_used: ["قبلاً از این کد استفاده کردی.", "You already used this code."],
      no_user: ["خطا — دوباره /start بزن.", "Error — try /start again."],
    };
    const [fa, en] = msg[result.reason];
    await ctx.reply(tr(lang, fa, en), { reply_markup: mainKeyboard(lang) });
    return;
  }

  await ctx.reply(
    tr(
      lang,
      `✅ کد \`${result.code}\` با موفقیت ثبت شد.\n+${formatNum(result.amount)} سکه\nموجودی: ${formatNum(result.balance)} 💰`,
      `✅ Code \`${result.code}\` redeemed.\n+${formatNum(result.amount)} coins\nBalance: ${formatNum(result.balance)} 💰`,
    ),
    { reply_markup: mainKeyboard(lang), parse_mode: "Markdown" },
  );
}

async function showPackageMethods(ctx: { editMessageReplyMarkup?: (x: object) => Promise<unknown>; reply: (t: string, x?: object) => Promise<unknown> }, user: { language?: string | null }, pkgId: string) {
  const pkg = findPackage(pkgId);
  if (!pkg) return;
  const lang = langOf(user);
  const L = lang === "en" ? "en" : "fa";
  await ctx.reply(packageCheckoutText(pkg, L), {
    reply_markup: paymentMethodKeyboard(pkgId, lang),
  });
}

paymentsHandler.callbackQuery("voucher:redeem", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  if (ctx.from && !checkUserRate(ctx.from.id, "coin_action")) {
    await ctx.answerCallbackQuery({
      text: tr(langOf(user), "⏳ کمی صبر کن", "⏳ Slow down"),
    });
    return;
  }
  await patchUser(user.id, { state: "await_voucher_code" });
  await ctx.answerCallbackQuery();
  await promptVoucherCode(ctx, langOf(user));
});

paymentsHandler.callbackQuery("coins:daily", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  if (ctx.from && !checkUserRate(ctx.from.id, "coin_action")) {
    await ctx.answerCallbackQuery({
      text: tr(langOf(user), "⏳ کمی صبر کن", "⏳ Slow down"),
    });
    return;
  }
  const lang = langOf(user);
  const result = await claimDailyCoin(user.id);
  if (!result.ok) {
    await ctx.answerCallbackQuery({
      text: tr(lang, "امروز قبلاً گرفتی — فردا بیا", "Already claimed today — come back tomorrow"),
      show_alert: true,
    });
    try {
      await ctx.editMessageReplyMarkup({
        reply_markup: coinsShopKeyboard(new Date(), lang),
      });
    } catch {
      /* ignore */
    }
    return;
  }
  await ctx.answerCallbackQuery({
    text: tr(
      lang,
      `✅ ${formatNum(result.amount)} سکه اضافه شد`,
      `✅ ${formatNum(result.amount)} coins added`,
    ),
  });
  const intro = coinsShopIntroText(lang === "en" ? "en" : "fa", result.balance);
  try {
    await ctx.editMessageText(intro, {
      reply_markup: coinsShopKeyboard(new Date(), lang),
    });
  } catch {
    await ctx.reply(
      tr(
        lang,
        `🎁 ${formatNum(result.amount)} سکه روزانه دریافت شد.\nموجودی: ${formatNum(result.balance)} 💰`,
        `🎁 Daily ${formatNum(result.amount)} coins claimed.\nBalance: ${formatNum(result.balance)} 💰`,
      ),
      { reply_markup: coinsShopKeyboard(new Date(), lang) },
    );
  }
});

paymentsHandler.callbackQuery("coins:daily:done", async (ctx) => {
  const user = await requireRegistered(ctx);
  const lang = user ? langOf(user) : "fa";
  await ctx.answerCallbackQuery({
    text: tr(
      lang,
      "امروز سکه روزانه‌ات را گرفتی — فردا دوباره بیا 🎁",
      "You already claimed today's coins — come back tomorrow 🎁",
    ),
    show_alert: true,
  });
});

paymentsHandler.callbackQuery(/^pkg:(.+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  await showPackageMethods(ctx, user, ctx.match[1]!);
});

/** سازگاری با callback قدیمی buy: */
paymentsHandler.callbackQuery(/^buy:(.+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  await showPackageMethods(ctx, user, ctx.match[1]!);
});

paymentsHandler.callbackQuery(/^pay:stars:(.+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const pkgId = ctx.match[1]!;
  const pkg = findPackage(pkgId);
  if (!pkg) {
    await ctx.answerCallbackQuery({ text: "بسته نامعتبر" });
    return;
  }

  const order = await createOrder(user.id, pkgId, "stars");
  if (!order) {
    await ctx.answerCallbackQuery({ text: "خطا" });
    return;
  }

  await ctx.answerCallbackQuery();
  const lang = langOf(user);
  try {
    await sendStarsInvoice(ctx, order.id, pkgId);
    await ctx.reply(
      tr(
        lang,
        isDemoPayAllowed()
          ? `⭐ فاکتور Stars ارسال شد.\nبعد از پرداخت، ${formatNum(pkg.diamonds)} سکه اضافه می‌شود.\n\n🧪 حالت تست: «پرداخت کردم (تست)»`
          : `⭐ فاکتور Stars ارسال شد.\nبعد از پرداخت، ${formatNum(pkg.diamonds)} سکه به حسابت اضافه می‌شود.`,
        isDemoPayAllowed()
          ? `⭐ Stars invoice sent.\nAfter payment, ${formatNum(pkg.diamonds)} coins will be added.\n\n🧪 Demo: tap «I paid (demo)»`
          : `⭐ Stars invoice sent.\nAfter payment, ${formatNum(pkg.diamonds)} coins will be added.`,
      ),
      { reply_markup: orderPendingKeyboard(order.id, lang) },
    );
  } catch (err) {
    console.error("sendStarsInvoice failed", err);
    await cancelOrder(order.id, user.id);
    await ctx.reply(
      tr(
        lang,
        "⚠️ ارسال فاکتور Stars ممکن نشد.\nمطمئن شو Stars در BotFather فعال است یا کارت‌به‌کارت را امتحان کن.",
        "⚠️ Could not send Stars invoice.\nEnsure Stars is enabled in BotFather or try card transfer.",
      ),
      { reply_markup: mainKeyboard(lang) },
    );
  }
});

paymentsHandler.callbackQuery(/^pay:card:(.+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const pkgId = ctx.match[1]!;
  const pkg = findPackage(pkgId);
  if (!pkg) {
    await ctx.answerCallbackQuery({ text: "بسته نامعتبر" });
    return;
  }
  if (!isCardPaymentConfigured()) {
    await ctx.answerCallbackQuery({
      text: tr(
        langOf(user),
        "کارت هنوز تنظیم نشده — Stars را امتحان کن",
        "Card not configured — try Stars",
      ),
      show_alert: true,
    });
    return;
  }

  const order = await createOrder(user.id, pkgId, "card");
  if (!order) {
    await ctx.answerCallbackQuery({ text: "خطا" });
    return;
  }

  await patchUser(user.id, { state: "await_card_receipt" });
  await ctx.answerCallbackQuery();
  const lang = langOf(user);
  await ctx.reply(cardInstructionsText(order, pkg.label, lang), {
    reply_markup: cardPaymentKeyboard(order.id, lang),
  });
  await ctx.reply(
    tr(lang, "👇 برای ارسال رسید:", "👇 To send receipt:"),
    { reply_markup: cardReceiptReplyKeyboard(lang) },
  );
});

paymentsHandler.callbackQuery(/^pay:send_receipt:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const orderId = Number(ctx.match[1]);
  const order = await getPendingCardOrder(user.id);
  if (!order || order.id !== orderId) {
    await ctx.answerCallbackQuery({
      text: tr(langOf(user), "سفارش باز نیست", "No open order"),
      show_alert: true,
    });
    return;
  }
  await patchUser(user.id, { state: "await_card_receipt" });
  await ctx.answerCallbackQuery();
  await promptCardReceipt(ctx, langOf(user));
});

/** سازگاری با callback قدیمی */
paymentsHandler.callbackQuery(/^pay:receipt_hint:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const orderId = Number(ctx.match[1]);
  const pending = await getPendingCardOrder(user.id);
  if (!pending || pending.id !== orderId) {
    await ctx.answerCallbackQuery({
      text: tr(langOf(user), "سفارش باز نیست", "No open order"),
      show_alert: true,
    });
    return;
  }
  await patchUser(user.id, { state: "await_card_receipt" });
  await ctx.answerCallbackQuery();
  await promptCardReceipt(ctx, langOf(user));
});

paymentsHandler.hears([...RECEIPT_BTN], async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  const pending = await getPendingCardOrder(user.id);
  if (!pending) {
    await ctx.reply(
      tr(
        langOf(user),
        "سفارش باز نداری. از منوی سکه دوباره بسته را انتخاب کن.",
        "No open order. Pick a package from the coins menu.",
      ),
      { reply_markup: mainKeyboard(langOf(user)) },
    );
    return;
  }
  await patchUser(user.id, { state: "await_card_receipt" });
  await promptCardReceipt(ctx, langOf(user));
});

paymentsHandler.hears([...CARD_CANCEL_BTN], async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  const pending = await getPendingCardOrder(user.id);
  const lang = langOf(user);
  if (pending) {
    await cancelOrder(pending.id, user.id);
  } else {
    await patchUser(user.id, { state: "idle" });
  }
  await ctx.reply(
    tr(lang, "پرداخت لغو شد.", "Payment cancelled."),
    { reply_markup: mainKeyboard(lang) },
  );
});

paymentsHandler.callbackQuery(/^paid:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  if (!isDemoPayAllowed()) {
    await ctx.answerCallbackQuery({
      text: tr(
        langOf(user),
        "حالت تست غیرفعال است",
        "Demo mode is disabled",
      ),
      show_alert: true,
    });
    return;
  }
  const orderId = Number(ctx.match[1]);
  const order = await fulfillDemoOrder(orderId, user.id);
  if (!order || order.status !== "paid") {
    await ctx.answerCallbackQuery({
      text: tr(langOf(user), "سفارش پیدا نشد", "Order not found"),
    });
    return;
  }
  const fresh = await findByTelegram(ctx.from!.id);
  const lang = langOf(user);
  await ctx.answerCallbackQuery({ text: tr(lang, "شارژ شد (تست)", "Topped up (demo)") });
  try {
    await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
  } catch {
    /* ignore */
  }
  await ctx.reply(
    tr(
      lang,
      `🧪 تست — ${formatNum(order.diamonds)} سکه اضافه شد.\nموجودی: ${formatNum(fresh?.diamonds ?? 0)} 💰`,
      `🧪 Demo — ${formatNum(order.diamonds)} coins added.\nBalance: ${formatNum(fresh?.diamonds ?? 0)} 💰`,
    ),
    { reply_markup: mainKeyboard(lang) },
  );
});

paymentsHandler.callbackQuery(/^pay:ok:(\d+)$/, async (ctx) => {
  if (!ctx.from || !isAdmin(ctx.from.id)) {
    await ctx.answerCallbackQuery({ text: "فقط ادمین" });
    return;
  }
  const orderId = Number(ctx.match[1]);
  const order = await fulfillCardOrderByAdmin(orderId);
  if (!order || order.status !== "paid") {
    await ctx.answerCallbackQuery({
      text: "فقط رسید کارت در انتظار تأیید قابل قبول است",
      show_alert: true,
    });
    return;
  }

  await ctx.answerCallbackQuery({ text: "✅ تأیید شد" });
  try {
    await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
  } catch {
    /* ignore */
  }

  const freshBuyer = await prisma.user.findUnique({ where: { id: order.userId } });
  if (freshBuyer && freshBuyer.telegramId < 9000000000n) {
    const lang = langOf(freshBuyer);
    try {
      await ctx.api.sendMessage(
        Number(freshBuyer.telegramId),
        tr(
          lang,
          `✅ پرداخت کارت‌به‌کارت تأیید شد.\n${formatNum(order.diamonds)} سکه اضافه شد.\nموجودی: ${formatNum(freshBuyer.diamonds)} 💰`,
          `✅ Card payment approved.\n${formatNum(order.diamonds)} coins added.\nBalance: ${formatNum(freshBuyer.diamonds)} 💰`,
        ),
        { reply_markup: mainKeyboard(lang) },
      );
    } catch (err) {
      console.error("notify buyer card approved failed", err);
    }
  }
});

paymentsHandler.callbackQuery(/^pay:no:(\d+)$/, async (ctx) => {
  if (!ctx.from || !isAdmin(ctx.from.id)) {
    await ctx.answerCallbackQuery({ text: "فقط ادمین" });
    return;
  }
  const orderId = Number(ctx.match[1]);
  const order = await rejectCardOrder(orderId);
  if (!order) {
    await ctx.answerCallbackQuery({ text: "سفارش پیدا نشد" });
    return;
  }

  await ctx.answerCallbackQuery({ text: "رد شد" });
  try {
    await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
  } catch {
    /* ignore */
  }

  const buyer = await prisma.user.findUnique({ where: { id: order.userId } });
  if (buyer && buyer.telegramId < 9000000000n) {
    const lang = langOf(buyer);
    try {
      await ctx.api.sendMessage(
        Number(buyer.telegramId),
        tr(
          lang,
          "❌ رسید پرداخت تأیید نشد.\nاگر واریز کرده‌ای، با پشتیبانی تماس بگیر.",
          "❌ Payment receipt was rejected.\nIf you paid, contact support.",
        ),
        { reply_markup: mainKeyboard(lang) },
      );
    } catch {
      /* ignore */
    }
  }
});

paymentsHandler.on("pre_checkout_query", async (ctx) => {
  const from = ctx.from;
  if (!from) {
    await ctx.answerPreCheckoutQuery(false, { error_message: "Invalid user" });
    return;
  }
  const user = await findByTelegram(from.id);
  if (!user) {
    await ctx.answerPreCheckoutQuery(false, { error_message: "Register first" });
    return;
  }
  const ok = await validateStarsCheckout(
    ctx.preCheckoutQuery.invoice_payload,
    user.id,
    ctx.preCheckoutQuery.total_amount,
    ctx.preCheckoutQuery.currency,
  );
  if (!ok) {
    await ctx.answerPreCheckoutQuery(false, {
      error_message: tr(
        langOf(user),
        "سفارش نامعتبر یا منقضی شده",
        "Invalid or expired order",
      ),
    });
    return;
  }
  await ctx.answerPreCheckoutQuery(true);
});

paymentsHandler.on("message:successful_payment", async (ctx) => {
  const from = ctx.from;
  if (!from) return;
  const user = await findByTelegram(from.id);
  if (!user) return;

  const sp = ctx.message.successful_payment;
  const orderId = Number(sp.invoice_payload);
  if (!Number.isFinite(orderId)) return;

  const order = await fulfillStarsOrder(
    orderId,
    user.id,
    sp.telegram_payment_charge_id,
    sp.total_amount,
    sp.currency,
  );
  if (!order || order.status !== "paid") return;

  const fresh = await findByTelegram(from.id);
  const lang = langOf(user);
  await ctx.reply(
    tr(
      lang,
      `✅ پرداخت Stars موفق بود.\n${formatNum(order.diamonds)} سکه اضافه شد.\nموجودی: ${formatNum(fresh?.diamonds ?? 0)} 💰`,
      `✅ Stars payment successful.\n${formatNum(order.diamonds)} coins added.\nBalance: ${formatNum(fresh?.diamonds ?? 0)} 💰`,
    ),
    { reply_markup: mainKeyboard(lang) },
  );
});

paymentsHandler.on("message:text", async (ctx, next) => {
  const from = ctx.from;
  if (!from) return next();
  const user = await findByTelegram(from.id);
  if (!user || user.state !== "await_voucher_code") return next();

  const raw = ctx.message.text.trim();
  if (raw.startsWith("/")) return next();
  if (!checkUserRate(from.id, "coin_action")) {
    await ctx.reply(tr(langOf(user), "⏳ کمی صبر کن", "⏳ Slow down"));
    return;
  }

  await processVoucherRedeem(ctx, user, raw);
});

paymentsHandler.on(["message:photo", "message:document"], async (ctx, next) => {
  const from = ctx.from;
  if (!from) return next();
  const user = await findByTelegram(from.id);
  if (!user || user.state !== "await_card_receipt") return next();

  const pending = await getPendingCardOrder(user.id);
  if (!pending) return next();

  const fileId =
    ctx.message.photo?.[ctx.message.photo.length - 1]?.file_id ??
    (ctx.message.document?.mime_type?.startsWith("image/")
      ? ctx.message.document.file_id
      : undefined);
  if (!fileId) {
    await ctx.reply(
      tr(
        langOf(user),
        "لطفاً عکس یا اسکرین‌شات رسید را بفرست.",
        "Please send a photo or screenshot of the receipt.",
      ),
      { reply_markup: cardReceiptReplyKeyboard(langOf(user)) },
    );
    return;
  }

  await processCardReceiptUpload(ctx, user, fileId);
});

paymentsHandler.callbackQuery(/^cancel:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await cancelOrder(Number(ctx.match[1]), user.id);
  await ctx.answerCallbackQuery({ text: tr(langOf(user), "لغو شد", "Cancelled") });
  try {
    await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
  } catch {
    /* ignore */
  }
  await ctx.reply(
    tr(langOf(user), "سفارش لغو شد.", "Order cancelled."),
    { reply_markup: mainKeyboard(langOf(user)) },
  );
});

export { adminCardReviewKeyboard };
