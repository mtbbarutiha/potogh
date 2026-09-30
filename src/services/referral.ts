import { prisma } from "../db/prisma.js";
import { REFERRAL_BONUS } from "../data/packages.js";

/**
 * جایزه معرفی دوستان — فقط به معرف (inviter).
 * دعوت‌شده فقط هدیه ورود (WELCOME_DIAMONDS) را می‌گیرد، نه این پاداش.
 *
 * باید فقط از finishRegistration و بعد از claim اتمی registered=false→true صدا زده شود.
 * claim اتمی روی referralBonusGranted از double-credit جلوگیری می‌کند و referredById را نگه می‌دارد.
 */
export async function grantReferralBonusIfEligible(
  userId: number,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        referredById: true,
        telegramId: true,
        registered: true,
        deletedAt: true,
        referralBonusGranted: true,
      },
    });
    if (
      !user?.referredById ||
      !user.registered ||
      user.deletedAt ||
      user.referralBonusGranted
    ) {
      return false;
    }

    const referrerId = user.referredById;

    // اگر قبلاً با همین تلگرام برای همین معرف ثبت‌نام کامل کرده (حساب حذف‌شده)، دوباره پاداش نده
    const prevDeleted = await tx.deletedAccount.findMany({
      where: { telegramId: user.telegramId },
      select: { originalUserId: true },
    });
    if (prevDeleted.length) {
      const reused = await tx.user.count({
        where: {
          id: { in: prevDeleted.map((p) => p.originalUserId) },
          referredById: referrerId,
          registered: true,
        },
      });
      if (reused > 0) {
        await tx.user.updateMany({
          where: { id: userId, referralBonusGranted: false },
          data: { referralBonusGranted: true },
        });
        return false;
      }
    }

    // Claim اتمی — فقط یک بار
    const claimed = await tx.user.updateMany({
      where: {
        id: userId,
        registered: true,
        deletedAt: null,
        referredById: referrerId,
        referralBonusGranted: false,
      },
      data: { referralBonusGranted: true },
    });
    if (claimed.count !== 1) return false;

    const credited = await tx.user.updateMany({
      where: { id: referrerId, deletedAt: null },
      data: { diamonds: { increment: REFERRAL_BONUS } },
    });
    return credited.count === 1;
  });
}
