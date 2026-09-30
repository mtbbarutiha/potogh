import { Bot } from "grammy";
import { sequentialize } from "@grammyjs/runner";
import type { Context } from "grammy";
import { startHandler, registerHandler } from "./handlers/start.js";
import { commandsHandler } from "./handlers/commands.js";
import { menuHandler } from "./handlers/menu.js";
import { featuresHandler } from "./handlers/features.js";
import { profileHandler } from "./handlers/profile.js";
import { adminHandler } from "./handlers/admin.js";
import { adminVouchersHandler } from "./handlers/adminVouchers.js";
import { chatHandler } from "./handlers/chat.js";
import { inlineHandler } from "./handlers/inline.js";
import { paymentsHandler } from "./handlers/payments.js";
import { fallbackHandler } from "./handlers/fallback.js";
import { forceJoinHandler } from "./middleware/forceJoin.js";
import { sessionRestoreMiddleware } from "./middleware/sessionRestore.js";
import { rateLimitMiddleware } from "./middleware/rateLimit.js";
import {
  isIgnorableTelegramError,
  isStaleCallbackError,
} from "./lib/telegramSafe.js";
import {
  logUpdateEnd,
  logUpdateStart,
  logger,
} from "./lib/logger.js";
import {
  markPollEnd,
  markPollHardTimeout,
  markPollStart,
} from "./lib/pollWatch.js";

/** سقف اجرای هر آپدیت — اگر بیشتر طول بکشد، قفل sequentialize آزاد می‌شود */
const HANDLER_TIMEOUT_MS = 12_000;
/** APIهای غیر از getUpdates کندتر از این لاگ warn می‌گیرند */
const API_SLOW_MS = 2_000;
/**
 * سقف سخت getUpdates — حتی اگر node-fetch/Abort گیر کند،
 * Promise.race بعد از این زمان خطا می‌دهد تا runner ری‌استارت شود.
 * باید از long-poll (۲۰s) بیشتر و از timeoutSeconds کمتر/حدود آن باشد.
 */
const GETUPDATES_HARD_MS = 28_000;
/** timeout کلاینت grammY (باید > long-poll و ≈ hard timeout) */
const CLIENT_TIMEOUT_SEC = 32;

function getSessionKey(ctx: Context) {
  const chat = ctx.chat?.id;
  if (chat != null) return `c:${chat}`;
  const from = ctx.from?.id;
  if (from != null) return `u:${from}`;
  return undefined;
}

function withHandlerTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`HANDLER_TIMEOUT:${ms}ms`)),
      ms,
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function errText(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const nested =
    err && typeof err === "object" && "error" in err
      ? (err as { error?: unknown }).error
      : undefined;
  const nestedMsg =
    nested instanceof Error
      ? nested.message
      : nested && typeof nested === "object" && nested !== null && "code" in nested
        ? String((nested as { code: unknown }).code)
        : "";
  return nestedMsg ? `${err.message} (${nestedMsg})` : err.message;
}

function retryAfterMs(err: unknown): number | null {
  if (err && typeof err === "object") {
    const e = err as { error_code?: number; parameters?: { retry_after?: number } };
    if (e.error_code === 429 && e.parameters?.retry_after != null) {
      return (e.parameters.retry_after + 1) * 1000;
    }
  }
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/retry after (\d+)/i);
  if (m) return (Number(m[1]) + 1) * 1000;
  return null;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/** fetch بومی Node — AbortSignal را بهتر از node-fetch رعایت می‌کند */
async function nativeFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const url = String(input);
  if (url.includes("/getUpdates")) {
    const hard = AbortSignal.timeout(GETUPDATES_HARD_MS);
    const parent = init?.signal;
    const signal =
      parent && typeof AbortSignal.any === "function"
        ? AbortSignal.any([parent, hard])
        : hard;
    return globalThis.fetch(input, { ...init, signal });
  }
  return globalThis.fetch(input, init);
}

