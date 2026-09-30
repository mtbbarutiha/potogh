import type { Api } from "grammy";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import {
  formatNum,
  QUICK_MATCH_COST,
  QUICK_MATCH_REFUND_MS,
} from "../data/packages.js";
import { langOf } from "../i18n/index.js";
import { creditCoins } from "./coins.js";

export { QUICK_MATCH_COST, QUICK_MATCH_REFUND_MS };

type Tx = Prisma.TransactionClient;

/**
 * کسر اتمیک ۲ سکه برای هر پرداخت‌کنندهٔ وصل ناشناس + ثبت QuickMatchCharge.
 * داخل همان تراکنش claim جفت صدا زده می‌شود.
 * @returns false اگر یکی از پرداخت‌کننده‌ها سکه کافی نداشته باشد
 */
export async function debitQuickMatchPayersInTx(
  tx: Tx,
  payers: number[],
  aId: number,
  bId: number,
  amount: number = QUICK_MATCH_COST,
): Promise<boolean> {
  const unique = [...new Set(payers.filter((id) => id === aId || id === bId))];
  for (const payerId of unique) {
    const partnerId = payerId === aId ? bId : aId;
    const debited = await tx.user.updateMany({
      where: {
        id: payerId,
        diamonds: { gte: amount },
        deletedAt: null,
      },
      data: { diamonds: { decrement: amount } },
    });
    if (debited.count !== 1) return false;
    await tx.quickMatchCharge.create({
      data: {
        payerId,
        partnerId,
        amount,
      },
    });
  }
  return true;
}

/** پیام اطلاع کسر سکه بعد از وصل موفق */
export async function notifyQuickMatchCharged(
  api: Api,
  payerIds: number[],
  amount: number = QUICK_MATCH_COST,
): Promise<void> {
  const unique = [...new Set(payerIds)];
  for (const payerId of unique) {
    const payer = await prisma.user.findUnique({ where: { id: payerId } });
    if (!payer || payer.telegramId >= 9000000000n) continue;
    const lang = langOf(payer);
    const text =
      lang === "en"
        ? [
            `💰 −${amount} coins for anonymous match.`,
            `Balance: ${payer.diamonds} 💰`,
            "",
            `If the other person leaves within ${QUICK_MATCH_REFUND_MS / 1000}s, coins are refunded.`,
          ].join("\n")
        : [
            `💰 −${formatNum(amount)} سکه بابت وصل ناشناس کسر شد.`,
            `موجودی: ${formatNum(payer.diamonds)} 💰`,
            "",
            `اگر طرف مقابل کمتر از ${formatNum(QUICK_MATCH_REFUND_MS / 1000)} ثانیه قطع کند، سکه برمی‌گردد.`,
          ].join("\n");
    try {
      await api.sendMessage(Number(payer.telegramId), text);
    } catch (err) {
      console.error("quickMatch charge notify failed", payerId, err);
    }
  }
}

/**
 * بعد از قطع چت: اگر طرف مقابلِ پرداخت‌کننده زیر ۲۰ ثانیه قطع کرده باشد → بازپرداخت.
 * اگر خود پرداخت‌کننده قطع کرده یا ≥۲۰ثانیه گذشته → بدون بازپرداخت، فقط endedAt.
 * ضد double-refund با updateMany روی refundedAt/endedAt.
 */
export async function settleQuickMatchOnChatEnd(
  api: Api,
  endedByUserId: number,
  partnerId: number,
): Promise<void> {
  const open = await prisma.quickMatchCharge.findMany({
    where: {
      endedAt: null,
      refundedAt: null,
      OR: [
        { payerId: endedByUserId, partnerId },
        { payerId: partnerId, partnerId: endedByUserId },
      ],
    },
  });
  if (!open.length) return;

  const now = Date.now();
  for (const charge of open) {
    const elapsed = now - charge.connectedAt.getTime();
    const partnerLeftEarly =
      charge.payerId !== endedByUserId && elapsed < QUICK_MATCH_REFUND_MS;

    if (partnerLeftEarly) {
      const claimed = await prisma.quickMatchCharge.updateMany({
        where: {
          id: charge.id,
          endedAt: null,
          refundedAt: null,
        },
        data: {
          endedAt: new Date(),
          refundedAt: new Date(),
        },
      });
      if (claimed.count !== 1) continue;

      const credited = await creditCoins(charge.payerId, charge.amount);
      if (!credited) {
        console.error(
          "quickMatch refund credit failed",
          charge.id,
          charge.payerId,
        );
      }

      const payer = await prisma.user.findUnique({
        where: { id: charge.payerId },
      });
      if (!payer || payer.telegramId >= 9000000000n) continue;
      const lang = langOf(payer);
      const text =
        lang === "en"
          ? [
              "♻️ Coins refunded",
              "",
              "The other person left the chat too quickly.",
              `+${charge.amount} coins returned to your balance.`,
              `Balance: ${payer.diamonds} 💰`,
            ].join("\n")
          : [
              "♻️ سکه برگشت داده شد",
              "",
              "طرف مقابل زود چت را بست.",
              `+${formatNum(charge.amount)} سکه به حسابت برگشت.`,
              `موجودی: ${formatNum(payer.diamonds)} 💰`,
            ].join("\n");
      try {
        await api.sendMessage(Number(payer.telegramId), text);
      } catch (err) {
        console.error("quickMatch refund notify failed", charge.payerId, err);
      }
    } else {
      await prisma.quickMatchCharge.updateMany({
        where: {
          id: charge.id,
          endedAt: null,
          refundedAt: null,
        },
        data: { endedAt: new Date() },
      });
    }
  }
}

/** پیام خطای سکه ناکافی برای چت سریع */
export function quickMatchInsufficientCoinsText(
  lang: "fa" | "en",
  balance: number,
  cost: number = QUICK_MATCH_COST,
): string {
  if (lang === "en") {
    return [
      "⚡ Anonymous match",
      "",
      `Cost: ${cost} coins (charged when you connect).`,
      `Balance: ${balance} 💰`,
      "Not enough coins — buy from «💛 Coins».",
    ].join("\n");
  }
  return [
    "⚡ وصل ناشناس",
    "",
    `هزینه: ${formatNum(cost)} سکه (هنگام وصل موفق کسر می‌شود).`,
    `موجودی: ${formatNum(balance)} 💰`,
    "سکه کافی نیست — از «💛 سکه‌ها» بخر.",
  ].join("\n");
}
