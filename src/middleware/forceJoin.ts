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

export type ChannelRef = {
  /** @username (خالی اگر فقط id عددی باشد) */
  username: string;
  /** مرجع getChatMember: id عددی یا @username */
  ref: string | number;
  /** لینک عضویت */
  url: string;
};

/** یک ورودی خام (@username / لینک / id عددی) را به ChannelRef تبدیل می‌کند */
function parseChannelEntry(raw: string): ChannelRef | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) {
    const m = s.match(/t\.me\/([A-Za-z0-9_]+)/i);
    if (!m) return null;
    const uname = `@${m[1]}`;
    return { username: uname, ref: uname, url: `https://t.me/${m[1]}` };
  }
  if (/^-?\d+$/.test(s)) {
    // id عددی — بدون username لینک عضویت نداریم
    return { username: "", ref: Number(s), url: "" };
  }
  const uname = s.startsWith("@") ? s : `@${s}`;
  return { username: uname, ref: uname, url: `https://t.me/${uname.slice(1)}` };
}

/**
 * لیست کانال‌های عضویت اجباری. FORCE_JOIN_CHANNEL می‌تواند چند کانال را با
 * کاما / فاصله / خط جدید جدا کند. FORCE_JOIN_CHAT_ID (id عددی) به‌عنوان
 * مرجع مطمئن‌تر برای کانال اول اعمال می‌شود (سازگاری با قبل).
 */
export function forceJoinChannels(): ChannelRef[] {
  const raw = (process.env.FORCE_JOIN_CHANNEL ?? "").trim();
  if (!raw) return [];
  const list = raw
    .split(/[,\n\s]+/)
    .map(parseChannelEntry)
    .filter((c): c is ChannelRef => c != null);

  const idRaw = (process.env.FORCE_JOIN_CHAT_ID ?? "").trim();
  if (list.length && idRaw && /^-?\d+$/.test(idRaw)) {
    list[0] = { ...list[0]!, ref: Number(idRaw) };
  }
  return list;
}

/**
 * آیا عضویت اجباری فعال است؟ اگر FORCE_JOIN_CHANNEL تنظیم نشده باشد،
 * گیت غیرفعال است تا کاربران بدون کانال گیر نکنند.
 */
export function forceJoinEnabled(): boolean {
  return forceJoinChannels().length > 0;
}

/** @username کانال اول — برای پیام‌های تک‌کاناله/لاگ */
export function channelUsername(): string {
  return forceJoinChannels()[0]?.username ?? "";
}

/** مرجع کانال اول */
export function channelChatId(): number | string {
  return forceJoinChannels()[0]?.ref ?? "";
}

export function joinUrl(): string {
  return forceJoinChannels()[0]?.url ?? "";
}

export function joinKeyboard(lang: Lang) {
  const kb = new InlineKeyboard();
  const channels = forceJoinChannels();
  channels.forEach((c, i) => {
    if (!c.url) return;
    const label =
      channels.length > 1
        ? lang === "en"
          ? `📣 Join channel ${i + 1}`
          : `📣 عضویت در کانال ${i + 1}`
        : lang === "en"
          ? "📣 Join channel"
          : "📣 عضویت در کانال";
    kb.url(label, c.url).row();
  });
  kb.text(lang === "en" ? "✅ I've joined" : "✅ عضو شدم", "fj:check");
  return kb;
}

