import type { Api } from "grammy";
import { InlineKeyboard } from "grammy";
import { prisma } from "../db/prisma.js";
import { formatNum } from "../data/packages.js";

const FAKE_TG_MIN = 9000000000n;

export function giftAllAmountKeyboard() {
  return new InlineKeyboard()
    .text("۱۰", "adm:giftall:amt:10")
    .text("۲۰", "adm:giftall:amt:20")
    .text("۵۰", "adm:giftall:amt:50")
    .row()
    .text("۱۰۰", "adm:giftall:amt:100")
    .text("۲۰۰", "adm:giftall:amt:200")
    .text("۵۰۰", "adm:giftall:amt:500")
    .row()
    .text("✏️ مقدار دلخواه", "adm:giftall:custom")
    .primary()
    .row()
    .text("❌ انصراف", "adm:giftall:cancel")
    .danger();
}

export function giftAllConfirmKeyboard(amount: number) {
  return new InlineKeyboard()
    .text(
      `✅ ارسال هدیه ${formatNum(amount)} سکه به همه`,
      `adm:giftall:ok:${amount}`,
    )
    .success()
    .row()
    .text("↩️ تغییر مقدار", "adm:giftall")
    .primary()
    .text("❌ انصراف", "adm:giftall:cancel")
    .danger();
}

export async function countGiftRecipients() {
  const [allRegistered, realMessagable] = await Promise.all([
    prisma.user.count({
      where: { registered: true, deletedAt: null },
    }),
    prisma.user.count({
      where: {
        registered: true,
        deletedAt: null,
        telegramId: { lt: FAKE_TG_MIN },
      },
    }),
  ]);
  return { allRegistered, realMessagable };
}

/** پیام زیبای هدیه همگانی */
export function buildGiftAllMessage(amount: number, lang: "fa" | "en" = "fa") {
  if (lang === "en") {
    return [
      "🎁 <b>A special gift from Patogh</b>",
      "",
      "Hey! We wanted to make your day better ✨",
      "",
      `💰 <b>+${formatNum(amount)} coins</b> were added to your balance.`,
      "",
      "Use them for nearby search, likes, gifts, and more chats.",
      "",
      "With love,",
      "Patogh Support 💞",
    ].join("\n");
  }
  return [
    "🎁 <b>هدیه ویژه از طرف دوردوریا</b>",
    "",
    "سلام! دلمون خواست امروز برات یه سورپرایز کوچیک داشته باشیم ✨",
    "",
    `💰 <b>${formatNum(amount)} سکه</b> به موجودی حسابت اضافه شد.`,
    "",
    "با این سکه‌ها می‌تونی نزدیک‌ها رو پیدا کنی، لایک بدی، هدیه بفرستی و بیشتر گپ بزنی.",
    "",
    "خوش بگذره 🌟",
    "با مهر، پشتیبانی دوردوریا 💞",
  ].join("\n");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export type GiftAllResult = {
  credited: number;
  messaged: number;
  failed: number;
  amount: number;
};

/**
 * به همه کاربران ثبت‌نام‌شده سکه می‌دهد و
 * به کاربران واقعی پیام هدیه می‌فرستد (با فاصله برای محدودیت تلگرام).
 */
export async function giftCoinsToAllUsers(
  api: Api,
  amount: number,
  onProgress?: (done: number, total: number) => void | Promise<void>,
): Promise<GiftAllResult> {
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
    throw new Error("invalid_amount");
  }

  // ۱) افزایش موجودی همهٔ ثبت‌نام‌شده‌ها (شامل فیک برای یکنواختی دیتابیس)
  const credit = await prisma.user.updateMany({
    where: { registered: true, deletedAt: null },
    data: { diamonds: { increment: amount } },
  });

  // ۲) پیام فقط به کاربران واقعی
  const recipients = await prisma.user.findMany({
    where: {
      registered: true,
      deletedAt: null,
      telegramId: { lt: FAKE_TG_MIN },
    },
    select: {
      id: true,
      telegramId: true,
      language: true,
      diamonds: true,
    },
  });

  let messaged = 0;
  let failed = 0;
  const total = recipients.length;

  for (let i = 0; i < recipients.length; i++) {
    const u = recipients[i]!;
    const lang = u.language === "en" ? "en" : "fa";
    const text = buildGiftAllMessage(amount, lang);
    try {
      await api.sendMessage(Number(u.telegramId), text, {
        parse_mode: "HTML",
      });
      messaged++;
    } catch {
      failed++;
    }
    if (onProgress && (i % 10 === 9 || i === recipients.length - 1)) {
      await onProgress(i + 1, total);
    }
    // حدود ۲۵ پیام در ثانیه
    await sleep(40);
  }

  return {
    credited: credit.count,
    messaged,
    failed,
    amount,
  };
}
