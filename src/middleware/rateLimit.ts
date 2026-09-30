import type { Context, NextFunction } from "grammy";
import { logger } from "../lib/logger.js";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Periodic cleanup so the map does not grow without bound */
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}, 60_000).unref?.();

/**
 * Simple in-memory sliding window limiter.
 * @returns true if allowed
 */
export function allowRate(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const cur = buckets.get(key);
  if (!cur || cur.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (cur.count >= limit) return false;
  cur.count += 1;
  return true;
}

/** Per-user limits for chat flood and expensive coin actions */
export function checkUserRate(
  telegramId: number,
  kind: "chat" | "coin_action" | "callback",
): boolean {
  if (kind === "chat") return allowRate(`chat:${telegramId}`, 25, 10_000);
  if (kind === "coin_action") return allowRate(`coin:${telegramId}`, 8, 10_000);
  return allowRate(`cb:${telegramId}`, 40, 10_000);
}

/** Middleware: soft throttle callbacks / messages to reduce flood under ads */
export async function rateLimitMiddleware(ctx: Context, next: NextFunction) {
  const uid = ctx.from?.id;
  if (uid == null) {
    await next();
    return;
  }

  const kind = ctx.callbackQuery
    ? "callback"
    : ctx.message
      ? "chat"
      : null;

  if (kind && !checkUserRate(uid, kind)) {
    logger.warn("rate.limit", { uid, kind });
    if (ctx.callbackQuery) {
      await ctx
        .answerCallbackQuery({
          text: "⏳ کمی آهسته‌تر — چند ثانیه صبر کن",
          show_alert: false,
        })
        .catch(() => undefined);
      return;
    }
    if (ctx.chat?.type === "private") {
      await ctx
        .reply("⏳ پیام‌ها خیلی سریع پشت‌سرهم بودند. چند ثانیه صبر کن.")
        .catch(() => undefined);
      return;
    }
    return;
  }

  await next();
}
