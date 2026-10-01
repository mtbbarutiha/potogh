import { prisma } from "../db/prisma.js";
import type { Prisma } from "@prisma/client";

/** دلیل تراکنش سکه — برای گزارش مصرف به تفکیک بخش */
export type CoinReason =
  | "quick_match"
  | "direct_request"
  | "chat_gift_sent"
  | "chat_gift_recv"
  | "boost"
  | "thread_gift_sent"
  | "thread_gift_recv"
  | "like_gift"
  | "list_blast"
  | "direct_msg"
  | "daily"
  | "referral"
  | "welcome"
  | "purchase"
  | "voucher"
  | "admin_gift"
  | "admin_giftall"
  | "face_verify"
  | "profile_section"
  | "sell_hold"
  | "sell_refund"
  | "delete_account"
  | "other";

type Tx = Prisma.TransactionClient;

/** ثبت یک ردیف در دفترکل سکه (بی‌خطر — خطا نمی‌دهد) */
export async function recordCoin(
  userId: number,
  delta: number,
  reason: CoinReason,
  tx?: Tx,
): Promise<void> {
  if (!Number.isFinite(delta) || delta === 0) return;
  const client = tx ?? prisma;
  try {
    await client.coinLedger.create({ data: { userId, delta, reason } });
  } catch {
    /* دفترکل نباید مسیر اصلی را بشکند */
  }
}

/**
 * Atomic debit — never goes negative even under concurrent clicks.
 * @returns true if coins were deducted
 */
export async function debitCoins(
  userId: number,
  amount: number,
  reason: CoinReason = "other",
): Promise<boolean> {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const result = await prisma.user.updateMany({
    where: { id: userId, diamonds: { gte: amount }, deletedAt: null },
    data: { diamonds: { decrement: amount } },
  });
  if (result.count === 1) await recordCoin(userId, -amount, reason);
  return result.count === 1;
}

/** Credit coins (admin gifts, rewards, transfers in) */
export async function creditCoins(
  userId: number,
  amount: number,
  reason: CoinReason = "other",
): Promise<boolean> {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const result = await prisma.user.updateMany({
    where: { id: userId, deletedAt: null },
    data: { diamonds: { increment: amount } },
  });
  if (result.count === 1) await recordCoin(userId, amount, reason);
  return result.count === 1;
}

/**
 * Transfer coins A→B atomically (debit then credit; rollback credit on debit fail is N/A —
 * uses a transaction so either both succeed or neither).
 */
export async function transferCoins(
  fromUserId: number,
  toUserId: number,
  amount: number,
): Promise<boolean> {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  if (fromUserId === toUserId) return false;

  return prisma.$transaction(async (tx) => {
    const debited = await tx.user.updateMany({
      where: {
        id: fromUserId,
        diamonds: { gte: amount },
        deletedAt: null,
      },
      data: { diamonds: { decrement: amount } },
    });
    if (debited.count !== 1) return false;
    await tx.user.update({
      where: { id: toUserId },
      data: { diamonds: { increment: amount } },
    });
    return true;
  });
}
