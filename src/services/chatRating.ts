import { InlineKeyboard } from "grammy";
import type { Api } from "grammy";
import { prisma } from "../db/prisma.js";
import { normalizeLang, tr, langOf, type Lang } from "../i18n/index.js";
import { formatNum } from "../data/packages.js";

/** کیبورد ⭐ ۱ تا ۵ برای امتیازدهی به طرف مقابل (rateeId = شناسه داخلی طرف مقابل) */
export function ratingKeyboard(
  rateeId: number,
  lang: Lang | string | null = "fa",
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (let s = 1; s <= 5; s++) {
    kb.text(`${s}⭐`, `rate:${rateeId}:${s}`);
  }
  void normalizeLang(lang);
  return kb;
}

/** خط امتیاز برای نمایش روی پروفایل */
export function ratingLabel(
  ratingSum: number,
  ratingCount: number,
  lang: Lang | string | null = "fa",
): string {
  const L = normalizeLang(lang);
  if (!ratingCount || ratingCount <= 0) {
    return tr(L, "⭐ بدون امتیاز", "⭐ No ratings yet");
  }
  const avg = (ratingSum / ratingCount).toFixed(1);
  return tr(
    L,
    `⭐ ${avg} از ۵ (${formatNum(ratingCount)} رأی)`,
    `⭐ ${avg}/5 (${formatNum(ratingCount)} ratings)`,
  );
}

/** ثبت/به‌روزرسانی امتیاز — هر کاربر یک امتیاز برای هر نفر */
export async function rateUser(
  raterId: number,
  rateeId: number,
  stars: number,
): Promise<
  | { ok: true; avg: number; count: number; updated: boolean }
  | { ok: false; reason: "self" | "invalid" }
> {
  if (raterId === rateeId) return { ok: false, reason: "self" };
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return { ok: false, reason: "invalid" };
  }
  return prisma.$transaction(async (tx) => {
    const existing = await tx.chatRating.findUnique({
      where: { raterId_rateeId: { raterId, rateeId } },
    });
    let updated = false;
    if (existing) {
      updated = true;
      const delta = stars - existing.stars;
      if (delta !== 0) {
        await tx.chatRating.update({
          where: { id: existing.id },
          data: { stars },
        });
        await tx.user.update({
          where: { id: rateeId },
          data: { ratingSum: { increment: delta } },
        });
      }
    } else {
      await tx.chatRating.create({ data: { raterId, rateeId, stars } });
      await tx.user.update({
        where: { id: rateeId },
        data: { ratingSum: { increment: stars }, ratingCount: { increment: 1 } },
      });
    }
    const u = await tx.user.findUnique({
      where: { id: rateeId },
      select: { ratingSum: true, ratingCount: true },
    });
    const count = u?.ratingCount ?? 0;
    const avg = count > 0 ? (u?.ratingSum ?? 0) / count : 0;
    return { ok: true as const, avg, count, updated };
  });
}

/** پرامپت امتیازدهی به طرف مقابل بعد از پایان چت (پیام جدا) */
export async function promptRating(
  api: Api,
  toUser: { id: number; telegramId: bigint },
  rateePartnerId: number,
): Promise<void> {
  if (toUser.telegramId >= 9000000000n) return;
  try {
    const u = await prisma.user.findUnique({ where: { id: toUser.id } });
    const lang = langOf(u);
    await api.sendMessage(
      Number(toUser.telegramId),
      tr(
        lang,
        "⭐ به چتی که داشتی چند ستاره می‌دی؟\nامتیازت روی پروفایل طرف مقابل تأثیر می‌گذارد (ناشناس).",
        "⭐ How would you rate that chat?\nYour rating affects the other person's profile (anonymous).",
      ),
      { reply_markup: ratingKeyboard(rateePartnerId, lang) },
    );
  } catch {
    /* ignore */
  }
}
