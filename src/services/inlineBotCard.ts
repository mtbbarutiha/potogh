/**
 * Inline result when someone types @Patoghchatbot (empty / intro query):
 * sends a full bot card (photo + description + link) into the chat.
 */
import type { Api, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import type { InlineQueryResult } from "grammy/types";
import { findByTelegram } from "../db/users.js";
import {
  getBotProfilePhotoFileId,
  clearBotPhotoCache,
} from "./botShare.js";

const SHORT_FA =
  "شبکه گفت‌وگو: چت خصوصی، کاربران نزدیک، پیام و ویس";
const DESC_FA = [
  "دوردوریا — شبکه گفت‌وگو و پیام‌رسانی اجتماعی",
  "",
  "گفتگوی یک‌به‌یک با حفظ حریم خصوصی",
  "پیدا کردن کاربران نزدیک و هم‌استان",
  "پیام متنی و پیام صوتی",
  "فیلتر استان و بازه سنی",
  "",
  "ثبت‌نام رایگان است. حریم خصوصی شما مهم است.",
].join("\n");

const SHORT_EN =
  "Social chat network: private chat, nearby users, messages and voice";
const DESC_EN = [
  "Patogh — social chat and messaging network",
  "",
  "One-to-one chat with privacy controls",
  "Find nearby and same-province users",
  "Text and voice messages",
  "Province and age filters",
  "",
  "Free to join. Your privacy matters.",
].join("\n");

function isFa(lang?: string | null): boolean {
  return !lang || !lang.toLowerCase().startsWith("en");
}

async function botTexts(api: Api, fa: boolean) {
  const lang = fa ? "fa" : "en";
  let name = fa ? "دوردوریا | گفت‌وگو" : "Patogh | Chat";
  let short = fa ? SHORT_FA : SHORT_EN;
  let description = fa ? DESC_FA : DESC_EN;

  try {
    const n = await api.getMyName({ language_code: lang });
    if (n.name?.trim()) name = n.name.trim();
  } catch {
    /* ignore */
  }
  try {
    const s = await api.getMyShortDescription({ language_code: lang });
    if (s.short_description?.trim()) short = s.short_description.trim();
  } catch {
    /* ignore */
  }
  try {
    const d = await api.getMyDescription({ language_code: lang });
    if (d.description?.trim()) description = d.description.trim();
  } catch {
    /* ignore */
  }

  return { name, short, description };
}

async function inviteLink(
  api: Api,
  fromId: number | undefined,
): Promise<string> {
  const me = await api.getMe();
  const base = `https://t.me/${me.username}`;
  if (!fromId) return base;
  try {
    const user = await findByTelegram(fromId);
    if (user?.referralCode) {
      return `${base}?start=ref_${user.referralCode}`;
    }
  } catch {
    /* ignore */
  }
  return base;
}

function messageBody(opts: {
  fa: boolean;
  name: string;
  short: string;
  description: string;
  link: string;
}): string {
  // Telegram caption/message limit for photo is 1024; keep under that.
  const body = [
    opts.name,
    opts.short,
    "",
    opts.description,
    "",
    opts.fa ? "ورود به ربات:" : "Open the bot:",
    opts.link,
  ].join("\n");
  return body.length <= 1024 ? body : body.slice(0, 1000) + "…";
}

/**
 * True when the inline query should show the bot intro card
 * (empty query or not a search_* list token).
 */
export function wantsBotIntroInline(query: string): boolean {
  const raw = query.trim();
  if (!raw) return true;
  if (/^search_[A-Za-z0-9_-]+$/.test(raw)) return false;
  // Any free-text @bot query → show intro (not user list)
  return true;
}

export async function answerInlineBotIntro(ctx: Context): Promise<boolean> {
  const q = ctx.inlineQuery;
  if (!q || !ctx.from) return false;

  const fa = isFa(ctx.from.language_code);
  const { name, short, description } = await botTexts(ctx.api, fa);
  const link = await inviteLink(ctx.api, ctx.from.id);
  const text = messageBody({ fa, name, short, description, link });

  const kb = new InlineKeyboard()
    .url(fa ? "🚀 شروع در دوردوریا" : "🚀 Start Patogh", link)
    .row()
    .url(
      fa ? "📤 اشتراک‌گذاری" : "📤 Share",
      `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(
        `${name}\n${short}\n${link}`,
      )}`,
    );

  const results: InlineQueryResult[] = [];

  const photoId = await getBotProfilePhotoFileId(ctx.api);
  if (photoId) {
    results.push({
      type: "photo",
      id: "bot-intro-photo",
      photo_file_id: photoId,
      title: name,
      description: short,
      caption: text,
      reply_markup: kb,
    });
  }

  // Always include an article so there is at least one selectable result
  results.push({
    type: "article",
    id: "bot-intro-text",
    title: name,
    description: short,
    input_message_content: {
      message_text: text,
      link_preview_options: { is_disabled: false },
    },
    reply_markup: kb,
  });

  try {
    await ctx.answerInlineQuery(results, {
      cache_time: 60,
      is_personal: true,
      button: {
        text: fa ? "باز کردن دوردوریا" : "Open Patogh",
        start_parameter: "inline",
      },
    });
  } catch (err) {
    // Cached photo file_id can go stale — retry without photo
    clearBotPhotoCache();
    const fallback: InlineQueryResult[] = [
      {
        type: "article",
        id: "bot-intro-text",
        title: name,
        description: short,
        input_message_content: {
          message_text: text,
        },
        reply_markup: kb,
      },
    ];
    await ctx.answerInlineQuery(fallback, {
      cache_time: 30,
      is_personal: true,
      button: {
        text: fa ? "باز کردن دوردوریا" : "Open Patogh",
        start_parameter: "inline",
      },
    });
    console.error(
      "[inline_bot_intro]",
      err instanceof Error ? err.message : err,
    );
  }

  return true;
}
