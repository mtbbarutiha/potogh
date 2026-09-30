import { Composer, InlineKeyboard, type Context } from "grammy";
import type { Message } from "grammy/types";
import { isAdmin } from "../lib/admin.js";
import { findByTelegram, patchUser } from "../db/users.js";
import { langOf, t, type Lang } from "../i18n/index.js";
import { languageReplyKeyboard } from "../keyboards/main.js";
import { logger } from "../lib/logger.js";
import { withTimeout } from "../lib/timeout.js";

const CACHE_TTL_MS = 30_000;
const MEMBER_CHECK_MS = 8_000;
const memberCache = new Map<number, { ok: boolean; at: number }>();
let lastInaccessibleLog = 0;

export type MemberStatus = "member" | "not_member" | "unknown";

/** @username یا لینک کانال */
export function channelUsername(): string {
  const raw = (process.env.FORCE_JOIN_CHANNEL ?? "@Patoghchatbot").trim();
  if (/^https?:\/\//i.test(raw)) {
    const m = raw.match(/t\.me\/([A-Za-z0-9_]+)/i);
    return m ? `@${m[1]}` : "@Patoghchatbot";
  }
  if (/^-?\d+$/.test(raw)) return "@Patoghchatbot";
  return raw.startsWith("@") ? raw : `@${raw}`;
}

/** آیدی عددی کانال — چک عضویت مطمئن‌تر است */
export function channelChatId(): number | string {
  const idRaw = (process.env.FORCE_JOIN_CHAT_ID ?? "").trim();
  if (idRaw && /^-?\d+$/.test(idRaw)) return Number(idRaw);
  return channelUsername();
}

export function joinUrl(): string {
  return `https://t.me/${channelUsername().replace(/^@/, "")}`;
}

export function joinKeyboard(lang: Lang) {
  return new InlineKeyboard()
    .url(lang === "en" ? "📣 Join channel" : "📣 عضویت در کانال", joinUrl())
    .row()
    .text(lang === "en" ? "✅ I've joined" : "✅ عضو شدم", "fj:check");
}

export function forceJoinPrompt(lang: Lang, withForwardHint = false): string {
  const lines =
    lang === "en"
      ? [
          "📣 Before registration, join our channel:",
          joinUrl(),
          "",
          "1) Tap «Join channel»",
          "2) Then tap «I've joined»",
        ]
      : [
          "📣 قبل از ثبت‌نام، عضو کانال شو:",
          joinUrl(),
          "",
          "۱) دکمه «عضویت در کانال» را بزن",
          "۲) بعد «عضو شدم» را بزن",
        ];

  if (withForwardHint) {
    lines.push(
      "",
      ...(lang === "en"
        ? [
            "If check fails: forward any post from the channel here.",
          ]
        : [
            "اگر تأیید نشد: یک پست از کانال را همین‌جا فوروارد کن.",
          ]),
    );
  }
  return lines.join("\n");
}

async function resolveLang(ctx: Context): Promise<Lang> {
  if (!ctx.from) return "fa";
  try {
    return langOf(await findByTelegram(ctx.from.id));
  } catch {
    return "fa";
  }
}

export async function checkChannelMember(
  ctx: Context,
  userId: number,
): Promise<MemberStatus> {
  const cached = memberCache.get(userId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.ok ? "member" : "not_member";
  }

  const refs: Array<string | number> = [channelChatId()];
  const uname = channelUsername();
  if (refs[0] !== uname) refs.push(uname);

  let lastErr = "";
  for (const ref of refs) {
    try {
      const m = await withTimeout(
        ctx.api.getChatMember(ref, userId),
        MEMBER_CHECK_MS,
        `getChatMember:${ref}`,
      );
      const ok = ["creator", "administrator", "member", "restricted"].includes(
        m.status,
      );
      memberCache.set(userId, { ok, at: Date.now() });
      return ok ? "member" : "not_member";
    } catch (err) {
      lastErr =
        err && typeof err === "object" && "description" in err
          ? String((err as { description: unknown }).description)
          : err instanceof Error
            ? err.message
            : String(err);
      if (lastErr.startsWith("TIMEOUT:")) {
        logger.warn("forceJoin.member_timeout", { ref: String(ref), userId });
      }
    }
  }

  if (
    lastErr.includes("member list is inaccessible") ||
    lastErr.includes("CHAT_ADMIN_REQUIRED") ||
    lastErr.includes("not enough rights")
  ) {
    if (Date.now() - lastInaccessibleLog > 60_000) {
      lastInaccessibleLog = Date.now();
      logger.error("forceJoin.bot_not_admin", {
        channel: uname,
        err: lastErr,
      });
    }
    return "unknown";
  }

  logger.error("forceJoin.getChatMember_failed", {
    userId,
    err: lastErr,
  });
  return "unknown";
}

/** آیا پیام فوروارد از کانال اجباری است؟ */
export function isForwardFromRequiredChannel(msg: Message): boolean {
  const expected = channelChatId();
  const expectedNum =
    typeof expected === "number" ? expected : Number(expected);
  const expectedUser = channelUsername().replace(/^@/, "").toLowerCase();

  const anyMsg = msg as Message & {
    forward_from_chat?: { id: number; type?: string; username?: string };
    forward_origin?: {
      type: string;
      chat?: { id: number; username?: string };
    };
    forward_date?: number;
  };

  const legacy = anyMsg.forward_from_chat;
  if (legacy?.type === "channel") {
    if (Number.isFinite(expectedNum) && legacy.id === expectedNum) return true;
    if (legacy.username?.toLowerCase() === expectedUser) return true;
  }

  const origin = anyMsg.forward_origin;
  if (origin?.type === "channel" && origin.chat) {
    if (Number.isFinite(expectedNum) && origin.chat.id === expectedNum) {
      return true;
    }
    if (origin.chat.username?.toLowerCase() === expectedUser) return true;
  }

  return false;
}

