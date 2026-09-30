import { prisma } from "../db/prisma.js";
import { DAILY_COIN_REWARD } from "../data/packages.js";

const TEHRAN_TZ = "Asia/Tehran";

export function tehranDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TEHRAN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** شروع روز جاری به وقت تهران */
export function tehranTodayStart(now = new Date()): Date {
  const key = tehranDayKey(now);
  return new Date(`${key}T00:00:00+03:30`);
}

export function canClaimDailyCoin(lastDailyCoinAt: Date | null | undefined): boolean {
  if (!lastDailyCoinAt) return true;
  return tehranDayKey(lastDailyCoinAt) !== tehranDayKey(new Date());
}

export async function claimDailyCoin(userId: number): Promise<
  | { ok: true; amount: number; balance: number }
  | { ok: false; reason: "no_user" | "already" }
> {
  const todayStart = tehranTodayStart();
  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: {
        id: userId,
        OR: [{ lastDailyCoinAt: null }, { lastDailyCoinAt: { lt: todayStart } }],
      },
      data: {
        diamonds: { increment: DAILY_COIN_REWARD },
        lastDailyCoinAt: new Date(),
      },
    });
    if (updated.count !== 1) {
      const exists = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!exists) return { ok: false, reason: "no_user" };
      return { ok: false, reason: "already" };
    }
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { diamonds: true },
    });
    return {
      ok: true,
      amount: DAILY_COIN_REWARD,
      balance: user?.diamonds ?? 0,
    };
  });
}