export function forceJoinPrompt(lang: Lang, withForwardHint = false): string {
  const channels = forceJoinChannels();
  const urls = channels.map((c) => c.url).filter(Boolean);
  const lines =
    lang === "en"
      ? [
          channels.length > 1
            ? "📣 Before registration, join our channels:"
            : "📣 Before registration, join our channel:",
          ...urls,
          "",
          "1) Tap the «Join channel» button(s)",
          "2) Then tap «I've joined»",
        ]
      : [
          channels.length > 1
            ? "📣 قبل از ثبت‌نام، عضو کانال‌ها شو:"
            : "📣 قبل از ثبت‌نام، عضو کانال شو:",
          ...urls,
          "",
          "۱) دکمه‌های «عضویت در کانال» را بزن",
          "۲) بعد «عضو شدم» را بزن",
        ];

  if (withForwardHint) {
    lines.push(
      "",
      ...(lang === "en"
        ? [
            "If check fails: forward any post from a channel here.",
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

/** وضعیت عضویت در یک کانال مشخص */
async function checkOneChannel(
  ctx: Context,
  channel: ChannelRef,
  userId: number,
): Promise<MemberStatus> {
  // برای هر کانال هم id عددی و هم @username را امتحان کن
  const refs: Array<string | number> = [channel.ref];
  if (channel.username && channel.username !== channel.ref) {
    refs.push(channel.username);
  }

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
        channel: channel.username || String(channel.ref),
        err: lastErr,
      });
    }
    return "unknown";
  }

  logger.error("forceJoin.getChatMember_failed", { userId, err: lastErr });
  return "unknown";
}

/**
 * وضعیت کلی: کاربر باید عضو **همه** کانال‌ها باشد.
 * - not_member اگر در حداقل یک کانال قطعاً عضو نیست
 * - unknown اگر عضو نبودن قطعی نیست ولی وضعیت بعضی کانال‌ها نامشخص است
 * - member فقط اگر عضو همه‌ی کانال‌ها باشد
 */
export async function checkChannelMember(
  ctx: Context,
  userId: number,
): Promise<MemberStatus> {
  const channels = forceJoinChannels();
  if (!channels.length) return "member";

  const cached = memberCache.get(userId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.ok ? "member" : "not_member";
  }

  let sawMember = false;
  let sawUnknown = false;
  for (const channel of channels) {
    const status = await checkOneChannel(ctx, channel, userId);
    // در کانال قابل‌بررسی عضو نیست → قطعاً بلاک
    if (status === "not_member") {
      memberCache.set(userId, { ok: false, at: Date.now() });
      return "not_member";
    }
    if (status === "member") sawMember = true;
    if (status === "unknown") sawUnknown = true;
  }

  // عضو همه‌ی کانال‌های قابل‌بررسی است (کانال‌هایی که ربات ادمین‌شان نیست
  // قابل‌کنترل نیستند و نباید کاربر را گیر بیندازند)
  if (sawMember) {
    memberCache.set(userId, { ok: true, at: Date.now() });
    return "member";
  }

  // هیچ کانالی قابل‌بررسی نبود
  return sawUnknown ? "unknown" : "member";
}

/** آیا پیام فوروارد از یکی از کانال‌های اجباری است؟ */
export function isForwardFromRequiredChannel(msg: Message): boolean {
  const channels = forceJoinChannels();
  const expectedNums = channels
    .map((c) => (typeof c.ref === "number" ? c.ref : Number(c.ref)))
    .filter((n) => Number.isFinite(n));
  const expectedUsers = channels
    .map((c) => c.username.replace(/^@/, "").toLowerCase())
    .filter(Boolean);

  const anyMsg = msg as Message & {
    forward_from_chat?: { id: number; type?: string; username?: string };
    forward_origin?: {
      type: string;
      chat?: { id: number; username?: string };
    };
    forward_date?: number;
  };

  const matches = (id?: number, username?: string): boolean => {
    if (id != null && expectedNums.includes(id)) return true;
    if (username && expectedUsers.includes(username.toLowerCase())) return true;
    return false;
  };

  const legacy = anyMsg.forward_from_chat;
  if (legacy?.type === "channel" && matches(legacy.id, legacy.username)) {
    return true;
  }

  const origin = anyMsg.forward_origin;
  if (origin?.type === "channel" && origin.chat) {
    if (matches(origin.chat.id, origin.chat.username)) return true;
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
  if (!forceJoinEnabled()) return true;

  const status = await checkChannelMember(ctx, telegramId);
  if (status === "member") return true;

  await patchUser(user.id, { state: "force_join", registered: false });
  const lang = langOf(user);
  try {
    await ctx.reply(forceJoinPrompt(lang, status === "unknown"), {
      reply_markup: joinKeyboard(lang),
    });
  } catch {
    // کاربر ربات را بلاک کرده یا هنوز conversation شروع نکرده (403) — خطای واقعی نیست
  }
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
          : "این فوروارد از کانال پاتوق نیست. یک پست از کانال را فوروارد کن.",
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
