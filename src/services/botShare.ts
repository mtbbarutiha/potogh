/**
 * Share card for inviting friends / anonymous link:
 * bot profile photo + short description + deep link + Telegram share button.
 * Forwarding or using Share sends photo+text to the recipient.
 */
import { InlineKeyboard, type Api, type Context } from "grammy";

const SHORT_FA =
  "شبکه گفت‌وگو: چت خصوصی، کاربران نزدیک، پیام و ویس";
const SHORT_EN =
  "Social chat network: private chat, nearby users, messages and voice";

/** Cached Telegram file_id of the bot's own profile photo (largest size). */
let cachedBotPhotoFileId: string | null = null;

export async function getBotProfilePhotoFileId(api: Api): Promise<string | null> {
  if (cachedBotPhotoFileId) return cachedBotPhotoFileId;
  try {
    const me = await api.getMe();
    const photos = await api.getUserProfilePhotos(me.id, { limit: 1 });
    const sizes = photos.photos[0];
    if (!sizes?.length) return null;
    const best = sizes[sizes.length - 1]!;
    cachedBotPhotoFileId = best.file_id;
    return cachedBotPhotoFileId;
  } catch {
    return null;
  }
}

export function clearBotPhotoCache(): void {
  cachedBotPhotoFileId = null;
}

function shareUrl(link: string, shareText: string): string {
  return (
    `https://t.me/share/url?url=${encodeURIComponent(link)}` +
    `&text=${encodeURIComponent(shareText)}`
  );
}

export type BotShareKind = "referral" | "anon";

export function buildShareCaption(opts: {
  lang: "fa" | "en";
  kind: BotShareKind;
  link: string;
  botName: string;
  shortDescription?: string;
  bonusLabel?: string;
}): string {
  const { lang, kind, link, botName } = opts;
  const short =
    opts.shortDescription?.trim() ||
    (lang === "en" ? SHORT_EN : SHORT_FA);

  if (lang === "en") {
    if (kind === "anon") {
      return [
        botName,
        short,
        "",
        "Share this link so others can message you anonymously:",
        link,
      ].join("\n");
    }
    return [
      botName,
      short,
      "",
      opts.bonusLabel ?? "Invite friends and earn free coins.",
      "",
      "Your invite link:",
      link,
    ].join("\n");
  }

  if (kind === "anon") {
    return [
      botName,
      short,
      "",
      "این لینک را بفرست تا بقیه ناشناس برایت پیام بفرستند:",
      link,
    ].join("\n");
  }

  return [
    botName,
    short,
    "",
    opts.bonusLabel ?? "دوستانت را دعوت کن و سکه رایگان بگیر.",
    "",
    "لینک دعوتت:",
    link,
  ].join("\n");
}

export function shareKeyboard(opts: {
  lang: "fa" | "en";
  link: string;
  shareText: string;
}): InlineKeyboard {
  const shareLabel = opts.lang === "en" ? "📤 Share" : "📤 اشتراک‌گذاری";
  const openLabel = opts.lang === "en" ? "🤖 Open bot" : "🤖 باز کردن ربات";
  return new InlineKeyboard()
    .url(shareLabel, shareUrl(opts.link, opts.shareText))
    .row()
    .url(openLabel, opts.link);
}

/**
 * Send a forwardable invite card: bot photo + description + link + share button.
 */
export async function sendBotShareCard(
  ctx: Context,
  opts: {
    lang: "fa" | "en";
    kind: BotShareKind;
    link: string;
    bonusLabel?: string;
  },
): Promise<void> {
  const api = ctx.api;
  const me = await api.getMe();
  let botName = me.first_name || (opts.lang === "en" ? "Patogh" : "پاتوق");
  try {
    const named = await api.getMyName({ language_code: opts.lang });
    if (named.name?.trim()) botName = named.name.trim();
  } catch {
    /* keep getMe name */
  }

  let shortDescription = opts.lang === "en" ? SHORT_EN : SHORT_FA;
  try {
    const short = await api.getMyShortDescription({
      language_code: opts.lang,
    });
    if (short.short_description?.trim()) {
      shortDescription = short.short_description.trim();
    }
  } catch {
    /* keep fallback */
  }

  const caption = buildShareCaption({
    lang: opts.lang,
    kind: opts.kind,
    link: opts.link,
    botName,
    shortDescription,
    ...(opts.bonusLabel ? { bonusLabel: opts.bonusLabel } : {}),
  });

  const shareText =
    opts.kind === "anon"
      ? opts.lang === "en"
        ? `${botName}\n${shortDescription}\n${opts.link}`
        : `${botName}\n${shortDescription}\n${opts.link}`
      : opts.lang === "en"
        ? `${botName}\n${shortDescription}\n\nJoin me:\n${opts.link}`
        : `${botName}\n${shortDescription}\n\nبا من وارد شو:\n${opts.link}`;

  const kb = shareKeyboard({
    lang: opts.lang,
    link: opts.link,
    shareText,
  });

  const photoId = await getBotProfilePhotoFileId(api);
  if (photoId) {
    try {
      await ctx.replyWithPhoto(photoId, {
        caption,
        reply_markup: kb,
      });
      return;
    } catch {
      clearBotPhotoCache();
    }
  }

  await ctx.reply(caption, { reply_markup: kb });
}
