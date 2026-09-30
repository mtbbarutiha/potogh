import { randomBytes } from "node:crypto";
import { prisma } from "./prisma.js";
import { WELCOME_DIAMONDS } from "../data/packages.js";

const CODE_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** کد کوتاه شبیه پاتوق (مثلاً Rd4z5A) */
export function makePublicCode(len = 6): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return out;
}

function code(bytes = 4): string {
  return randomBytes(bytes).toString("hex");
}

async function uniqueCode(
  field: "referralCode" | "anonCode" | "userCode",
): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const value = field === "userCode" ? makePublicCode(6) : code();
    const clash = await prisma.user.findFirst({ where: { [field]: value } });
    if (!clash) return value;
  }
  return field === "userCode" ? makePublicCode(8) : code(8);
}

export async function findByTelegram(telegramId: number) {
  return prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
  });
}

export async function findByUserCode(userCode: string) {
  return prisma.user.findUnique({ where: { userCode } });
}

/** برای کاربران قدیمی بدون userCode */
export async function ensureUserCode(userId: number, current?: string | null) {
  if (current) return current;
  const userCode = await uniqueCode("userCode");
  await prisma.user.update({ where: { id: userId }, data: { userCode } });
  return userCode;
}

export async function backfillMissingUserCodes() {
  const all = await prisma.user.findMany({ select: { id: true, userCode: true } });
  let n = 0;
  for (const u of all) {
    if (!u.userCode || u.userCode.length < 3) {
      await ensureUserCode(u.id, null);
      n++;
    }
  }
  return n;
}

export async function ensureUser(params: {
  telegramId: number;
  username?: string;
  firstName?: string;
  referralCodeFromStart?: string;
}) {
  const { releaseIfSoftDeleted } = await import("../services/account.js");
  await releaseIfSoftDeleted(params.telegramId);

  const existing = await findByTelegram(params.telegramId);
  if (existing) {
    if (!existing.userCode) {
      await ensureUserCode(existing.id, existing.userCode);
    }

    // نسبت‌دهی دیرهنگام: فقط قبل از تکمیل ثبت‌نام و اگر هنوز معرف ندارد
    let lateReferredById: number | undefined;
    if (
      params.referralCodeFromStart &&
      !existing.registered &&
      !existing.referredById
    ) {
      const referrer = await prisma.user.findUnique({
        where: { referralCode: params.referralCodeFromStart },
      });
      if (
        referrer &&
        !referrer.deletedAt &&
        String(referrer.telegramId) !== String(params.telegramId)
      ) {
        lateReferredById = referrer.id;
      }
    }

    return prisma.user.update({
      where: { id: existing.id },
      data: {
        username: params.username ?? existing.username,
        firstName: params.firstName ?? existing.firstName,
        lastActiveAt: new Date(),
        ...(lateReferredById != null ? { referredById: lateReferredById } : {}),
      },
    });
  }

  let referredById: number | null = null;
  if (params.referralCodeFromStart) {
    const referrer = await prisma.user.findUnique({
      where: { referralCode: params.referralCodeFromStart },
    });
    if (
      referrer &&
      !referrer.deletedAt &&
      String(referrer.telegramId) !== String(params.telegramId)
    ) {
      referredById = referrer.id;
    }
  }

  const hadPreviousAccount =
    (await prisma.deletedAccount.count({
      where: { telegramId: BigInt(params.telegramId) },
    })) > 0;

  const user = await prisma.user.create({
    data: {
      telegramId: BigInt(params.telegramId),
      username: params.username ?? null,
      firstName: params.firstName ?? null,
      userCode: await uniqueCode("userCode"),
      referralCode: await uniqueCode("referralCode"),
      anonCode: await uniqueCode("anonCode"),
      referredById,
      diamonds: hadPreviousAccount ? 0 : WELCOME_DIAMONDS,
      registered: false,
      state: "language",
    },
  });

  const prev = await prisma.deletedAccount.findMany({
    where: {
      telegramId: BigInt(params.telegramId),
      reRegisteredUserId: null,
    },
  });
  if (prev.length) {
    await prisma.deletedAccount.updateMany({
      where: {
        telegramId: BigInt(params.telegramId),
        reRegisteredUserId: null,
      },
      data: { reRegisteredUserId: user.id },
    });
  }

  return user;
}

export async function patchUser(
  userId: number,
  data: Parameters<typeof prisma.user.update>[0]["data"],
) {
  return prisma.user.update({
    where: { id: userId },
    data: { ...data, lastActiveAt: new Date() },
  });
}

export function isRegistered(user: { registered: boolean }): boolean {
  return user.registered;
}
