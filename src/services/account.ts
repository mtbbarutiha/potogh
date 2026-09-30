import { prisma } from "../db/prisma.js";
import type { User } from "@prisma/client";
import type { Context } from "grammy";
import { tr, normalizeLang, type Lang } from "../i18n/index.js";

/** آرشیو + آزاد کردن telegramId تا کاربر با شناسهٔ جدید بسازد.
 *  اگر coinCost > 0 باشد، همان تراکنش سکه را کم می‌کند؛ در صورت کمبود سکه false برمی‌گرداند.
 */
export async function deleteAccountPermanently(
  user: User,
  opts?: { coinCost?: number },
): Promise<boolean> {
  const coinCost = opts?.coinCost ?? 0;

  try {
    await prisma.$transaction(async (tx) => {
      if (coinCost > 0) {
        const debited = await tx.user.updateMany({
          where: {
            id: user.id,
            diamonds: { gte: coinCost },
            deletedAt: null,
          },
          data: { diamonds: { decrement: coinCost } },
        });
        if (debited.count !== 1) {
          throw new Error("DELETE_ACCOUNT_NO_COINS");
        }
      }

      await tx.deletedAccount.create({
        data: {
          originalUserId: user.id,
          telegramId: user.telegramId,
          username: user.username,
          displayName: user.displayName,
          gender: user.gender,
          age: user.age,
          province: user.province,
          city: user.city,
        },
      });

      // آزاد کردن شناسه یکتاها با مقادیر آرشیوی
      const stamp = Date.now().toString(36);
      await tx.user.update({
        where: { id: user.id },
        data: {
          telegramId: BigInt(`-${user.id}`), // دیگر با tg واقعی تداخل ندارد
          referralCode: `del_${user.id}_${stamp}`,
          anonCode: `delanon_${user.id}_${stamp}`,
          deletedAt: new Date(),
          isActive: false,
          registered: false,
          state: "deleted",
          chatPartnerId: null,
          pendingAnonTo: null,
          pendingDirectTo: null,
          pendingSellCard: null,
          pendingReportOther: null,
          photoFileId: null,
          photoPendingFileId: null,
          photoStatus: "none",
          faceVerified: false,
          facePendingFileId: null,
          facePendingKind: null,
          faceStatus: "none",
          username: null,
          displayName: `[حذف‌شده #${user.id}]`,
        },
      });
    });
    return true;
  } catch (err) {
    if (err instanceof Error && err.message === "DELETE_ACCOUNT_NO_COINS") {
      return false;
    }
    throw err;
  }
}

export async function previousAccountIds(telegramId: bigint | number) {
  const rows = await prisma.deletedAccount.findMany({
    where: { telegramId: BigInt(telegramId) },
    orderBy: { deletedAt: "desc" },
    take: 10,
  });
  return rows;
}

/** آیا این تلگرام‌آیدی قبلاً حساب حذف‌شده داشته؟ */
export async function hasDeletedAccountHistory(
  telegramId: number | bigint,
): Promise<boolean> {
  const n = await prisma.deletedAccount.count({
    where: { telegramId: BigInt(telegramId) },
  });
  return n > 0;
}

export function selfAccountDeletedText(
  lang: Lang | string | null | undefined,
  opts?: { previousId?: number | null },
): string {
  const L = normalizeLang(lang);
  const prev =
    opts?.previousId != null
      ? tr(
          L,
          `\nشناسهٔ قبلی: #${opts.previousId}`,
          `\nPrevious ID: #${opts.previousId}`,
        )
      : "";
  return (
    tr(
      L,
      "🗑️ حسابت حذف شده و دیگر فعال نیست.",
      "🗑️ Your account was deleted and is no longer active.",
    ) +
    prev +
    "\n\n" +
    tr(
      L,
      "برای ساخت حساب کاملاً جدید، /start را بزن.",
      "Send /start to create a brand-new account.",
    )
  );
}

export function selfAccountDeletedAlert(
  lang: Lang | string | null | undefined,
): string {
  const L = normalizeLang(lang);
  return tr(
    L,
    "حسابت حذف شده — /start بزن",
    "Account deleted — send /start",
  );
}

export function targetAccountDeletedText(
  lang: Lang | string | null | undefined,
): string {
  const L = normalizeLang(lang);
  return tr(
    L,
    "این کاربر حسابش را حذف کرده و دیگر در دسترس نیست.",
    "This user deleted their account and is no longer available.",
  );
}

export function targetAccountDeletedAlert(
  lang: Lang | string | null | undefined,
): string {
  const L = normalizeLang(lang);
  return tr(
    L,
    "این کاربر حسابش را حذف کرده",
    "This user deleted their account",
  );
}

/** پیام دقیق به خودِ کاربر وقتی حسابش حذف شده (callback → alert، پیام → reply) */
export async function notifySelfAccountDeleted(
  ctx: Context,
  lang: Lang | string | null | undefined = "fa",
  opts?: { previousId?: number | null },
): Promise<void> {
  const L = normalizeLang(lang);
  const text = selfAccountDeletedText(L, opts);
  const alert = selfAccountDeletedAlert(L);
  try {
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({ text: alert, show_alert: true });
    }
  } catch {
    /* already answered */
  }
  try {
    await ctx.reply(text, { reply_markup: { remove_keyboard: true } });
  } catch {
    /* ignore */
  }
}

/** وقتی طرف مقابل حذف شده */
export async function notifyTargetAccountDeleted(
  ctx: Context,
  lang: Lang | string | null | undefined = "fa",
): Promise<void> {
  const L = normalizeLang(lang);
  const alert = targetAccountDeletedAlert(L);
  try {
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({ text: alert, show_alert: true });
    } else {
      await ctx.reply(targetAccountDeletedText(L));
    }
  } catch {
    /* ignore */
  }
}

export async function formatAdminUserLine(user: {
  id: number;
  telegramId: bigint;
  displayName: string | null;
  username?: string | null;
}) {
  const prev = await previousAccountIds(user.telegramId);
  const lines = [
    `کاربر: ${user.displayName ?? "—"}`,
    user.username ? `یوزرنیم: @${user.username}` : null,
    `شناسه فعلی: #${user.id}`,
    `تلگرام: ${user.telegramId}`,
  ];
  if (prev.length) {
    lines.push(
      `شناسه‌های قدیمی: ${prev.map((p) => `#${p.originalUserId}`).join("، ")}`,
    );
    const last = prev[0]!;
    lines.push(
      `آخرین حذف: ${last.displayName ?? "—"} | ${last.province ?? "—"}، ${last.city ?? "—"} | ${last.deletedAt.toLocaleString("fa-IR")}`,
    );
  }
  return lines.filter(Boolean).join("\n");
}

/** اگر رکورد حذف‌شدهٔ قدیمی با همان tg مانده، آزادش کن */
export async function releaseIfSoftDeleted(telegramId: number) {
  const existing = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
  });
  if (existing?.deletedAt) {
    await deleteAccountPermanently(existing);
    return true;
  }
  return false;
}
