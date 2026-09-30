import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import type { InputMediaPhoto } from "grammy/types";
import { normalizeLang, type Lang } from "../i18n/index.js";
import { formatNum } from "../data/packages.js";
import { albumPhotoWithNameLabel } from "../lib/faceBadgePhoto.js";

/** ۲ نفر در هر آلبوم — مناسب اسلاید کشویی تلگرام */
export const PAGE_SIZE = 2;

export type PagedUser = {
  id: number;
  userCode: string;
  displayName: string | null;
  age: number | null;
  city?: string | null;
  province?: string | null;
  lastActiveAt?: Date | null;
  faceVerified?: boolean;
  likesCount?: number;
  gender?: string | null;
  photoFileId?: string | null;
  photoStatus?: string | null;
  faceStatus?: string | null;
  /** مثلاً فاصله */
  extra?: string | null;
  removeData?: string;
};

/** پیام‌های صفحه قبل برای پاک‌کردن هنگام ورق زدن */
const listSessions = new Map<
  string,
  { chatId: number; messageIds: number[] }
>();

function sessionKey(chatId: number, scope: string) {
  return `${chatId}:${scope}`;
}

async function clearListSession(ctx: Context, scope: string) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const key = sessionKey(chatId, scope);
  const prev = listSessions.get(key);
  if (!prev) return;
  for (const mid of prev.messageIds) {
    await ctx.api.deleteMessage(prev.chatId, mid).catch(() => undefined);
  }
  listSessions.delete(key);
}

export async function clearPagedListSession(ctx: Context, scope: string) {
  await clearListSession(ctx, scope);
}

function rememberMessages(
  chatId: number,
  scope: string,
  messageIds: number[],
) {
  listSessions.set(sessionKey(chatId, scope), { chatId, messageIds });
}

function isOnline(lastActiveAt?: Date | null): boolean {
  if (!lastActiveAt) return false;
  return Date.now() - lastActiveAt.getTime() <= 15 * 60_000;
}

function shortName(name: string | null, lang: Lang): string {
  const n = (name ?? (lang === "en" ? "User" : "کاربر")).trim();
  return n.length > 16 ? `${n.slice(0, 15)}…` : n;
}

/** کپشن گروه آلبوم (تلگرام فقط کپشن اول را نشان می‌دهد) */
function albumGroupCaption(
  slice: PagedUser[],
  page: number,
  total: number,
  title: string,
  lang: Lang,
): string {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const lines = slice.map((u, i) => {
    const n = page * PAGE_SIZE + i + 1;
    const online = isOnline(u.lastActiveAt) ? "🟢" : "⚪";
    const name = (u.displayName ?? (lang === "en" ? "User" : "کاربر")).trim();
    const age = u.age != null ? ` · ${u.age}` : "";
    return `${online} ${formatNum(n)}. ${name}${age}`;
  });
  if (lang === "en") {
    return [
      title,
      `Album ${formatNum(page + 1)} / ${formatNum(pages)}`,
      "",
      ...lines,
      "",
      "Swipe the album · tap a name below.",
    ].join("\n");
  }
  return [
    title,
    `آلبوم ${formatNum(page + 1)} از ${formatNum(pages)}`,
    "",
    ...lines,
    "",
    "آلبوم را بکش · روی اسم بزن تا پروفایل باز شود.",
  ].join("\n");
}

/** دکمه‌های اسم زیر آلبوم + صفحه‌بندی */
function namesAndNavKeyboard(
  slice: PagedUser[],
  page: number,
  total: number,
  scope: string,
  lang: Lang,
): InlineKeyboard {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const p = Math.min(Math.max(0, page), pages - 1);
  const kb = new InlineKeyboard();

  for (let i = 0; i < slice.length; i++) {
    const u = slice[i]!;
    const n = p * PAGE_SIZE + i + 1;
    const label = `${formatNum(n)}. ${shortName(u.displayName, lang)}${u.age != null ? ` · ${u.age}` : ""}`;
    kb.text(label, `open:${u.userCode}`);
    if (u.removeData) {
      kb.text("❌", u.removeData);
    }
    kb.row();
  }

  if (pages > 1) {
    const prev = p > 0 ? p - 1 : pages - 1;
    const next = p < pages - 1 ? p + 1 : 0;
    kb.text(lang === "en" ? "◀️ Prev" : "◀️ قبلی", `upage:${scope}:${prev}`)
      .text(`${formatNum(p + 1)} / ${formatNum(pages)}`, `upage:${scope}:${p}`)
      .text(lang === "en" ? "Next ▶️" : "بعدی ▶️", `upage:${scope}:${next}`)
      .row();
  }

  return kb;
}

