import type { Context } from "grammy";

/**
 * chat_id برای Bot API — همان مسیر امن برای رله چت و دایرکت.
 * String از دست رفتن دقت BigInt در Number() جلوگیری می‌کند.
 */
export function telegramChatId(id: bigint | number | string): string {
  return String(id);
}

/** متن خام خطای تلگرام/Grammy برای لاگ و classify */
export function telegramErrorText(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as {
      description?: unknown;
      message?: unknown;
      error?: { description?: unknown };
    };
    // Prefer API `description` when present (Grammy HttpError / nested).
    if (typeof e.description === "string" && e.description.trim()) {
      return e.description;
    }
    if (
      e.error &&
      typeof e.error === "object" &&
      typeof e.error.description === "string" &&
      e.error.description.trim()
    ) {
      return e.error.description;
    }
    if (typeof e.message === "string" && e.message.trim()) return e.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

/** خطاهای بی‌ضرر تلگرام که نباید کل هندلر را بشکنند */
export function isIgnorableTelegramError(err: unknown): boolean {
  const msg = telegramErrorText(err);
  const needles = [
    "query is too old",
    "query ID is invalid",
    "message is not modified",
    "message to edit not found",
    "message to delete not found",
    "bot was blocked by the user",
    "user is deactivated",
    "chat not found",
    "have no rights to send a message",
  ];
  return needles.some((n) => msg.includes(n));
}

/** علت واقعی عدم تحویل پیام ربات به کاربر تلگرام */
export type BotDeliveryBlockReason =
  | "blocked_bot"
  | "never_started"
  | "deactivated"
  | "forbidden"
  | null;

/**
 * فقط وقتی description تلگرام صریحاً می‌گوید کاربر ربات را بلاک کرده، blocked_bot برگردان.
 * خطاهای مبهم 403 / rate-limit / chat action نباید «بلاک ربات» تلقی شوند.
 */
export function classifyBotDeliveryError(err: unknown): BotDeliveryBlockReason {
  const msg = telegramErrorText(err);
  const lower = msg.toLowerCase();
  // Telegram wording (EN): "Forbidden: bot was blocked by the user"
  // Match ONLY this phrase (case-insensitive) — not loose "forbidden"+"blocked".
  if (
    lower.includes("bot was blocked by the user") ||
    lower.includes("bot was blocked by the the user") // rare typo variant
  ) {
    return "blocked_bot";
  }
  if (lower.includes("user is deactivated")) return "deactivated";
  if (lower.includes("chat not found")) return "never_started";
  if (lower.includes("have no rights to send a message")) return "forbidden";
  // Do NOT treat generic "forbidden"+"blocked" as bot-block — too many false positives.
  // Generic 403 Forbidden without explicit block wording → forbidden, not blocked_bot.
  if (lower.includes("403") && lower.includes("forbidden")) return "forbidden";
  if (lower.includes("forbidden")) return "forbidden";
  return null;
}

export function isStaleCallbackError(err: unknown): boolean {
  const msg = telegramErrorText(err);
  return (
    msg.includes("query is too old") || msg.includes("query ID is invalid")
  );
}

/** answerCallbackQuery بدون پرتاب خطای query قدیمی */
export async function safeAnswerCallback(
  ctx: Context,
  params?: Parameters<Context["answerCallbackQuery"]>[0],
): Promise<boolean> {
  try {
    await ctx.answerCallbackQuery(params);
    return true;
  } catch (err) {
    if (isStaleCallbackError(err)) return false;
    throw err;
  }
}