function installApiDebug(bot: Bot) {
  bot.api.config.use(async (prev, method, payload, signal) => {
    const t0 = Date.now();

    if (method === "getUpdates") {
      markPollStart();
      const local = new AbortController();
      const onParentAbort = () => {
        try {
          local.abort();
        } catch {
          /* ignore */
        }
      };
      if (signal) {
        if (signal.aborted) onParentAbort();
        else signal.addEventListener("abort", onParentAbort, { once: true });
      }
      let hardTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          prev(method, payload, local.signal as unknown as typeof signal),
          new Promise<never>((_, reject) => {
            hardTimer = setTimeout(() => {
              try {
                local.abort();
              } catch {
                /* ignore */
              }
              markPollHardTimeout();
              reject(
                new Error(`GETUPDATES_HARD_TIMEOUT:${GETUPDATES_HARD_MS}ms`),
              );
            }, GETUPDATES_HARD_MS);
          }),
        ]);
        markPollEnd(true, { ms: Date.now() - t0 });
        return result;
      } catch (err) {
        const ms = Date.now() - t0;
        const msg = errText(err);
        // اگر hard timeout قبلاً mark کرده، دوباره نزن
        if (!msg.includes("GETUPDATES_HARD_TIMEOUT")) {
          markPollEnd(false, { ms, err: msg });
        }
        logger.error("api.getUpdates_fail", { ms, err: msg });
        throw err;
      } finally {
        if (hardTimer) clearTimeout(hardTimer);
        if (signal) signal.removeEventListener("abort", onParentAbort);
      }
    }

    try {
      let lastErr: unknown;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const result = await prev(method, payload, signal);
          const ms = Date.now() - t0;
          if (ms >= API_SLOW_MS) {
            logger.warn("api.slow", {
              method,
              ms,
              keys:
                payload && typeof payload === "object"
                  ? Object.keys(payload as object).slice(0, 8)
                  : [],
            });
          }
          return result;
        } catch (err) {
          lastErr = err;
          const wait = retryAfterMs(err);
          if (wait != null && attempt < 3) {
            logger.warn("api.rate_limit", {
              method,
              attempt: attempt + 1,
              waitMs: wait,
            });
            await sleep(wait);
            continue;
          }
          throw err;
        }
      }
      throw lastErr;
    } catch (err) {
      const ms = Date.now() - t0;
      logger.error("api.call_fail", { method, ms, err: errText(err) });
      throw err;
    }
  });
}

