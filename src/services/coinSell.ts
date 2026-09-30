import { prisma } from "../db/prisma.js";
import { getAdminIds } from "../lib/admin.js";
import {
  COIN_SELL_PRICE_TOMAN,
  MIN_SELL_COINS,
  formatNum,
  formatToman,
} from "../data/packages.js";
import type { Api } from "grammy";

export const SELL_CARD_PREFIX = "sell_card:";

/** نرمال‌سازی شماره کارت ایرانی — فقط رقم */
export function normalizeCardNumber(raw: string): string {
  const fa = "۰۱۲۳۴۵۶۷۸۹";
  const ar = "٠١٢٣٤٥٦٧٨٩";
  let s = (raw || "").trim().replace(/[\s\-]/g, "");
  s = s
    .split("")
    .map((ch) => {
      const fi = fa.indexOf(ch);
      if (fi >= 0) return String(fi);
      const ai = ar.indexOf(ch);
      if (ai >= 0) return String(ai);
      return ch;
    })
    .join("");
  return s.replace(/\D/g, "");
}

/** Luhn برای کارت ۱۶ رقمی */
export function luhnOk(digits: string): boolean {
  if (!/^\d{16}$/.test(digits)) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function validateIranCard(raw: string): { ok: true; card: string } | { ok: false; reason: "length" | "luhn" } {
  const card = normalizeCardNumber(raw);
  if (card.length !== 16) return { ok: false, reason: "length" };
  if (!luhnOk(card)) return { ok: false, reason: "luhn" };
  return { ok: true, card };
}

export function formatCardGrouped(card: string): string {
  const d = normalizeCardNumber(card);
  return d.replace(/(\d{4})(?=\d)/g, "$1-");
}

/** مقدار pendingSellCard یا legacy `sell_card:N` در pendingAnonTo */
export function parseSellCardPending(pending: string | null | undefined): number | null {
  if (!pending) return null;
  const raw = pending.startsWith(SELL_CARD_PREFIX)
    ? pending.slice(SELL_CARD_PREFIX.length)
    : pending;
  const amount = Number(raw);
  return Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : null;
}

export function sellAmountToman(coins: number, rate = COIN_SELL_PRICE_TOMAN): number {
  return coins * rate;
}

export function earnIntroText(
  lang: "fa" | "en",
  balance: number,
  rate = COIN_SELL_PRICE_TOMAN,
  minCoins = MIN_SELL_COINS,
): string {
  const toman = sellAmountToman(balance, rate);
  if (lang === "en") {
    return [
      "💵 Earn money — sell coins",
      "",
      `Balance: ${formatNum(balance)} coins`,
      `Sell rate: ${formatNum(rate)} Toman per coin`,
      `Your balance ≈ ${formatToman(toman)}`,
      `Minimum to sell: ${formatNum(minCoins)} coins`,
      "",
      "Tap sell → confirm → send your bank card number for payout.",
      "Payout is reviewed by admins (pending until paid).",
    ].join("\n");
  }
  return [
    "💵 کسب درآمد — فروش سکه",
    "",
    `موجودی تو: ${formatNum(balance)} سکه`,
    `نرخ فروش: هر سکه ${formatNum(rate)} تومان`,
    `ارزش موجودی ≈ ${formatToman(toman)}`,
    `حداقل برای فروش: ${formatNum(minCoins)} سکه`,
    "",
    "دکمه فروش را بزن → تأیید مبلغ → شماره کارت بانکی را بفرست.",
    "پرداخت بعد از بررسی ادمین انجام می‌شود.",
  ].join("\n");
}

export async function countOpenCoinSells(): Promise<number> {
  return prisma.coinSellRequest.count({ where: { status: "open" } });
}

export async function listOpenCoinSells(limit = 20) {
  return prisma.coinSellRequest.findMany({
    where: { status: "open" },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          userCode: true,
          username: true,
          gender: true,
          age: true,
          telegramId: true,
          diamonds: true,
        },
      },
    },
  });
}

export async function getCoinSellById(id: number) {
  return prisma.coinSellRequest.findUnique({
    where: { id },
    include: { user: true },
  });
}

export async function userHasOpenSell(userId: number): Promise<boolean> {
  const n = await prisma.coinSellRequest.count({
    where: { userId, status: "open" },
  });
  return n > 0;
}

/**
 * ثبت درخواست فروش: کسر اتمی سکه + ایجاد ردیف.
 * در رد ادمین، سکه برمی‌گردد.
 */