function pickerText(
  title: string,
  page: number,
  total: number,
  lang: Lang,
): string {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const p = Math.min(Math.max(0, page), pages - 1);
  if (lang === "en") {
    return [
      title,
      `Album ${formatNum(p + 1)} / ${formatNum(pages)} · ${formatNum(total)} people`,
      "Swipe photos · tap a name below to open profile.",
    ].join("\n");
  }
  return [
    title,
    `آلبوم ${formatNum(p + 1)} از ${formatNum(pages)} · ${formatNum(total)} نفر`,
    "آلبوم را بکش · روی اسم بزن تا پروفایل باز شود.",
  ].join("\n");
}

/**
 * آلبوم ۲تایی کشویی — اسم روی خود عکس + دکمه‌های اسم زیر آلبوم
 */
export async function sendPagedUserList(
  ctx: Context,
  users: PagedUser[],
  opts: {
    title: string;
    /** شناسه پایدار برای صفحه‌بندی: c | n | s:province | a:default | t:token */
    scope: string;
    page?: number;
    lang?: Lang | string | null;
    /** ورق زدن / رفرش — پیام‌های صفحه قبل پاک می‌شوند */
    edit?: boolean;
    footerText?: string;
    footerKeyboard?: InlineKeyboard;
  },
) {
  if (!users.length) return;
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const lang = normalizeLang(opts.lang);
  const total = users.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(0, opts.page ?? 0), pages - 1);
  const slice = users.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  if (opts.edit) {
    await clearListSession(ctx, opts.scope);
    if (ctx.callbackQuery?.message) {
      await ctx.deleteMessage().catch(() => undefined);
    }
  }

  const messageIds: number[] = [];
  const groupCaption = albumGroupCaption(
    slice,
    page,
    total,
    opts.title,
    lang,
  );

  const prepared = await Promise.all(
    slice.map(async (u, i) => {
      const index = page * PAGE_SIZE + i + 1;
      try {
        const file = await albumPhotoWithNameLabel(
          ctx.api,
          {
            ...(u.gender != null ? { gender: u.gender } : {}),
            ...(u.photoFileId != null ? { photoFileId: u.photoFileId } : {}),
            ...(u.photoStatus != null ? { photoStatus: u.photoStatus } : {}),
            ...(u.faceVerified != null ? { faceVerified: u.faceVerified } : {}),
            displayName: u.displayName,
            age: u.age,
          },
          { size: 480, index },
        );
        const item: InputMediaPhoto = {
          type: "photo",
          media: file,
        };
        if (i === 0) item.caption = groupCaption;
        return item;
      } catch (err) {
        console.error(
          "[pagedList] prepare failed:",
          u.id,
          err instanceof Error ? err.message : err,
        );
        return null;
      }
    }),
  );
  const media = prepared.filter((m): m is NonNullable<typeof m> => m != null);

  if (media.length >= 2) {
    try {
      const album = await ctx.replyWithMediaGroup(media);
      for (const m of album) messageIds.push(m.message_id);
    } catch (err) {
      console.error(
        "[pagedList] mediaGroup failed:",
        err instanceof Error ? err.message : err,
      );
      for (let i = 0; i < media.length; i++) {
        const item = media[i]!;
        try {
          const msg =
            i === 0
              ? await ctx.replyWithPhoto(item.media, { caption: groupCaption })
              : await ctx.replyWithPhoto(item.media);
          messageIds.push(msg.message_id);
        } catch {
          /* skip */
        }
      }
    }
  } else if (media.length === 1) {
    const only = media[0]!;
    const msg = await ctx.replyWithPhoto(only.media, {
      caption: groupCaption,
    });
    messageIds.push(msg.message_id);
  } else {
    const msg = await ctx.reply(groupCaption);
    messageIds.push(msg.message_id);
  }

  const picker = await ctx.reply(pickerText(opts.title, page, total, lang), {
    reply_markup: namesAndNavKeyboard(slice, page, total, opts.scope, lang),
  });
  messageIds.push(picker.message_id);
  rememberMessages(chatId, opts.scope, messageIds);

  if (opts.footerText && !opts.edit) {
    if (opts.footerKeyboard) {
      await ctx.reply(opts.footerText, { reply_markup: opts.footerKeyboard });
    } else {
      await ctx.reply(opts.footerText);
    }
  }
}