function looksLikeForward(msg: Message): boolean {
  const anyMsg = msg as Message & {
    forward_date?: number;
    forward_origin?: unknown;
    forward_from_chat?: unknown;
  };
  return Boolean(
    anyMsg.forward_date || anyMsg.forward_origin || anyMsg.forward_from_chat,
  );
}

export function clearForceJoinCache(userId?: number) {
  if (userId == null) memberCache.clear();
  else memberCache.delete(userId);
}

/** بعد از تأیید عضویت → شروع انتخاب زبان */
export async function continueRegistrationAfterJoin(
  ctx: Context,
  userId: number,
  lang: Lang = "fa",
) {
  await patchUser(userId, { state: "language", registered: false });
  await ctx.reply(
    lang === "en"
      ? `${t("en", "reg_welcome")}`
      : `${t("fa", "reg_welcome")}`,
    { reply_markup: languageReplyKeyboard() },
  );
}

/**
 * گیت ثبت‌نام: اگر عضو نیست، state=force_join و پرامپت بفرست.
 * @returns true اگر می‌تواند ثبت‌نام را ادامه دهد
 */
export async function gateRegistrationJoin(
  ctx: Context,
  user: { id: number; telegramId: bigint | number; language?: string | null },
): Promise<boolean> {
  const telegramId = Number(user.telegramId);
  if (isAdmin(telegramId)) return true;

  const status = await checkChannelMember(ctx, telegramId);
  if (status === "member") return true;

  await patchUser(user.id, { state: "force_join", registered: false });
  const lang = langOf(user);
  await ctx.reply(forceJoinPrompt(lang, status === "unknown"), {
    reply_markup: joinKeyboard(lang),
  });
  return false;
}

export const forceJoinHandler = new Composer();

forceJoinHandler.callbackQuery("fj:check", async (ctx) => {
  const from = ctx.from;
  if (!from) return;

  clearForceJoinCache(from.id);
  const status = await checkChannelMember(ctx, from.id);
  const lang = await resolveLang(ctx);
  const dbUser = await findByTelegram(from.id);

  if (status === "member") {
    await ctx.answerCallbackQuery({
      text:
        lang === "en"
          ? "✅ Membership confirmed"
          : "✅ عضویت تأیید شد",
    });
    try {
      await ctx.deleteMessage();
    } catch {
      /* ignore */
    }
    if (dbUser && !dbUser.registered) {
      await continueRegistrationAfterJoin(ctx, dbUser.id, lang);
    } else if (dbUser?.registered) {
      const { restoreUserSession } = await import("../services/sessionRestore.js");
      await restoreUserSession(ctx, dbUser, { announce: true });
    } else {
      const { ensureUser } = await import("../db/users.js");
      const created = await ensureUser({
        telegramId: from.id,
        ...(from.username ? { username: from.username } : {}),
        ...(from.first_name ? { firstName: from.first_name } : {}),
      });
      await continueRegistrationAfterJoin(ctx, created.id, lang);
    }
    return;
  }

  if (status === "not_member") {
    await ctx.answerCallbackQuery({
      text:
        lang === "en"
          ? "You're not a member yet. Join first."
          : "هنوز عضو نشدی. اول جوین کن.",
      show_alert: true,
    });
    return;
  }

  // unknown — فوروارد را پیشنهاد بده
  await ctx.answerCallbackQuery({
    text:
      lang === "en"
        ? "Auto-check unavailable. Forward a channel post here."
        : "چک خودکار ممکن نیست. یک پست کانال را فوروارد کن.",
    show_alert: true,
  });
  await ctx.reply(
    lang === "en"
      ? "Please forward any post from the channel to this chat to verify."
      : "لطفاً یک پست از کانال را به همین چت فوروارد کن تا عضویت تأیید شود.",
  );
});

/** فوروارد پست کانال در مرحله force_join */
forceJoinHandler.on("message", async (ctx, next) => {
  const from = ctx.from;
  const msg = ctx.message;
  if (!from || !msg) return next();

  const user = await findByTelegram(from.id);
  if (!user || user.registered || user.state !== "force_join") return next();

  if (!isForwardFromRequiredChannel(msg)) {
    // فقط اگر واقعاً فوروارد است ولی از کانال اشتباه
    if (looksLikeForward(msg)) {
      const lang = langOf(user);
      await ctx.reply(
        lang === "en"
          ? "That forward is not from our channel. Forward a post from the Patogh channel."
          : "این فوروارد از کانال دوردوریا نیست. یک پست از کانال را فوروارد کن.",
        { reply_markup: joinKeyboard(lang) },
      );
      return;
    }
    // پیام عادی در force_join → دوباره پرامپت
    const lang = langOf(user);
    await ctx.reply(forceJoinPrompt(lang, true), {
      reply_markup: joinKeyboard(lang),
    });
    return;
  }

  memberCache.set(from.id, { ok: true, at: Date.now() });
  const lang = langOf(user);
  await ctx.reply(
    lang === "en" ? "✅ Membership verified." : "✅ عضویت تأیید شد.",
  );
  await continueRegistrationAfterJoin(ctx, user.id, lang);
});
