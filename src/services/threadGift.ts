import type { Api } from "grammy";
import { prisma } from "../db/prisma.js";
import {
  formatNum,
  THREAD_GIFT_COST,
  THREAD_GIFT_RECIPIENT,
} from "../data/packages.js";
import { tr, normalizeLang, type Lang } from "../i18n/index.js";
import { checkUserRate } from "../middleware/rateLimit.js";

export type ThreadGiftResult =
  | "self"
  | "missing"
  | "insufficient"
  | "rate_limited"
  | "ok";

type UserRow = {
  id: number;
  diamonds: number;
  displayName: string | null;
  telegramId: bigint;
  userCode?: string | null;
  language?: string | null;
};

export async function sendThreadGift(
  api: Api,
  sender: UserRow,
  targetId: number,
): Promise<ThreadGiftResult> {
  if (targetId === sender.id) return "self";

  if (!checkUserRate(Number(sender.telegramId), "coin_action")) {
    return "rate_limited";
  }

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target || target.deletedAt) return "missing";

  // Atomic debit → credit + log interaction (type=thread) for admin stats
  try {
    const ok = await prisma.$transaction(async (tx) => {
      const debited = await tx.user.updateMany({
        where: {
          id: sender.id,
          diamonds: { gte: THREAD_GIFT_COST },
          deletedAt: null,
        },
        data: { diamonds: { decrement: THREAD_GIFT_COST } },
      });
      if (debited.count !== 1) return false;
      await tx.user.update({
        where: { id: targetId },
        data: { diamonds: { increment: THREAD_GIFT_RECIPIENT } },
      });
      await tx.interaction.create({
        data: {
          type: "thread",
          fromUserId: sender.id,
          toUserId: targetId,
        },
      });
      return true;
    });

    if (!ok) return "insufficient";
  } catch (err) {
    console.error("sendThreadGift failed", sender.id, targetId, err);
    return "insufficient";
  }

  const fromName = sender.displayName ?? tr("fa", "یک نفر", "Someone");
  const targetLang = normalizeLang(target.language);
  const { ensureUserCode } = await import("../db/users.js");
  const senderCode =
    sender.userCode ?? (await ensureUserCode(sender.id, sender.userCode));

  if (target.telegramId < 9000000000n) {
    await api
      .sendMessage(
        Number(target.telegramId),
        threadGiftRecipientMessage(fromName, targetLang, senderCode),
      )
      .catch(() => undefined);
  }

  return "ok";
}

export function threadGiftButtonLabel(lang: Lang | string | null): string {
  const L = normalizeLang(lang);
  return tr(
    L,
    `🧵 نخ دادن (${formatNum(THREAD_GIFT_COST)}💰)`,
    `🧵 Give thread (${formatNum(THREAD_GIFT_COST)}💰)`,
  );
}

export function threadGiftRecipientMessage(
  fromName: string,
  lang: Lang | string | null,
  userCode?: string | null,
): string {
  const L = normalizeLang(lang);
  const coins = formatNum(THREAD_GIFT_RECIPIENT);
  const idLine = userCode
    ? tr(L, `آیدی: /user_${userCode}`, `ID: /user_${userCode}`)
    : null;
  return tr(
    L,
    [
      "🧵💞 یک نخ گرم از طرف «{name}» به تو رسید!",
      idLine,
      "",
      "حس می‌کنم دلش برات تنگ شده — این هدیه‌ی کوچیک از طرفشه.",
      `💰 ${coins} سکه به حسابت اضافه شد.`,
      "",
      "مرسی که اینجایی 💕",
    ]
      .filter(Boolean)
      .join("\n"),
    [
      "🧵💞 {name} is giving you a thread!",
      idLine,
      "",
      "A little sign they’re thinking of you.",
      `💰 ${coins} coins added to your balance.`,
      "",
      "Thanks for being here 💕",
    ]
      .filter(Boolean)
      .join("\n"),
    { name: fromName },
  );
}

export function threadGiftSenderConfirm(
  targetName: string,
  lang: Lang | string | null,
): string {
  const L = normalizeLang(lang);
  const coins = formatNum(THREAD_GIFT_RECIPIENT);
  return tr(
    L,
    `🧵 نخت به «${targetName}» رسید.\n💰 ${coins} سکه به حسابش اضافه شد.`,
    `🧵 Your thread reached «${targetName}».\n💰 ${coins} coins added to their balance.`,
  );
}

export function threadGiftInsufficient(lang: Lang | string | null): string {
  const L = normalizeLang(lang);
  const cost = formatNum(THREAD_GIFT_COST);
  return tr(
    L,
    `برای نخ دادن به ${cost} سکه نیاز داری.`,
    `You need ${cost} coins to give a thread.`,
  );
}