export function createBot(token: string) {
  const bot = new Bot(token, {
    client: {
      // native fetch + abort واقعی (جلوی سوکت مرده‌ی ۸ دقیقه‌ای)
      fetch: nativeFetch,
      // باید از long-poll getUpdates بیشتر باشد
      timeoutSeconds: CLIENT_TIMEOUT_SEC,
      canUseWebhookReply: () => false,
    },
  });

  installApiDebug(bot);
  logger.info("api.client_config", {
    timeoutSeconds: CLIENT_TIMEOUT_SEC,
    getUpdatesHardMs: GETUPDATES_HARD_MS,
    fetch: "native",
  });

  // ۱) ترتیبی‌سازی per-chat
  bot.use(sequentialize(getSessionKey));

  // Rate limit قبل از handlerهای سنگین — ضد فلاد تبلیغات
  bot.use(rateLimitMiddleware);

  // ۲) لاگ بیرونی — حتی اگر timeout بزند، update.done/fail ثبت می‌شود و inflight پاک می‌شود
  bot.use(async (ctx, next) => {
    const kind = ctx.callbackQuery
      ? "callback"
      : ctx.inlineQuery
        ? "inline"
        : ctx.message
          ? "message"
          : "update";
    const hint = ctx.callbackQuery?.data
      ? ctx.callbackQuery.data.slice(0, 40)
      : ctx.inlineQuery
        ? `q=${(ctx.inlineQuery.query ?? "").slice(0, 40)}`
        : ctx.message && "text" in ctx.message && ctx.message.text
          ? ctx.message.text.slice(0, 40)
          : "";
    const sessionKey = getSessionKey(ctx);
    const trackKey = logUpdateStart({
      updateId: ctx.update.update_id,
      kind,
      from: String(ctx.from?.id ?? "-"),
      ...(ctx.chat?.id != null ? { chat: String(ctx.chat.id) } : {}),
      ...(sessionKey ? { sessionKey } : {}),
      ...(hint ? { hint } : {}),
    });
    try {
      await next();
      logUpdateEnd(trackKey, "ok");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.startsWith("HANDLER_TIMEOUT");
      logUpdateEnd(trackKey, isTimeout ? "timeout" : "fail", {
        err: msg,
        stack:
          err instanceof Error
            ? err.stack?.split("\n").slice(0, 5).join(" | ")
            : undefined,
      });
      if (isTimeout) {
        try {
          if (ctx.callbackQuery) {
            await ctx.answerCallbackQuery({
              text: "⏱️ کمی طول کشید — دوباره بزن",
            });
          } else if (ctx.message) {
            await ctx.reply("⏱️ پاسخ دیر شد. لطفاً دوباره همان دکمه را بزن.");
          }
        } catch (replyErr) {
          logger.warn("timeout.user_notify_fail", {
            err:
              replyErr instanceof Error ? replyErr.message : String(replyErr),
          });
        }
        return;
      }
      if (isIgnorableTelegramError(err)) {
        logger.debug("handler.ignorable", { err: msg, kind, from: ctx.from?.id });
        return;
      }
      try {
        if (ctx.callbackQuery) {
          await ctx.answerCallbackQuery({
            text: "خطا — دوباره امتحان کن",
            show_alert: false,
          });
        } else if (ctx.message) {
          await ctx.reply("⚠️ یک خطا رخ داد. دوباره /start یا منو را بزن.");
        }
      } catch {
        /* ignore */
      }
    }
  });

  // ۳) سقف زمان داخل لاگ — تا end حتماً ثبت شود
  bot.use(async (ctx, next) => {
    await withHandlerTimeout(Promise.resolve(next()), HANDLER_TIMEOUT_MS);
  });

  // پاسخ امن به callback + ack سریع (جلوگیری از اسپینر هنگ تلگرام)
  bot.use(async (ctx, next) => {
    if (!ctx.callbackQuery) {
      await next();
      return;
    }
    let answered = false;
    const original = ctx.answerCallbackQuery.bind(ctx);
    ctx.answerCallbackQuery = (async (params?: unknown) => {
      if (answered) return true;
      answered = true;
      try {
        return await original(params as never);
      } catch (err) {
        if (isStaleCallbackError(err)) return true;
        // اگر auto-ack زده و handler دوباره می‌زند — نادیده بگیر
        const msg = err instanceof Error ? err.message : String(err);
        if (/query is too old|already answered|QUERY_ID_INVALID/i.test(msg)) {
          return true;
        }
        throw err;
      }
    }) as typeof ctx.answerCallbackQuery;

    // اگر handler تا ۳۵۰ms جواب نداد، اسپینر را ببند (کار سنگین ادامه می‌یابد)
    const autoAck = setTimeout(() => {
      if (!answered) {
        void ctx.answerCallbackQuery().catch(() => undefined);
      }
    }, 350);

    try {
      await next();
    } finally {
      clearTimeout(autoAck);
      if (!answered) {
        await ctx.answerCallbackQuery().catch(() => undefined);
      }
    }
  });

  // inline قبل از sessionRestore — بدون DB touch، پاسخ سریع
  bot.use(inlineHandler);

  bot.use(sessionRestoreMiddleware);
  bot.use(forceJoinHandler);

  bot.use(paymentsHandler);
  bot.use(startHandler);
  bot.use(adminVouchersHandler);
  bot.use(adminHandler);
  bot.use(commandsHandler);
  bot.use(registerHandler);
  bot.use(profileHandler);
  bot.use(featuresHandler);
  bot.use(menuHandler);
  bot.use(chatHandler);
  bot.use(fallbackHandler);

  bot.catch((err) => {
    const e = err.error;
    if (isIgnorableTelegramError(e)) {
      logger.warn("bot.ignorable", {
        err: e instanceof Error ? e.message : String(e),
      });
      return;
    }
    logger.error("bot.catch", {
      err: e instanceof Error ? e.message : String(e),
      stack:
        e instanceof Error
          ? e.stack?.split("\n").slice(0, 6).join(" | ")
          : undefined,
    });
  });

  return bot;
}
