import type { Context } from "grammy";
import type { MessageEntity } from "grammy/types";
import { normalizeLang, tr, type Lang } from "../i18n/index.js";

export type ContactBlockReason = "phone" | "telegram" | "link" | "contact_card";

/** ارقام فارسی/عربی → لاتین */
export function normalizeDigits(text: string): string {
  return text.replace(/[۰-۹٠-٩]/g, (ch) => {
    const fa = "۰۱۲۳۴۵۶۷۸۹".indexOf(ch);
    if (fa >= 0) return String(fa);
    const ar = "٠١٢٣٤٥٦٧٨٩".indexOf(ch);
    return ar >= 0 ? String(ar) : ch;
  });
}

function stripInvisible(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u00AD]/g, "");
}

/** فاصله و جداکننده بین ارقام را برای تشخیص شماره فشرده می‌کند */
function compactDigitRuns(text: string): string {
  // مثلاً 0 9 1 2 3 4 5 6 7 8 9 یا 0912-345-6789
  return text.replace(
    /(?:\d[\s\-_.‏‌]*){8,}\d/g,
    (run) => run.replace(/[^\d]/g, ""),
  );
}

function hasTelegramLink(text: string): boolean {
  return /(?:https?:\/\/)?(?:t\.me|telegram\.me|telegram\.dog)\/[A-Za-z0-9_+/]+/i.test(
    text,
  );
}

function hasTelegramUsername(text: string): boolean {
  // @username — حداقل ۵ کاراکتر طبق محدودیت تلگرام
  if (/(^|[^A-Za-z0-9_])@[A-Za-z][A-Za-z0-9_]{4,31}\b/.test(text)) {
    return true;
  }
  // یوزرنیم بدون @ بعد از کلمه‌های رایج
  if (
    /(?:یوزرنیم|یوزر\s*نیم|آیدی|ایدی|آی\s*دی|ای\s*دی|username|user\s*name|telegram|تلگرام|آیدی\s*من|id\s*me)\s*[:：=\-]?\s*@?[A-Za-z][A-Za-z0-9_]{4,31}\b/i.test(
      text,
    )
  ) {
    return true;
  }
  return false;
}

function hasPhoneNumber(text: string): boolean {
  const n = compactDigitRuns(normalizeDigits(stripInvisible(text)));

  // موبایل ایران: 09xxxxxxxxx / +989... / 00989... / 989...
  if (
    /(?:^|[^\d])(?:(?:\+|00)?98|0)?9\d{9}(?!\d)/.test(n) ||
    /(?:^|[^\d])09\d{9}(?!\d)/.test(n)
  ) {
    return true;
  }

  // بین‌المللی با + و حداقل ۸ رقم بعد از کد کشور
  if (/(?:^|[^\d])\+\d{8,15}(?!\d)/.test(n)) {
    return true;
  }

  // عبارت «شماره …» نزدیک به رقم
  if (
    /(?:شماره|موبایل|تلفن|واتس?\s*اپ|whats?\s*app|phone|mobile|number)\s*[:：=\-]?\s*[\d+\s\-_.]{8,}/i.test(
      n,
    )
  ) {
    return true;
  }

  return false;
}

function hasTelegramNumericId(text: string): boolean {
  const n = compactDigitRuns(normalizeDigits(stripInvisible(text)));

  // آیدی عددی کنار واژهٔ آیدی / تلگرام
  if (
    /(?:آیدی|ایدی|آی\s*دی|ای\s*دی|تلگرام|telegram|tg\s*id|user\s*id|chat\s*id)\s*[:：=\-]?\s*\d{8,12}\b/i.test(
      n,
    )
  ) {
    return true;
  }

  // کل پیام فقط یک عدد ۸–۱۲ رقمی
  if (/^\s*\d{8,12}\s*$/.test(n)) return true;

  // عدد ۹–۱۲ رقمی جدا در متن (آیدی تلگرام / شماره بدون قالب)
  if (/(?:^|[^\d])\d{9,12}(?!\d)/.test(n)) return true;

  return false;
}

function reasonFromEntities(
  text: string,
  entities?: MessageEntity[],
): ContactBlockReason | null {
  if (!entities?.length) return null;
  for (const e of entities) {
    if (e.type === "phone_number") return "phone";
    if (e.type === "mention") return "telegram";
    if (e.type === "text_mention") return "telegram";
    if (e.type === "url" || e.type === "text_link") {
      const slice =
        e.type === "url"
          ? text.slice(e.offset, e.offset + e.length)
          : e.type === "text_link"
            ? e.url
            : "";
      if (/t\.me|telegram\.(?:me|dog)/i.test(slice)) return "link";
      if (/^https?:\/\//i.test(slice) && /telegram/i.test(slice)) return "link";
    }
  }
  return null;
}

/**
 * آیا متن شامل شماره موبایل یا آیدی/یوزرنیم تلگرام است؟
 */
export function findForbiddenContact(
  text: string,
  entities?: MessageEntity[],
): ContactBlockReason | null {
  if (!text?.trim()) return null;

  const fromEntity = reasonFromEntities(text, entities);
  if (fromEntity) return fromEntity;

  const cleaned = stripInvisible(text);
  const normalized = normalizeDigits(cleaned);

  if (hasTelegramLink(normalized)) return "link";
  if (hasTelegramUsername(normalized)) return "telegram";
  if (hasPhoneNumber(normalized)) return "phone";
  if (hasTelegramNumericId(normalized)) return "telegram";

  return null;
}

export function forbiddenContactMessage(
  lang: Lang | string | null = "fa",
  reason?: ContactBlockReason | null,
): string {
  const L = normalizeLang(lang);
  if (reason === "contact_card") {
    return tr(
      L,
      "🚫 ارسال کارت مخاطب / شماره تلفن مجاز نیست.",
      "🚫 Sharing contact cards / phone numbers is not allowed.",
    );
  }
  return tr(
    L,
    [
      "🚫 ارسال شماره موبایل یا آیدی تلگرام مجاز نیست.",
      "",
      "لطفاً بدون شماره، @یوزرنیم، لینک t.me یا آیدی عددی پیام بفرست.",
    ].join("\n"),
    [
      "🚫 Phone numbers and Telegram IDs are not allowed.",
      "",
      "Please send your message without phone numbers, @usernames, t.me links, or numeric IDs.",
    ].join("\n"),
  );
}

/** اگر متن ممنوع باشد، پیام هشدار می‌فرستد و true برمی‌گرداند */
export async function rejectForbiddenContact(
  ctx: Context,
  text: string,
  lang: Lang | string | null = "fa",
  entities?: MessageEntity[],
): Promise<boolean> {
  const reason = findForbiddenContact(text, entities);
  if (!reason) return false;
  await ctx.reply(forbiddenContactMessage(lang, reason));
  return true;
}
