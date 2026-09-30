import { InlineKeyboard } from "grammy";
import { prisma } from "../db/prisma.js";
import { formatNum } from "../data/packages.js";
import { formatAdminUserLine } from "./account.js";

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function toAsciiDigits(input: string): string {
  let out = "";
  for (const ch of input) {
    const p = PERSIAN_DIGITS.indexOf(ch);
    if (p >= 0) {
      out += String(p);
      continue;
    }
    const a = ARABIC_DIGITS.indexOf(ch);
    if (a >= 0) {
      out += String(a);
      continue;
    }
    out += ch;
  }
  return out;
}

/** استخراج کد/شناسه از ورودی ادمین */
export function normalizeUserRef(raw: string): string {
  let s = raw.trim();
  const link = s.match(/user_([A-Za-z0-9]+)/i);
  if (link) return link[1]!;
  s = s.replace(/^\/+/, "");
  if (s.toLowerCase().startsWith("user_")) s = s.slice(5);
  if (s.startsWith("@")) s = s.slice(1);
  return s.trim();
}

export function parseCoinAmount(raw: string): number | null {
  const digits = toAsciiDigits(raw).replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) return null;
  return Math.floor(n);
}

export async function resolveAdminTarget(raw: string) {
  const ref = normalizeUserRef(raw);
  if (!ref) return null;

  // آیدی داخلی
  if (/^\d+$/.test(ref) && ref.length <= 8) {
    const byId = await prisma.user.findFirst({
      where: { id: Number(ref), deletedAt: null },
    });
    if (byId) return byId;
  }

  // تلگرام آیدی
  if (/^\d{5,15}$/.test(ref)) {
    try {
      const byTg = await prisma.user.findFirst({
        where: { telegramId: BigInt(ref), deletedAt: null },
      });
      if (byTg) return byTg;
    } catch {
      /* ignore */
    }
  }

  // userCode دقیق
  const byCode = await prisma.user.findFirst({
    where: { userCode: ref, deletedAt: null },
  });
  if (byCode) return byCode;

  // username دقیق
  const byUsername = await prisma.user.findFirst({
    where: { username: ref, deletedAt: null },
  });
  if (byUsername) return byUsername;

  // حساس‌نبودن به حروف بزرگ/کوچک برای کد و یوزرنیم
  const lower = ref.toLowerCase();
  const candidates = await prisma.user.findMany({
    where: {
      deletedAt: null,
      OR: [{ userCode: { not: null } }, { username: { not: null } }],
    },
    take: 8000,
  });
  return (
    candidates.find((u) => u.userCode?.toLowerCase() === lower) ??
    candidates.find((u) => u.username?.toLowerCase() === lower) ??
    null
  );
}

export async function creditUserCoins(targetId: number, amount: number) {
  return prisma.user.update({
    where: { id: targetId },
    data: { diamonds: { increment: amount } },
  });
}

export function giveCoinsCancelKeyboard() {
  return new InlineKeyboard()
    .text("❌ انصراف", "adm:give:cancel")
    .danger()
    .row()
    .text("↩️ پنل ادمین", "adm:home")
    .primary();
}

export function giveCoinsAmountKeyboard(targetId: number) {
  return new InlineKeyboard()
    .text("۵۰", `adm:give:amt:${targetId}:50`)
    .text("۱۰۰", `adm:give:amt:${targetId}:100`)
    .text("۲۰۰", `adm:give:amt:${targetId}:200`)
    .row()
    .text("۵۰۰", `adm:give:amt:${targetId}:500`)
    .text("۱۰۰۰", `adm:give:amt:${targetId}:1000`)
    .text("۵۰۰۰", `adm:give:amt:${targetId}:5000`)
    .row()
    .text("✏️ مقدار دلخواه (تایپ کن)", `adm:give:custom:${targetId}`)
    .primary()
    .row()
    .text("❌ انصراف", "adm:give:cancel")
    .danger();
}

export function giveCoinsConfirmKeyboard(targetId: number, amount: number) {
  return new InlineKeyboard()
    .text(
      `✅ تأیید +${formatNum(amount)} سکه`,
      `adm:give:ok:${targetId}:${amount}`,
    )
    .success()
    .row()
    .text("↩️ تغییر مقدار", `adm:give:pick:${targetId}`)
    .primary()
    .text("❌ انصراف", "adm:give:cancel")
    .danger();
}

export async function describeTarget(user: {
  id: number;
  displayName: string | null;
  userCode: string | null;
  username: string | null;
  diamonds: number;
  telegramId: bigint;
  gender: string | null;
  age: number | null;
  province: string | null;
  city: string | null;
}) {
  const line = await formatAdminUserLine(user);
  return [
    line,
    user.userCode ? `آیدی ربات: /user_${user.userCode}` : null,
    user.username ? `یوزرنیم: @${user.username}` : null,
    `تلگرام‌آیدی: ${user.telegramId.toString()}`,
    `موجودی فعلی: ${formatNum(user.diamonds)} 💰`,
  ]
    .filter(Boolean)
    .join("\n");
}