export async function submitCoinSell(input: {
  userId: number;
  coins: number;
  cardNumber: string;
}): Promise<
  | { ok: true; requestId: number; amountToman: number; rateToman: number }
  | { ok: false; reason: "min" | "balance" | "card" | "pending" | "user" }
> {
  const coins = Math.floor(input.coins);
  if (!Number.isFinite(coins) || coins < MIN_SELL_COINS) {
    return { ok: false, reason: "min" };
  }
  const cardCheck = validateIranCard(input.cardNumber);
  if (!cardCheck.ok) return { ok: false, reason: "card" };

  if (await userHasOpenSell(input.userId)) {
    return { ok: false, reason: "pending" };
  }

  const rateToman = COIN_SELL_PRICE_TOMAN;
  const amountToman = sellAmountToman(coins, rateToman);

  try {
    const requestId = await prisma.$transaction(async (tx) => {
      const open = await tx.coinSellRequest.count({
        where: { userId: input.userId, status: "open" },
      });
      if (open > 0) {
        throw new Error("PENDING");
      }
      const debited = await tx.user.updateMany({
        where: {
          id: input.userId,
          diamonds: { gte: coins },
          deletedAt: null,
        },
        data: { diamonds: { decrement: coins } },
      });
      if (debited.count !== 1) {
        throw new Error("BALANCE");
      }
      const row = await tx.coinSellRequest.create({
        data: {
          userId: input.userId,
          coins,
          rateToman,
          amountToman,
          cardNumber: cardCheck.card,
          status: "open",
        },
      });
      return row.id;
    });
    return { ok: true, requestId, amountToman, rateToman };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "BALANCE") return { ok: false, reason: "balance" };
    if (msg === "PENDING") return { ok: false, reason: "pending" };
    throw err;
  }
}

export async function markCoinSellPaid(id: number, note?: string | null) {
  const updated = await prisma.coinSellRequest.updateMany({
    where: { id, status: "open" },
    data: {
      status: "paid",
      reviewedAt: new Date(),
      adminNote: note?.trim() || null,
    },
  });
  if (updated.count !== 1) {
    return null;
  }
  return prisma.coinSellRequest.findUnique({
    where: { id },
    include: { user: true },
  });
}

/** رد درخواست + برگشت سکه (فقط اگر هنوز open باشد) */
export async function rejectCoinSell(
  id: number,
  note?: string | null,
): Promise<{ ok: true; refunded: number } | { ok: false; reason: "missing" | "status" }> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.coinSellRequest.findUnique({ where: { id } });
    if (!row) return { ok: false as const, reason: "missing" as const };
    if (row.status !== "open") return { ok: false as const, reason: "status" as const };

    await tx.coinSellRequest.update({
      where: { id },
      data: {
        status: "rejected",
        reviewedAt: new Date(),
        adminNote: note?.trim() || null,
      },
    });
    await tx.user.update({
      where: { id: row.userId },
      data: { diamonds: { increment: row.coins } },
    });
    return { ok: true as const, refunded: row.coins };
  });
}

function briefUser(u: {
  id: number;
  displayName: string | null;
  userCode: string | null;
  username?: string | null;
}) {
  const name = u.displayName?.trim() || `user_${u.userCode ?? u.id}`;
  const un = u.username ? ` @${u.username}` : "";
  const code = u.userCode ? ` /user_${u.userCode}` : "";
  return `${name}${un} (#${u.id}${code})`;
}

export async function notifyAdminsNewCoinSell(
  api: Api,
  requestId: number,
): Promise<void> {
  const row = await getCoinSellById(requestId);
  if (!row) return;
  const text = [
    "💵 درخواست فروش سکه جدید",
    "",
    `شماره: #${row.id}`,
    `سکه: ${formatNum(row.coins)}`,
    `مبلغ: ${formatToman(row.amountToman)}`,
    `نرخ: ${formatNum(row.rateToman)} ت/سکه`,
    `کارت: ${formatCardGrouped(row.cardNumber)}`,
    "",
    `کاربر: ${briefUser(row.user)}`,
    `tg: ${row.user.telegramId}`,
    "",
    "از پنل ادمین → فروش سکه ببین.",
  ].join("\n");

  for (const adminId of getAdminIds()) {
    await api.sendMessage(adminId, text).catch(() => undefined);
  }
}
