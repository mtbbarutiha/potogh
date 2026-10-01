import { InlineKeyboard } from "grammy";
import { prisma } from "../db/prisma.js";
import { formatNum } from "../data/packages.js";
import { normalizeLang, tr, type Lang } from "../i18n/index.js";
import { recordCoin } from "./coins.js";

export type ChatGift = {
  code: string;
  emoji: string;
  faName: string;
  enName: string;
  cost: number;
};

/** کاتالوگ هدیه‌های حین چت */
export const CHAT_GIFTS: ChatGift[] = [
  { code: "rose", emoji: "🌹", faName: "گل رز", enName: "Rose", cost: 10 },
  { code: "heart", emoji: "❤️", faName: "قلب", enName: "Heart", cost: 15 },
  { code: "kiss", emoji: "😘", faName: "بوس", enName: "Kiss", cost: 20 },
  { code: "teddy", emoji: "🧸", faName: "عروسک", enName: "Teddy", cost: 30 },
  { code: "cake", emoji: "🎂", faName: "کیک", enName: "Cake", cost: 40 },
  { code: "ring", emoji: "💍", faName: "حلقه", enName: "Ring", cost: 50 },
  { code: "diamond", emoji: "💎", faName: "الماس", enName: "Diamond", cost: 100 },
];

/** سهم گیرنده از هدیه — ۶۰٪، بقیه سهم سیستم */
export const CHAT_GIFT_RECIPIENT_PCT = 0.6;

export function findChatGift(code: string): ChatGift | undefined {
  return CHAT_GIFTS.find((g) => g.code === code);
}

export function chatGiftRecipientShare(cost: number): number {
  return Math.floor(cost * CHAT_GIFT_RECIPIENT_PCT);
}

export function chatGiftName(gift: ChatGift, lang: Lang): string {
  return lang === "en" ? gift.enName : gift.faName;
}

/** منوی انتخاب هدیه (دو ستونه) */
export function chatGiftMenuKeyboard(lang: Lang | string | null = "fa") {
  const L = normalizeLang(lang);
  const kb = new InlineKeyboard();
  CHAT_GIFTS.forEach((g, i) => {
    kb.text(
      `${g.emoji} ${chatGiftName(g, L)} · ${formatNum(g.cost)}💰`,
      `gift:send:${g.code}`,
    );
    if ((i + 1) % 2 === 0) kb.row();
  });
  kb.row().text(tr(L, "↩️ بستن", "↩️ Close"), "gift:close");
  return kb;
}

/**
 * ارسال هدیه حین چت — کسر اتمی از فرستنده + ۶۰٪ به گیرنده در یک تراکنش.
 */
export async function sendChatGift(
  senderId: number,
  recipientId: number,
  code: string,
): Promise<
  | { ok: true; gift: ChatGift; recipientShare: number; senderBalance: number }
  | { ok: false; reason: "invalid" | "no_coins" | "self" }
> {
  if (senderId === recipientId) return { ok: false, reason: "self" };
  const gift = findChatGift(code);
  if (!gift) return { ok: false, reason: "invalid" };
  const share = chatGiftRecipientShare(gift.cost);
  return prisma.$transaction(async (tx) => {
    const debited = await tx.user.updateMany({
      where: { id: senderId, diamonds: { gte: gift.cost }, deletedAt: null },
      data: { diamonds: { decrement: gift.cost } },
    });
    if (debited.count !== 1) {
      return { ok: false as const, reason: "no_coins" as const };
    }
    await recordCoin(senderId, -gift.cost, "chat_gift_sent", tx);
    if (share > 0) {
      await tx.user.updateMany({
        where: { id: recipientId, deletedAt: null },
        data: { diamonds: { increment: share } },
      });
      await recordCoin(recipientId, share, "chat_gift_recv", tx);
    }
    const sender = await tx.user.findUnique({
      where: { id: senderId },
      select: { diamonds: true },
    });
    return {
      ok: true as const,
      gift,
      recipientShare: share,
      senderBalance: sender?.diamonds ?? 0,
    };
  });
}
