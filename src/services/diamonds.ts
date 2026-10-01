import { randomBytes } from "node:crypto";
import type { Api, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { prisma } from "../db/prisma.js";
import { recordCoin } from "./coins.js";
import { patchUser, findByTelegram } from "../db/users.js";
import { DIAMOND_PACKAGES } from "../data/packages.js";
import { getAdminIds } from "../lib/admin.js";
import { formatNum, formatToman } from "../data/packages.js";
import { langOf, tr } from "../i18n/index.js";

export type PaymentMethod = "stars" | "card";

export function findPackage(id: string) {
  return DIAMOND_PACKAGES.find((p) => p.id === id);
}

export function cardPaymentConfig() {
  return {
    number: (process.env.CARD_NUMBER ?? "").trim(),
    holder: (process.env.CARD_HOLDER ?? "").trim(),
    bank: (process.env.CARD_BANK ?? "").trim(),
  };
}

export function isCardPaymentConfigured(): boolean {
  const digits = cardPaymentConfig().number.replace(/\D/g, "");
  return digits.length >= 16;
}

export function formatCardNumber(number: string): string {
  const digits = number.replace(/\D/g, "");
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

/** حالت تست — فقط dev و با ALLOW_DEMO_PAY=1 */
export function isDemoPayAllowed(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const v = (process.env.ALLOW_DEMO_PAY ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export async function createOrder(
  userId: number,
  packageId: string,
  paymentMethod: PaymentMethod,
) {
  const pkg = findPackage(packageId);
  if (!pkg) return null;

  const openStatuses =
    paymentMethod === "card"
      ? (["pending", "awaiting_review"] as const)
      : (["pending"] as const);
  await prisma.diamondOrder.updateMany({
    where: { userId, paymentMethod, status: { in: [...openStatuses] } },
    data: { status: "cancelled" },
  });

  return prisma.diamondOrder.create({
    data: {
      userId,
      packageId: pkg.id,
      diamonds: pkg.diamonds,
      amountToman: pkg.toman,
      paymentMethod,
      starsAmount: paymentMethod === "stars" ? pkg.stars : null,
      paymentCode: randomBytes(8).toString("hex"),
      status: "pending",
    },
  });
}

/** شارژ سکه — فقط از مسیرهای تأییدشده Stars / کارت */
async function creditPaidOrder(
  orderId: number,
  whereExtra: {
    paymentMethod: PaymentMethod;
    status: string;
    userId?: number;
    receiptRequired?: boolean;
  },
  data: { telegramPaymentChargeId?: string },
) {
  const order = await prisma.diamondOrder.findUnique({ where: { id: orderId } });
  if (!order) return null;
  if (order.status === "paid") return order;

  return prisma.$transaction(async (tx) => {
    if (data.telegramPaymentChargeId) {
      const dup = await tx.diamondOrder.findUnique({
        where: { telegramPaymentChargeId: data.telegramPaymentChargeId },
      });
      if (dup) return dup.status === "paid" ? dup : null;
    }

    const updated = await tx.diamondOrder.updateMany({
      where: {
        id: orderId,
        paymentMethod: whereExtra.paymentMethod,
        status: whereExtra.status,
        ...(whereExtra.userId != null ? { userId: whereExtra.userId } : {}),
        ...(whereExtra.receiptRequired ? { receiptFileId: { not: null } } : {}),
      },
      data: {
        status: "paid",
        ...(data.telegramPaymentChargeId
          ? { telegramPaymentChargeId: data.telegramPaymentChargeId }
          : {}),
      },
    });
    if (updated.count !== 1) {
      return tx.diamondOrder.findUnique({ where: { id: orderId } });
    }

    await tx.user.update({
      where: { id: order.userId },
      data: { diamonds: { increment: order.diamonds }, state: "idle" },
    });
    await recordCoin(order.userId, order.diamonds, "purchase", tx);
    return tx.diamondOrder.findUnique({ where: { id: orderId } });
  });
}

/** Stars — فقط بعد از successful_payment تلگرام */
export async function fulfillStarsOrder(
  orderId: number,
  userId: number,
  chargeId: string,
  totalAmount: number,
  currency: string,
) {
  if (currency !== "XTR") return null;
  const order = await prisma.diamondOrder.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== userId) return null;
  if (order.paymentMethod !== "stars" || order.status !== "pending") return null;
  if (order.starsAmount != null && totalAmount !== order.starsAmount) return null;

  return creditPaidOrder(
    orderId,
    { paymentMethod: "stars", status: "pending", userId },
    { telegramPaymentChargeId: chargeId },
  );
}

/** کارت — فقط ادمین، فقط بعد از رسید */
export async function fulfillCardOrderByAdmin(orderId: number) {
  return creditPaidOrder(
    orderId,
    {
      paymentMethod: "card",
      status: "awaiting_review",
      receiptRequired: true,
    },
    {},
  );
}

/** تست — فقط ALLOW_DEMO_PAY=1 */
export async function fulfillDemoOrder(orderId: number, userId: number) {
  if (!isDemoPayAllowed()) return null;
  const order = await prisma.diamondOrder.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== userId || order.status !== "pending") {
    return null;
  }
  if (order.paymentMethod !== "stars" && order.paymentMethod !== "card") {
    return null;
  }
  return creditPaidOrder(
    orderId,
    {
      paymentMethod: order.paymentMethod as PaymentMethod,
      status: "pending",
      userId,
    },
    {
      telegramPaymentChargeId: `demo:${orderId}:${randomBytes(4).toString("hex")}`,
    },
  );
}

export async function cancelOrder(orderId: number, userId: number) {
  const order = await prisma.diamondOrder.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== userId || order.status !== "pending") {
    return null;
  }
  const cancelled = await prisma.diamondOrder.update({
    where: { id: orderId },
    data: { status: "cancelled" },
  });
  await patchUser(userId, { state: "idle" });
  return cancelled;
}

export async function rejectCardOrder(orderId: number) {
  const order = await prisma.diamondOrder.findUnique({ where: { id: orderId } });
  if (
    !order ||
    order.paymentMethod !== "card" ||
    order.status !== "awaiting_review"
  ) {
    return null;
  }
  await prisma.diamondOrder.update({
    where: { id: orderId },
    data: { status: "rejected" },
  });
  await patchUser(order.userId, { state: "idle" });
  return order;
}

export async function submitCardReceipt(
  userId: number,
  fileId: string,
): Promise<{ ok: true; orderId: number } | { ok: false; reason: string }> {
  const order = await getPendingCardOrder(userId);
  if (!order) {
    return { ok: false, reason: "no_pending" };
  }

  await prisma.diamondOrder.update({
    where: { id: order.id },
    data: { status: "awaiting_review", receiptFileId: fileId },
  });
  await patchUser(userId, { state: "idle" });
  return { ok: true, orderId: order.id };
}

export async function getPendingCardOrder(userId: number) {
  return prisma.diamondOrder.findFirst({
    where: {
      userId,
      paymentMethod: "card",
      status: "pending",
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function validateStarsCheckout(
  payload: string,
  userId: number,
  totalAmount: number,
  currency: string,
): Promise<boolean> {
  if (currency !== "XTR") return false;
  const orderId = Number(payload);
  if (!Number.isFinite(orderId) || orderId <= 0) return false;
  const order = await prisma.diamondOrder.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== userId) return false;
  if (order.paymentMethod !== "stars" || order.status !== "pending") {
    return false;
  }
  if (order.starsAmount != null && totalAmount !== order.starsAmount) {
    return false;
  }
  return true;
}

export async function sendStarsInvoice(
  ctx: Context,
  orderId: number,
  pkgId: string,
) {
  const pkg = findPackage(pkgId);
  if (!pkg) throw new Error("invalid package");
  const lang = langOf(
    ctx.from ? await findByTelegram(ctx.from.id) : null,
  );

  const title = tr(lang, `${pkg.label} — پاتوق`, `${pkg.label} — Patogh`);
  const description = tr(
    lang,
    `${formatNum(pkg.diamonds)} سکه به حسابت اضافه می‌شود.`,
    `${formatNum(pkg.diamonds)} coins will be added to your balance.`,
  );

  await ctx.replyWithInvoice(
    title,
    description,
    String(orderId),
    "XTR",
    [{ label: pkg.label, amount: pkg.stars }],
    { provider_token: "" },
  );
}

export function cardPaymentKeyboard(orderId: number, lang: string | null) {
  const L = lang === "en" ? "en" : "fa";
  const kb = new InlineKeyboard()
    .text(
      tr(L, "📸 رسید را بفرست", "📸 Send receipt"),
      `pay:send_receipt:${orderId}`,
    )
    .primary();
  if (isDemoPayAllowed()) {
    kb.row()
      .text(tr(L, "✅ پرداخت کردم (تست)", "✅ I paid (demo)"), `paid:${orderId}`)
      .success();
  }
  kb.row()
    .text(tr(L, "❌ انصراف", "❌ Cancel"), `cancel:${orderId}`)
    .danger();
  return kb;
}

export function orderPendingKeyboard(orderId: number, lang: string | null) {
  const L = lang === "en" ? "en" : "fa";
  const kb = new InlineKeyboard();
  if (isDemoPayAllowed()) {
    kb.text(
      tr(L, "✅ پرداخت کردم (تست)", "✅ I paid (demo)"),
      `paid:${orderId}`,
    ).success();
    kb.row();
  }
  kb.text(tr(L, "❌ انصراف", "❌ Cancel"), `cancel:${orderId}`).danger();
  return kb;
}

export function adminCardReviewKeyboard(orderId: number) {
  return new InlineKeyboard()
    .text("✅ تأیید پرداخت", `pay:ok:${orderId}`)
    .success()
    .row()
    .text("❌ رد", `pay:no:${orderId}`)
    .danger();
}

export async function notifyAdminsCardReceipt(
  api: Api,
  orderId: number,
  user: {
    id: number;
    telegramId: bigint;
    displayName: string | null;
    username: string | null;
  },
  receiptFileId: string,
) {
  const order = await prisma.diamondOrder.findUnique({ where: { id: orderId } });
  if (!order) return;
  const pkg = findPackage(order.packageId);
  const who =
    user.displayName ??
    (user.username ? `@${user.username}` : `#${user.id}`);
  const caption = [
    "💳 رسید کارت‌به‌کارت",
    "",
    `کاربر: ${who} (${user.telegramId})`,
    `بسته: ${pkg?.label ?? order.packageId}`,
    `مبلغ: ${formatToman(order.amountToman)}`,
    `سکه: ${formatNum(order.diamonds)}`,
    `کد سفارش: ${order.paymentCode}`,
    `شناسه: #${order.id}`,
  ].join("\n");

  for (const adminId of getAdminIds()) {
    try {
      await api.sendPhoto(Number(adminId), receiptFileId, {
        caption,
        reply_markup: adminCardReviewKeyboard(orderId),
      });
    } catch (err) {
      console.error("notify admin card receipt failed", adminId, err);
    }
  }
}

export async function pendingCardOrdersCount() {
  return prisma.diamondOrder.count({
    where: { paymentMethod: "card", status: "awaiting_review" },
  });
}

export function cardInstructionsText(
  order: { amountToman: number; paymentCode: string; diamonds: number },
  pkgLabel: string,
  lang: string | null,
) {
  const L = lang === "en" ? "en" : "fa";
  const card = cardPaymentConfig();
  if (!isCardPaymentConfigured()) {
    return tr(
      L,
      "⚠️ پرداخت کارت‌به‌کارت هنوز پیکربندی نشده.\nبا پشتیبانی تماس بگیر.",
      "⚠️ Card payment is not configured yet.\nContact support.",
    );
  }

  return [
    tr(L, "💳 پرداخت کارت‌به‌کارت", "💳 Card-to-card payment"),
    "",
    tr(L, `بسته: ${pkgLabel}`, `Package: ${pkgLabel}`),
    tr(
      L,
      `مبلغ دقیق: ${formatToman(order.amountToman)}`,
      `Exact amount: ${formatToman(order.amountToman)}`,
    ),
    tr(
      L,
      `سکه: ${formatNum(order.diamonds)}`,
      `Coins: ${formatNum(order.diamonds)}`,
    ),
    "",
    tr(L, "—— مشخصات کارت ——", "—— Card details ——"),
    card.bank ? tr(L, `بانک: ${card.bank}`, `Bank: ${card.bank}`) : null,
    tr(L, `شماره کارت:`, `Card number:`),
    formatCardNumber(card.number),
    card.holder
      ? tr(L, `به نام: ${card.holder}`, `Account holder: ${card.holder}`)
      : null,
    "",
    tr(
      L,
      `کد پیگیری سفارش: ${order.paymentCode}`,
      `Order reference: ${order.paymentCode}`,
    ),
    "",
    tr(
      L,
      "۱) مبلغ را دقیقاً واریز کن",
      "1) Transfer the exact amount",
    ),
    tr(
      L,
      "۲) بعد از واریز، دکمه «📸 ارسال رسید پرداخت» را بزن",
      "2) After transfer, tap «📸 Send payment receipt»",
    ),
    tr(
      L,
      "۳) عکس یا اسکرین‌شات رسید را بفرست — برای ادمین ارسال می‌شود",
      "3) Send receipt photo — it goes to admin for approval",
    ),
    tr(
      L,
      "۴) بعد از تأیید ادمین، سکه‌ها اضافه می‌شوند",
      "4) Coins are added after admin approval",
    ),
  ]
    .filter(Boolean)
    .join("\n");
}
