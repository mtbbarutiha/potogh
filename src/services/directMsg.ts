import type { Api, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { prisma } from "../db/prisma.js";
import { patchUser } from "../db/users.js";
import {
  DIRECT_MSG_COST,
  LIST_BLAST_COST,
  LIST_BLAST_LIMIT,
  formatNum,
} from "../data/packages.js";
import {
  cancelKeyboard,
  chattingKeyboard,
  mainKeyboard,
} from "../keyboards/main.js";
import { langOf, tr, normalizeLang, type Lang } from "../i18n/index.js";
import { rejectForbiddenContact } from "./contactGuard.js";
import {
  classifyBotDeliveryError,
  telegramChatId,
  telegramErrorText,
  type BotDeliveryBlockReason,
} from "../lib/telegramSafe.js";

/**
 * حالت سایلنت درخواست‌چت (chatSilentUntil) هرگز نباید دایرکت را قطع کند.
 * فقط بلاک دوطرفه / نبودن chat با ربات / سکه ناکافی مانع است.
 * هیچ پیش‌چک deliverability (مثل sendChatAction) قبل از ارسال واقعی نداریم.
 *
 * «پیام ربات را نمی‌پذیرد / بلاک کرده» فقط وقتی description تلگرام
 * شامل «bot was blocked by the user» باشد — نه 403 مبهم و نه mid-chat partner.
 */
function shortTelegramError(err: unknown): string {
  const raw = telegramErrorText(err);
  // Grammy: "Call to 'sendMessage' failed! (403: Forbidden: …)"
  const m = raw.match(/\(([^)]+)\)\s*$/);
  const core = (m?.[1] ?? raw).replace(/\s+/g, " ").trim();
  return core.slice(0, 160);
}

function dmDeliveryBlockedMessage(
  reason: BotDeliveryBlockReason,
  lang: Lang | string | null,
  detail?: string | null,
): string {
  const L = normalizeLang(lang);
  switch (reason) {
    case "blocked_bot":
      // فقط بعد از 403 واقعی تلگرام با «blocked by the user»
      return tr(
        L,
        "ارسال نشد؛ این کاربر ربات را در تلگرام بلاک کرده. تا وقتی آنبلاک نکند پیام دایرکت به او نمی‌رسد.",
        "Not sent; this user has blocked the bot on Telegram. DMs can't arrive until they unblock it.",
      );
    case "never_started":
      return tr(
        L,
        "ارسال نشد؛ این کاربر هنوز ربات را استارت نکرده یا چت ربات برایش موجود نیست.",
        "Not sent; this user hasn't started the bot (or has no chat with it).",
      );
    case "deactivated":
      return tr(
        L,
        "ارسال نشد؛ حساب تلگرام این کاربر غیرفعال است.",
        "Not sent; this user's Telegram account is deactivated.",
      );
    case "forbidden": {
      const why = detail?.trim();
      return why
        ? tr(L, `ارسال نشد؛ ${why}`, `Not sent; ${why}`)
        : tr(
            L,
            "ارسال نشد؛ تلگرام اجازه پیام به این کاربر را نداد.",
            "Not sent; Telegram refused messaging this user.",
          );
    }
    default: {
      const why = detail?.trim();
      return why
        ? tr(L, `ارسال نشد؛ ${why}`, `Not sent; ${why}`)
        : tr(L, "ارسال نشد. سکه کسر نشد.", "Not sent. No coins were deducted.");
    }
  }
}

/** کاربرهایی که الان با ربات چت می‌کنند قطعاً پیام ربات را می‌گیرند. */
function targetClearlyReceivesBot(target: {
  state?: string | null;
  chatPartnerId?: number | null;
}): boolean {
  if (target.state === "chatting") return true;
  if (target.chatPartnerId != null) return true;
  return false;
}

async function partnerHasThisAsChatPartner(targetId: number): Promise<boolean> {
  const n = await prisma.user.count({
    where: { chatPartnerId: targetId, state: "chatting" },
  });
  return n > 0;
}

type DmDeliverResult =
  | { ok: true }
  | { ok: false; reason: BotDeliveryBlockReason; detail?: string };

async function deliverDmNotify(
  api: Api,
  targetTelegramId: bigint | number | string,
  notifyText: string,
  replyMarkup: InlineKeyboard,
  photo: unknown,
  opts?: { treatAsReachable?: boolean },
): Promise<DmDeliverResult> {
  // Exact same chat_id resolution as anonymous chat relay (string — BigInt-safe).
  const chatId = telegramChatId(targetTelegramId);
  try {
    if (photo) {
      await api.sendPhoto(chatId, photo as never, {
        caption: notifyText,
        reply_markup: replyMarkup,
      });
      return { ok: true };
    }
  } catch (err) {
    const classified = classifyBotDeliveryError(err);
    // Only abort early on hard delivery blocks; photo errors otherwise fall through to text.
    if (classified === "blocked_bot" || classified === "deactivated" || classified === "never_started") {
      // Mid-chat / clearly-reachable: never abort on photo "blocked" — try text like relay.
      if (opts?.treatAsReachable) {
        console.warn(
          "DM photo hard-fail ignored (treatAsReachable); falling through to text",
          { chatId, classified, err: shortTelegramError(err) },
        );
      } else {
        return { ok: false, reason: classified, detail: shortTelegramError(err) };
      }
    }
    // خطای عکس — متن را امتحان کن
  }
  try {
    await api.sendMessage(chatId, notifyText, {
      reply_markup: replyMarkup,
    });
    return { ok: true };
  } catch (err) {
    console.error("direct message notify failed", {
      chatId,
      treatAsReachable: Boolean(opts?.treatAsReachable),
      err,
      short: shortTelegramError(err),
    });
    let reason = classifyBotDeliveryError(err);
    // If relay would already reach this chat_id, "blocked_bot" is a false UX label.
    if (reason === "blocked_bot" && opts?.treatAsReachable) {
      console.warn(
        "DM blocked_bot ignored — target clearly receives bot messages; showing raw reason",
        err,
      );
      reason = null;
    }
    return {
      ok: false,
      reason,
      detail: shortTelegramError(err),
    };
  }
}

export function dmPreviewKeyboard(draftId: number, lang: Lang | string | null = "fa") {
  const L = normalizeLang(lang);
  return new InlineKeyboard()
    .text(tr(L, "✏️ ویرایش", "✏️ Edit"), `dm:edit:${draftId}`)
    .primary()
    .row()
    .text(
      tr(
        L,
        `💰 کسر ${formatNum(DIRECT_MSG_COST)} سکه و ارسال`,
        `💰 Deduct ${formatNum(DIRECT_MSG_COST)} coin & send`,
      ),
      `dm:send:${draftId}`,
    )
    .success();
}

export function dmNotifyKeyboard(msgId: number, lang: Lang | string | null = "fa") {
  const L = normalizeLang(lang);
  return new InlineKeyboard()
    .text(tr(L, "👁 مشاهده پیام", "👁 View message"), `dm:view:${msgId}`)
    .primary();
}

export function dmViewKeyboard(msgId: number, lang: Lang | string | null = "fa") {
  const L = normalizeLang(lang);
  return new InlineKeyboard()
    .text(
      tr(
        L,
        `↩️ ارسال پاسخ (${formatNum(DIRECT_MSG_COST)}💰)`,
        `↩️ Send reply (${formatNum(DIRECT_MSG_COST)}💰)`,
      ),
      `dm:reply:${msgId}`,
    )
    .success();
}

function restoreAfterDm(user: {
  chatPartnerId: number | null;
  secureChat: boolean;
  language?: string | null;
}) {
  const lang = langOf(user);
  const state = user.chatPartnerId ? "chatting" : "idle";
  const keyboard = user.chatPartnerId
    ? chattingKeyboard(user.secureChat, lang)
    : mainKeyboard(lang);
  return { state, keyboard };
}

export async function beginDirectCompose(
  ctx: Context,
  user: {
    id: number;
    diamonds: number;
    chatPartnerId: number | null;
    secureChat: boolean;
    language?: string | null;
    state?: string | null;
  },
  targetId: number,
  opts?: { replyToId?: number },
) {
  const lang = langOf(user);
  const { keyboard: contextKeyboard } = restoreAfterDm(user);
  const midChat = Boolean(user.chatPartnerId);
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target || target.deletedAt || !target.registered) {
    if (target?.deletedAt) {
      const { targetAccountDeletedText } = await import("./account.js");
      await ctx.reply(targetAccountDeletedText(lang));
      return false;
    }
    await ctx.reply(tr(lang, "کاربر پیدا نشد.", "User not found."));
    return false;
  }
  if (target.telegramId >= 9000000000n) {
    await ctx.reply(
      tr(
        lang,
        "این پروفایل نمونه است؛ پیام دایرکت فقط برای کاربر واقعی.",
        "This is a sample profile; direct messages only work for real users.",
      ),
    );
    return false;
  }

  const { hasBlocked } = await import("./block.js");
  if (await hasBlocked(user.id, targetId)) {
    const { InlineKeyboard } = await import("grammy");
    await ctx.reply(
      tr(
        lang,
        [
          "🚫 این کاربر را بلاک کرده‌ای.",
          "",
          "اول آنبلاک کن، بعد می‌تونی درخواست چت یا پیام دایرکت بفرستی.",
        ].join("\n"),
        [
          "🚫 You blocked this user.",
          "",
          "Unblock them first, then you can send a chat request or direct message.",
        ].join("\n"),
      ),
      {
        reply_markup: new InlineKeyboard()
          .text(tr(lang, "🔓 آنبلاک", "🔓 Unblock"), `block:off:${targetId}`)
          .success(),
      },
    );
    return false;
  }
  if (await hasBlocked(targetId, user.id)) {
    await ctx.reply(
      tr(
        lang,
        "امکان ارسال پیام دایرکت به این کاربر نیست.",
        "You can't send a direct message to this user.",
      ),
    );
    return false;
  }

  // No must-message-first gate. Silent chat-request mode never blocks DM.
  // No deliverability probe here — mid-chat compose stays open; real send decides.

  if (user.diamonds < DIRECT_MSG_COST) {
    await ctx.reply(
      [
        tr(
          lang,
          `برای پیام دایرکت به ${formatNum(DIRECT_MSG_COST)} سکه نیاز داری.`,
          `You need ${formatNum(DIRECT_MSG_COST)} coin(s) for a direct message.`,
        ),
        tr(lang, `موجودی: ${formatNum(user.diamonds)} 💰`, `Balance: ${formatNum(user.diamonds)} 💰`),
      ].join("\n"),
      { reply_markup: contextKeyboard },
    );
    return false;
  }

  await prisma.directMessage.deleteMany({
    where: { fromUserId: user.id, status: "draft" },
  });

  const pending = opts?.replyToId
    ? `reply:${opts.replyToId}`
    : String(target.id);

  // Like report_other: mid-chat keeps chatting + chatPartnerId; only pendingDirectTo flips.
  await patchUser(user.id, {
    state: midChat ? "chatting" : "await_direct_msg",
    pendingDirectTo: pending,
  });

  const replyNote = opts?.replyToId
    ? tr(lang, "\n(در حال نوشتن پاسخ به پیام دایرکت)", "\n(Writing a reply to a direct message)")
    : "";

  const targetName = target.displayName ?? tr(lang, "کاربر", "user");
  const silentNote =
    target.chatSilentUntil && target.chatSilentUntil.getTime() > Date.now()
      ? tr(
          lang,
          "\n🔇 این کاربر سایلنت درخواست‌چت است — دایرکت همچنان ارسال می‌شود.",
          "\n🔇 This user muted chat requests — DM still works.",
        )
      : "";
  const midChatNote = midChat
    ? tr(
        lang,
        "\n💬 چت ناشناس باز می‌ماند — بعد از ارسال/انصراف به همان چت برمی‌گردی.",
        "\n💬 Anonymous chat stays open — you'll return to it after send/cancel.",
      )
    : "";

  await ctx.reply(
    [
      opts?.replyToId
        ? tr(lang, "↩️ پاسخ پیام دایرکت", "↩️ Direct message reply")
        : tr(lang, "✉️ پیام دایرکت", "✉️ Direct message"),
      "",
      `${tr(lang, "گیرنده", "Recipient")}: ${targetName}${target.userCode ? ` (/user_${target.userCode})` : ""}`,
      silentNote,
      midChatNote,
      tr(
        lang,
        `هزینه ارسال: ${formatNum(DIRECT_MSG_COST)} سکه`,
        `Sending cost: ${formatNum(DIRECT_MSG_COST)} coin(s)`,
      ),
      tr(lang, `موجودی: ${formatNum(user.diamonds)} 💰`, `Balance: ${formatNum(user.diamonds)} 💰`),
      replyNote,
      "",
      tr(lang, "متن پیامت را بنویس یا یک ویس بفرست 🎤", "Write your message text or send a voice 🎤"),
      tr(
        lang,
        "بعداً پیش‌نمایش می‌بینی و می‌توانی ویرایش یا ارسال کنی.",
        "You'll see a preview next and can edit or send it.",
      ),
      midChat
        ? tr(
            lang,
            "انصراف: بازگشت یا /cancel (چت قطع نمی‌شود)",
            "Cancel: Back or /cancel (chat stays open)",
          )
        : tr(lang, "انصراف: بازگشت به منو یا /cancel", "Cancel: go back to menu or /cancel"),
    ]
      .filter(Boolean)
      .join("\n"),
    { reply_markup: cancelKeyboard(lang) },
  );
  return true;
}

function parseComposeTarget(pending: string): {
  toUserId?: number;
  replyToId?: number;
  blastToken?: string;
} {
  if (pending.startsWith("blast:")) {
    const blastToken = pending.slice(6);
    return blastToken ? { blastToken } : {};
  }
  if (pending.startsWith("reply:")) {
    const replyToId = Number(pending.slice(6));
    return Number.isFinite(replyToId) ? { replyToId } : {};
  }
  const toUserId = Number(pending);
  return Number.isFinite(toUserId) ? { toUserId } : {};
}

type BlastPreview = {
  fromUserId: number;
  token: string;
  text: string;
  recipientIds: number[];
  createdAt: number;
};

const blastPreviews = new Map<string, BlastPreview>();

function blastPreviewKey(userId: number, token: string) {
  return `${userId}:${token}`;
}

export function blastPreviewKeyboard(token: string, lang: Lang | string | null = "fa") {
  const L = normalizeLang(lang);
  return new InlineKeyboard()
    .text(tr(L, "✏️ ویرایش متن", "✏️ Edit text"), `blast:edit:${token}`)
    .primary()
    .row()
    .text(
      tr(
        L,
        `💰 کسر ${formatNum(LIST_BLAST_COST)} سکه و ارسال`,
        `💰 Deduct ${formatNum(LIST_BLAST_COST)} coins & send`,
      ),
      `blast:send:${token}`,
    )
    .success();
}

/** شروع نوشتن پیام دایرکت برای ۱۰ نفر اول لیست (هزینه ثابت ۱۰ سکه) */
export async function beginListBlast(
  ctx: Context,
  user: {
    id: number;
    diamonds: number;
    chatPartnerId: number | null;
    secureChat: boolean;
    language?: string | null;
  },
  token: string,
) {
  if (!ctx.from) return false;
  const lang = langOf(user);
  const { getBlastRecipients } = await import("./inlineList.js");
  const pack = await getBlastRecipients(token, ctx.from.id);
  if (!pack || !pack.recipients.length) {
    await ctx.reply(
      tr(
        lang,
        "لیست منقضی شده یا گیرنده‌ای نیست. دوباره لیست را باز کن.",
        "The list expired or has no recipients. Open the list again.",
      ),
    );
    return false;
  }

  const n = pack.recipients.length;
  if (user.diamonds < LIST_BLAST_COST) {
    await ctx.reply(
      [
        tr(
          lang,
          `برای پیام به ${formatNum(LIST_BLAST_LIMIT)} نفر اول، ${formatNum(LIST_BLAST_COST)} سکه لازم است.`,
          `Messaging the first ${formatNum(LIST_BLAST_LIMIT)} needs ${formatNum(LIST_BLAST_COST)} coins.`,
        ),
        tr(lang, `موجودی: ${formatNum(user.diamonds)} 💰`, `Balance: ${formatNum(user.diamonds)} 💰`),
      ].join("\n"),
      { reply_markup: mainKeyboard(lang) },
    );
    return false;
  }

  await prisma.directMessage.deleteMany({
    where: { fromUserId: user.id, status: "draft" },
  });

  await patchUser(user.id, {
    state: "await_direct_msg",
    pendingDirectTo: `blast:${token}`,
  });

  await ctx.reply(
    tr(
      lang,
      [
        "✉️ پیام به ۱۰ نفر اول لیست",
        "",
        `گیرندگان این ارسال: ${formatNum(n)} نفر (حداکثر ${formatNum(LIST_BLAST_LIMIT)})`,
        `هزینه ثابت: ${formatNum(LIST_BLAST_COST)}💰`,
        `موجودی: ${formatNum(user.diamonds)} 💰`,
        "",
        "متن پیامت را بنویس.",
        "انصراف: بازگشت به منو یا /cancel",
      ].join("\n"),
      [
        "✉️ Message the first 10 in this list",
        "",
        `Recipients for this send: ${formatNum(n)} (max ${formatNum(LIST_BLAST_LIMIT)})`,
        `Flat cost: ${formatNum(LIST_BLAST_COST)}💰`,
        `Balance: ${formatNum(user.diamonds)} 💰`,
        "",
        "Write your message text.",
        "Cancel: go back to menu or /cancel",
      ].join("\n"),
    ),
    { reply_markup: cancelKeyboard(lang) },
  );
  return true;
}

async function handleBlastTyped(
  ctx: Context,
  user: {
    id: number;
    diamonds: number;
    chatPartnerId: number | null;
    secureChat: boolean;
    language?: string | null;
  },
  token: string,
  text: string,
) {
  const lang = langOf(user);
  const { state: restoreState, keyboard: restoreKeyboard } = restoreAfterDm(user);
  if (!ctx.from) return;

  const { getBlastRecipients } = await import("./inlineList.js");
  const pack = await getBlastRecipients(token, ctx.from.id);
  if (!pack || !pack.recipients.length) {
    await patchUser(user.id, { state: restoreState, pendingDirectTo: null });
    await ctx.reply(
      tr(lang, "لیست منقضی شد. دوباره لیست را باز کن.", "The list expired. Open the list again."),
      { reply_markup: restoreKeyboard },
    );
    return;
  }

  const recipientIds = pack.recipients.map((r) => r.id);
  const n = recipientIds.length;

  blastPreviews.set(blastPreviewKey(user.id, token), {
    fromUserId: user.id,
    token,
    text,
    recipientIds,
    createdAt: Date.now(),
  });

  await patchUser(user.id, {
    state: restoreState,
    pendingDirectTo: null,
  });

  const preview = [
    tr(lang, "📝 پیش‌نمایش پیام به ۱۰ نفر اول", "📝 Preview: first 10 in list"),
    "",
    tr(lang, `گیرندگان: ${formatNum(n)} نفر`, `Recipients: ${formatNum(n)}`),
    tr(
      lang,
      `هزینه ثابت: ${formatNum(LIST_BLAST_COST)}💰`,
      `Flat cost: ${formatNum(LIST_BLAST_COST)}💰`,
    ),
    tr(lang, `موجودی: ${formatNum(user.diamonds)} 💰`, `Balance: ${formatNum(user.diamonds)} 💰`),
    "",
    "————————",
    text,
    "————————",
  ]
    .filter(Boolean)
    .join("\n");

  await ctx.reply(preview, { reply_markup: blastPreviewKeyboard(token, lang) });
}

export async function editListBlast(ctx: Context, userId: number, token: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const lang = langOf(user);
  const key = blastPreviewKey(userId, token);
  const prev = blastPreviews.get(key);
  if (!prev || prev.fromUserId !== userId) {
    await ctx.answerCallbackQuery({ text: tr(lang, "پیش‌نویس پیدا نشد", "Draft not found") });
    return;
  }

  await patchUser(userId, {
    state: "await_direct_msg",
    pendingDirectTo: `blast:${token}`,
  });

  await ctx.answerCallbackQuery({ text: tr(lang, "متن جدید را بفرست", "Send the new text") });
  await ctx.reply(
    tr(
      lang,
      ["✏️ ویرایش متن گروهی", "", "متن قبلی:", prev.text, "", "متن جدید را الان بفرست."].join(
        "\n",
      ),
      [
        "✏️ Edit group message",
        "",
        "Previous text:",
        prev.text,
        "",
        "Send the new text now.",
      ].join("\n"),
    ),
    { reply_markup: cancelKeyboard(lang) },
  );
}

export async function sendListBlast(ctx: Context, userId: number, token: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const lang = langOf(user);
  const { state: restoreState, keyboard: restoreKeyboard } = user
    ? restoreAfterDm(user)
    : { state: "idle" as const, keyboard: mainKeyboard(lang) };

  const key = blastPreviewKey(userId, token);
  const prev = blastPreviews.get(key);
  if (!user || !prev || prev.fromUserId !== userId) {
    await ctx.answerCallbackQuery({ text: tr(lang, "پیش‌نویس منقضی شده", "Draft expired") });
    return;
  }
  if (!ctx.from) {
    await ctx.answerCallbackQuery();
    return;
  }

  const { getBlastRecipients } = await import("./inlineList.js");
  const pack = await getBlastRecipients(token, ctx.from.id);
  const recipients = pack?.recipients.filter((r) =>
    prev.recipientIds.includes(r.id),
  ) ?? [];

  if (!recipients.length) {
    blastPreviews.delete(key);
    await ctx.answerCallbackQuery({ text: tr(lang, "گیرنده‌ای نیست", "No recipients") });
    await ctx.reply(tr(lang, "لیست منقضی شد.", "The list expired."), {
      reply_markup: restoreKeyboard,
    });
    return;
  }

  if (user.diamonds < LIST_BLAST_COST) {
    await ctx.answerCallbackQuery({ text: tr(lang, "سکه کافی نیست", "Not enough coins") });
    await ctx.reply(
      tr(
        lang,
        `سکه کافی نیست (نیاز: ${formatNum(LIST_BLAST_COST)}💰). موجودی: ${formatNum(user.diamonds)} 💰`,
        `Not enough coins (need ${formatNum(LIST_BLAST_COST)}💰). Balance: ${formatNum(user.diamonds)} 💰`,
      ),
      { reply_markup: restoreKeyboard },
    );
    return;
  }

  await ctx.answerCallbackQuery({ text: tr(lang, "در حال ارسال…", "Sending…") });
  await ctx
    .editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } })
    .catch(() => undefined);

  // هزینه ثابت ۱۰ سکه برای کل بچ — کسر اتمی
  const { debitCoins } = await import("./coins.js");
  const paid = await debitCoins(user.id, LIST_BLAST_COST);
  if (!paid) {
    await ctx.reply(
      tr(lang, "سکه کافی نیست.", "Not enough coins."),
      { reply_markup: restoreKeyboard },
    );
    return;
  }
  const spent = LIST_BLAST_COST;
  const after = await prisma.user.findUnique({
    where: { id: user.id },
    select: { diamonds: true },
  });
  let diamondsLeft = after?.diamonds ?? user.diamonds - LIST_BLAST_COST;

  let sentOk = 0;
  let failed = 0;

  const { publicPhotoWithBadge } = await import("../lib/faceBadgePhoto.js");
  let photo: Awaited<ReturnType<typeof publicPhotoWithBadge>> | null = null;
  try {
    photo = await publicPhotoWithBadge(ctx.api, user);
  } catch {
    photo = null;
  }

  for (const target of recipients) {
    const msg = await prisma.directMessage.create({
      data: {
        fromUserId: user.id,
        toUserId: target.id,
        text: prev.text,
        status: "sent",
      },
    });

    const targetUser = await prisma.user.findUnique({
      where: { id: target.id },
      select: { language: true },
    });
    const targetLang = langOf(targetUser);
    const fromName = user.displayName ?? tr(targetLang, "یک کاربر", "a user");
    const notifyText = tr(
      targetLang,
      [
        "💌 پیام دایرکت جدید",
        "",
        `کاربر «${fromName}» برات پیام دایرکت فرستاده.`,
        user.userCode ? `آیدی: /user_${user.userCode}` : null,
        "",
        "برای دیدن متن، روی دکمه زیر بزن 👇",
      ]
        .filter(Boolean)
        .join("\n"),
      [
        "💌 New direct message",
        "",
        `«${fromName}» sent you a direct message.`,
        user.userCode ? `ID: /user_${user.userCode}` : null,
        "",
        "Tap the button below to read it 👇",
      ]
        .filter(Boolean)
        .join("\n"),
    );

    try {
      const chatId = telegramChatId(target.telegramId);
      if (photo) {
        await ctx.api.sendPhoto(chatId, photo, {
          caption: notifyText,
          reply_markup: dmNotifyKeyboard(msg.id, targetLang),
        });
      } else {
        await ctx.api.sendMessage(chatId, notifyText, {
          reply_markup: dmNotifyKeyboard(msg.id, targetLang),
        });
      }
      sentOk += 1;
    } catch {
      failed += 1;
      await prisma.directMessage.delete({ where: { id: msg.id } }).catch(() => undefined);
    }

    if (sentOk + failed < recipients.length) {
      await new Promise((r) => setTimeout(r, 40));
    }
  }

  // اگر هیچ‌کدام نرفت، سکه را برگردان
  if (sentOk === 0 && spent > 0) {
    const refunded = await prisma.user.update({
      where: { id: user.id },
      data: { diamonds: { increment: LIST_BLAST_COST } },
    });
    diamondsLeft = refunded.diamonds;
  }

  blastPreviews.delete(key);
  await patchUser(user.id, { state: restoreState, pendingDirectTo: null });

  const fresh = await prisma.user.findUnique({ where: { id: user.id } });
  const actuallySpent = sentOk === 0 ? 0 : spent;
  await ctx.reply(
    tr(
      lang,
      [
        "✅ ارسال به ۱۰ نفر اول تمام شد.",
        `ارسال موفق: ${formatNum(sentOk)}`,
        failed ? `ناموفق: ${formatNum(failed)}` : null,
        `💰 کسر شده: ${formatNum(actuallySpent)} سکه`,
        `موجودی: ${formatNum(fresh?.diamonds ?? diamondsLeft)} 💰`,
      ]
        .filter(Boolean)
        .join("\n"),
      [
        "✅ Send to first 10 finished.",
        `Sent successfully: ${formatNum(sentOk)}`,
        failed ? `Failed: ${formatNum(failed)}` : null,
        `💰 Deducted: ${formatNum(actuallySpent)} coin(s)`,
        `Balance: ${formatNum(fresh?.diamonds ?? diamondsLeft)} 💰`,
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    { reply_markup: restoreKeyboard },
  );
}

/** بعد از تایپ متن → پیش‌نمایش */
export async function handleDirectMsgTyped(ctx: Context, userId: number, text: string) {
  await createDirectDraftFromInput(ctx, userId, { text });
}

/** بعد از ارسال ویس → پیش‌نمایش */
export async function handleDirectMsgVoice(
  ctx: Context,
  userId: number,
  voiceFileId: string,
  caption?: string | null,
) {
  const text =
    (caption ?? "").trim() ||
    "🎤 پیام صوتی";
  await createDirectDraftFromInput(ctx, userId, {
    text: text.slice(0, 1000),
    voiceFileId,
  });
}

async function createDirectDraftFromInput(
  ctx: Context,
  userId: number,
  input: { text: string; voiceFileId?: string },
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.pendingDirectTo) return;

  const lang = langOf(user);
  const { state: restoreState, keyboard: restoreKeyboard } = restoreAfterDm(user);
  const text = input.text.trim();
  if (text.length < 1) {
    await ctx.reply(
      tr(lang, "متن یا ویس پیام را بفرست یا انصراف بزن.", "Send text or voice, or cancel."),
    );
    return;
  }
  if (text.length > 1000) {
    await ctx.reply(
      tr(lang, "پیام دایرکت حداکثر ۱۰۰۰ حرف.", "Direct messages are limited to 1000 characters."),
    );
    return;
  }

  if (
    await rejectForbiddenContact(
      ctx,
      text,
      lang,
      ctx.message && "entities" in ctx.message
        ? ctx.message.entities
        : undefined,
    )
  ) {
    return;
  }

  const parsed = parseComposeTarget(user.pendingDirectTo);

  if (parsed.blastToken) {
    if (input.voiceFileId) {
      await ctx.reply(
        tr(
          lang,
          "برای پیام گروهی فقط متن مجاز است (نه ویس).",
          "Group blast supports text only (not voice).",
        ),
      );
      return;
    }
    await handleBlastTyped(ctx, user, parsed.blastToken, text);
    return;
  }

  let toUserId = parsed.toUserId;
  let replyToId = parsed.replyToId;

  if (replyToId != null) {
    const parent = await prisma.directMessage.findUnique({
      where: { id: replyToId },
    });
    if (!parent || parent.status === "draft") {
      await patchUser(user.id, { state: restoreState, pendingDirectTo: null });
      await ctx.reply(tr(lang, "پیام اصلی پیدا نشد.", "Original message not found."), {
        reply_markup: restoreKeyboard,
      });
      return;
    }
    toUserId = parent.fromUserId;
  }

  if (toUserId == null || toUserId === user.id) {
    await patchUser(user.id, { state: restoreState, pendingDirectTo: null });
    await ctx.reply(tr(lang, "گیرنده نامعتبر است.", "Invalid recipient."), {
      reply_markup: restoreKeyboard,
    });
    return;
  }

  const target = await prisma.user.findUnique({ where: { id: toUserId } });
  if (!target || target.deletedAt || !target.registered) {
    await patchUser(user.id, { state: restoreState, pendingDirectTo: null });
    if (target?.deletedAt) {
      const { targetAccountDeletedText } = await import("./account.js");
      await ctx.reply(targetAccountDeletedText(lang), {
        reply_markup: restoreKeyboard,
      });
      return;
    }
    await ctx.reply(tr(lang, "گیرنده پیدا نشد.", "Recipient not found."), {
      reply_markup: restoreKeyboard,
    });
    return;
  }

  await prisma.directMessage.deleteMany({
    where: { fromUserId: user.id, status: "draft" },
  });

  const draft = await prisma.directMessage.create({
    data: {
      fromUserId: user.id,
      toUserId,
      text,
      voiceFileId: input.voiceFileId ?? null,
      status: "draft",
      replyToId: replyToId ?? null,
    },
  });

  await patchUser(user.id, {
    state: restoreState,
    pendingDirectTo: null,
  });

  const targetName = target.displayName ?? tr(lang, "کاربر", "user");
  const kindLine = input.voiceFileId
    ? tr(lang, "نوع محتوا: 🎤 ویس", "Content: 🎤 Voice")
    : tr(lang, "نوع محتوا: 📝 متن", "Content: 📝 Text");
  const previewBody = tr(
    lang,
    [
      "📝 پیش‌نمایش پیام دایرکت",
      "",
      `برای: ${targetName}${target.userCode ? ` (/user_${target.userCode})` : ""}`,
      replyToId ? "نوع: پاسخ" : "نوع: پیام جدید",
      kindLine,
      "",
      "————————",
      text,
      "————————",
      "",
      `ارسال = کسر ${formatNum(DIRECT_MSG_COST)} سکه از موجودی‌ات`,
      `موجودی فعلی: ${formatNum(user.diamonds)} 💰`,
    ].join("\n"),
    [
      "📝 Direct message preview",
      "",
      `To: ${targetName}${target.userCode ? ` (/user_${target.userCode})` : ""}`,
      replyToId ? "Type: reply" : "Type: new message",
      kindLine,
      "",
      "————————",
      text,
      "————————",
      "",
      `Sending = deduct ${formatNum(DIRECT_MSG_COST)} coin(s) from your balance`,
      `Current balance: ${formatNum(user.diamonds)} 💰`,
    ].join("\n"),
  );

  try {
    if (input.voiceFileId) {
      await ctx.replyWithVoice(input.voiceFileId, {
        caption: previewBody,
        reply_markup: dmPreviewKeyboard(draft.id, lang),
      });
      return;
    }
    const { publicPhotoWithBadge } = await import("../lib/faceBadgePhoto.js");
    const photo = await publicPhotoWithBadge(ctx.api, target);
    await ctx.replyWithPhoto(photo, {
      caption: previewBody,
      reply_markup: dmPreviewKeyboard(draft.id, lang),
    });
  } catch {
    await ctx.reply(previewBody, {
      reply_markup: dmPreviewKeyboard(draft.id, lang),
    });
  }
}

export async function editDirectDraft(ctx: Context, userId: number, draftId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const lang = langOf(user);
  const draft = await prisma.directMessage.findUnique({ where: { id: draftId } });
  if (!user || !draft || draft.fromUserId !== userId || draft.status !== "draft") {
    await ctx.answerCallbackQuery({ text: tr(lang, "پیش‌نویس پیدا نشد", "Draft not found") });
    return;
  }

  const pending = draft.replyToId
    ? `reply:${draft.replyToId}`
    : String(draft.toUserId);

  const midChat = Boolean(user.chatPartnerId);
  await patchUser(user.id, {
    state: midChat ? "chatting" : "await_direct_msg",
    pendingDirectTo: pending,
  });

  await ctx.answerCallbackQuery({
    text: tr(lang, "متن یا ویس جدید بفرست", "Send new text or voice"),
  });
  await ctx.reply(
    tr(
      lang,
      [
        "✏️ ویرایش پیام دایرکت",
        "",
        draft.voiceFileId ? "محتوای قبلی: 🎤 ویس" : "محتوای قبلی: 📝 متن",
        draft.text,
        "",
        "متن جدید را بنویس یا ویس جدید بفرست 🎤",
        "انصراف: /cancel",
      ].join("\n"),
      [
        "✏️ Edit direct message",
        "",
        draft.voiceFileId ? "Previous: 🎤 Voice" : "Previous: 📝 Text",
        draft.text,
        "",
        "Send new text or a new voice 🎤",
        "Cancel: /cancel",
      ].join("\n"),
    ),
    { reply_markup: cancelKeyboard(lang) },
  );
}

export async function sendDirectDraft(ctx: Context, userId: number, draftId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const lang = langOf(user);
  const draft = await prisma.directMessage.findUnique({ where: { id: draftId } });
  const { state: restoreState, keyboard: restoreKeyboard } = user
    ? restoreAfterDm(user)
    : { state: "idle" as const, keyboard: mainKeyboard(lang) };

  if (!user || !draft || draft.fromUserId !== userId || draft.status !== "draft") {
    await ctx.answerCallbackQuery({ text: tr(lang, "پیش‌نویس منقضی شده", "Draft expired") });
    return;
  }

  const target = await prisma.user.findUnique({ where: { id: draft.toUserId } });
  if (!target || target.deletedAt || target.telegramId >= 9000000000n) {
    await prisma.directMessage.delete({ where: { id: draft.id } }).catch(() => undefined);
    if (target?.deletedAt) {
      const { notifyTargetAccountDeleted } = await import("./account.js");
      await notifyTargetAccountDeleted(ctx, lang);
      await ctx.reply(tr(lang, "گیرنده دیگر در دسترس نیست.", "Recipient is no longer available."), {
        reply_markup: restoreKeyboard,
      });
      return;
    }
    await ctx.answerCallbackQuery({
      text: tr(lang, "گیرنده در دسترس نیست", "Recipient unavailable"),
    });
    await ctx.reply(tr(lang, "گیرنده پیدا نشد.", "Recipient not found."), {
      reply_markup: restoreKeyboard,
    });
    return;
  }

  // No pre-send deliverability gate (sendChatAction false-positived on chatting users).
  // Attempt the real DM; blocked copy only if Telegram 403 says "blocked by the user".

  if (user.diamonds < DIRECT_MSG_COST) {
    await ctx.answerCallbackQuery({ text: tr(lang, "سکه کافی نیست", "Not enough coins") });
    await ctx.reply(
      tr(
        lang,
        [
          `سکه کافی نیست (نیاز: ${formatNum(DIRECT_MSG_COST)}).`,
          `موجودی: ${formatNum(user.diamonds)} 💰`,
        ].join("\n"),
        [
          `Not enough coins (needed: ${formatNum(DIRECT_MSG_COST)}).`,
          `Balance: ${formatNum(user.diamonds)} 💰`,
        ].join("\n"),
      ),
      { reply_markup: restoreKeyboard },
    );
    return;
  }

  const { debitCoins } = await import("./coins.js");
  const paid = await debitCoins(user.id, DIRECT_MSG_COST);
  if (!paid) {
    await ctx.answerCallbackQuery({ text: tr(lang, "سکه کافی نیست", "Not enough coins") });
    return;
  }
  const afterBal = await prisma.user.findUnique({
    where: { id: user.id },
    select: { diamonds: true },
  });
  const updated = { diamonds: afterBal?.diamonds ?? user.diamonds - DIRECT_MSG_COST };

  const sent = await prisma.directMessage.update({
    where: { id: draft.id },
    data: { status: "sent" },
  });

  const targetLang = langOf(target);
  const fromName = user.displayName ?? tr(targetLang, "یک کاربر", "a user");
  const isVoice = Boolean(draft.voiceFileId);
  const notifyText = tr(
    targetLang,
    [
      isVoice ? "💌 پیام صوتی دایرکت جدید" : "💌 پیام دایرکت جدید",
      "",
      isVoice
        ? `کاربر «${fromName}» برات ویس دایرکت فرستاده.`
        : `کاربر «${fromName}» برات پیام دایرکت فرستاده.`,
      user.userCode ? `آیدی: /user_${user.userCode}` : null,
      draft.replyToId ? "این پیام، پاسخ به پیام قبلی‌ات است." : null,
      "",
      isVoice
        ? "برای شنیدن ویس، روی دکمه زیر بزن 👇"
        : "برای دیدن متن، روی دکمه زیر بزن 👇",
    ]
      .filter(Boolean)
      .join("\n"),
    [
      isVoice ? "💌 New direct voice message" : "💌 New direct message",
      "",
      isVoice
        ? `«${fromName}» sent you a direct voice message.`
        : `«${fromName}» sent you a direct message.`,
      user.userCode ? `ID: /user_${user.userCode}` : null,
      draft.replyToId ? "This is a reply to your previous message." : null,
      "",
      isVoice
        ? "Tap the button below to listen 👇"
        : "Tap the button below to read it 👇",
    ]
      .filter(Boolean)
      .join("\n"),
  );

  let photo: unknown = null;
  try {
    const { publicPhotoWithBadge } = await import("../lib/faceBadgePhoto.js");
    photo = await publicPhotoWithBadge(ctx.api, user);
  } catch {
    photo = null;
  }

  // Mid-chat partner: same reachability as anonymous relay — never pessimistically block.
  const isCurrentChatPartner = user.chatPartnerId === target.id;
  const treatAsReachable =
    isCurrentChatPartner ||
    targetClearlyReceivesBot(target) ||
    (await partnerHasThisAsChatPartner(target.id));

  const delivered = await deliverDmNotify(
    ctx.api,
    // Same BigInt→string path as chat relay (never Number() — precision-safe).
    target.telegramId,
    notifyText,
    dmNotifyKeyboard(sent.id, targetLang),
    photo,
    { treatAsReachable },
  );

  if (!delivered.ok) {
    await prisma.user.update({
      where: { id: user.id },
      data: { diamonds: { increment: DIRECT_MSG_COST } },
    });
    await prisma.directMessage.update({
      where: { id: draft.id },
      data: { status: "draft" },
    });
    // Never label mid-chat partner as "blocked bot" — relay already proves delivery.
    const failReason =
      isCurrentChatPartner && delivered.reason === "blocked_bot"
        ? null
        : delivered.reason;
    await ctx.answerCallbackQuery({ text: tr(lang, "ارسال نشد", "Not sent") });
    await ctx.reply(
      dmDeliveryBlockedMessage(failReason, lang, delivered.detail),
      { reply_markup: restoreKeyboard },
    );
    return;
  }

  await patchUser(user.id, { state: restoreState, pendingDirectTo: null });
  await ctx.answerCallbackQuery({ text: tr(lang, "ارسال شد", "Sent") });
  await ctx
    .editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } })
    .catch(() => undefined);
  await ctx.reply(
    tr(
      lang,
      [
        "✅ پیام دایرکت ارسال شد.",
        `💰 ${formatNum(DIRECT_MSG_COST)} سکه کسر شد.`,
        `موجودی: ${formatNum(updated.diamonds)} 💰`,
      ].join("\n"),
      [
        "✅ Direct message sent.",
        `💰 ${formatNum(DIRECT_MSG_COST)} coin(s) deducted.`,
        `Balance: ${formatNum(updated.diamonds)} 💰`,
      ].join("\n"),
    ),
    { reply_markup: restoreKeyboard },
  );
}

/** فقط اولین مشاهده (sent → read) به فرستنده خبر می‌دهد */
async function notifyDirectMessageViewed(
  api: Api,
  viewerId: number,
  senderId: number,
): Promise<void> {
  if (viewerId === senderId) return;

  const { isBlockedEither } = await import("./block.js");
  const { ensureUserCode } = await import("../db/users.js");
  const { logger } = await import("../lib/logger.js");

  const [viewer, sender, blocked] = await Promise.all([
    prisma.user.findUnique({
      where: { id: viewerId },
      select: {
        id: true,
        displayName: true,
        userCode: true,
        deletedAt: true,
        telegramId: true,
        registered: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: senderId },
      select: {
        id: true,
        telegramId: true,
        language: true,
        deletedAt: true,
        registered: true,
      },
    }),
    isBlockedEither(viewerId, senderId),
  ]);

  if (!viewer || viewer.deletedAt || !viewer.registered) return;
  if (!sender || sender.deletedAt || !sender.registered) return;
  if (viewer.telegramId >= 9000000000n) return;
  if (sender.telegramId >= 9000000000n) return;
  if (blocked) return;

  const code = await ensureUserCode(viewer.id, viewer.userCode);
  if (!code) return;

  const lang = langOf(sender);
  const name =
    viewer.displayName?.trim() || tr(lang, "یک کاربر", "a user");
  const text = tr(
    lang,
    `👁 کاربر ${name} با آیدی /user_${code} پیام دایرکت شما را مشاهده کرد.`,
    `👁 User ${name} with ID /user_${code} viewed your direct message.`,
  );

  try {
    await api.sendMessage(Number(sender.telegramId), text);
  } catch (err) {
    logger.warn("dm.view.notify.fail", {
      viewerId,
      senderId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function viewDirectMessage(
  ctx: Context,
  viewerId: number,
  msgId: number,
) {
  const viewer = await prisma.user.findUnique({ where: { id: viewerId } });
  const lang = langOf(viewer);
  const msg = await prisma.directMessage.findUnique({ where: { id: msgId } });
  if (!msg || (msg.status !== "sent" && msg.status !== "read")) {
    await ctx.answerCallbackQuery({ text: tr(lang, "پیام پیدا نشد", "Message not found") });
    return;
  }
  if (msg.toUserId !== viewerId) {
    await ctx.answerCallbackQuery({
      text: tr(lang, "این پیام برای تو نیست", "This message isn't for you"),
    });
    return;
  }

  const from = await prisma.user.findUnique({ where: { id: msg.fromUserId } });
  const firstView = msg.status === "sent";
  if (firstView) {
    await prisma.directMessage.update({
      where: { id: msg.id },
      data: { status: "read" },
    });
    // fire-and-forget — باز شدن پیام نباید به‌خاطر نوتیف بشکند
    void notifyDirectMessageViewed(ctx.api, viewerId, msg.fromUserId);
  }

  const fromName = from?.displayName ?? tr(lang, "یک کاربر", "a user");
  await ctx.answerCallbackQuery({ text: tr(lang, "پیام باز شد", "Message opened") });
  const isVoice = Boolean(msg.voiceFileId);
  const body = tr(
    lang,
    [
      isVoice ? "🎤 ویس دایرکت" : "✉️ متن پیام دایرکت",
      "",
      `از طرف: ${fromName}${from?.age ? ` (${from.age})` : ""}`,
      from?.userCode ? `آیدی: /user_${from.userCode}` : null,
      msg.replyToId ? "📎 پاسخ به پیام قبلی" : null,
      "",
      "————————",
      msg.text,
      "————————",
      "",
      `برای پاسخ، ${formatNum(DIRECT_MSG_COST)} سکه لازم است.`,
    ]
      .filter(Boolean)
      .join("\n"),
    [
      isVoice ? "🎤 Direct voice" : "✉️ Direct message text",
      "",
      `From: ${fromName}${from?.age ? ` (${from.age})` : ""}`,
      from?.userCode ? `ID: /user_${from.userCode}` : null,
      msg.replyToId ? "📎 Reply to a previous message" : null,
      "",
      "————————",
      msg.text,
      "————————",
      "",
      `Replying costs ${formatNum(DIRECT_MSG_COST)} coin(s).`,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  if (msg.voiceFileId) {
    try {
      await ctx.replyWithVoice(msg.voiceFileId, {
        caption: body,
        reply_markup: dmViewKeyboard(msg.id, lang),
      });
      return;
    } catch (err) {
      console.error("dm view voice failed", err);
    }
  }

  if (from) {
    try {
      const { publicPhotoWithBadge } = await import("../lib/faceBadgePhoto.js");
      const photo = await publicPhotoWithBadge(ctx.api, from);
      await ctx.replyWithPhoto(photo, {
        caption: body,
        reply_markup: dmViewKeyboard(msg.id, lang),
      });
      return;
    } catch (err) {
      console.error("dm view photo failed", err);
    }
  }
  await ctx.reply(body, { reply_markup: dmViewKeyboard(msg.id, lang) });
}

export async function beginReplyToDirect(
  ctx: Context,
  user: {
    id: number;
    diamonds: number;
    chatPartnerId: number | null;
    secureChat: boolean;
    language?: string | null;
  },
  msgId: number,
) {
  const lang = langOf(user);
  const msg = await prisma.directMessage.findUnique({ where: { id: msgId } });
  if (!msg || (msg.status !== "sent" && msg.status !== "read")) {
    await ctx.answerCallbackQuery({ text: tr(lang, "پیام پیدا نشد", "Message not found") });
    return;
  }
  if (msg.toUserId !== user.id) {
    await ctx.answerCallbackQuery({ text: tr(lang, "اجازه نداری", "Not allowed") });
    return;
  }
  if (msg.fromUserId === user.id) {
    await ctx.answerCallbackQuery({ text: tr(lang, "نمی‌شود", "Can't do that") });
    return;
  }

  await ctx.answerCallbackQuery({ text: tr(lang, "پاسخت را بنویس", "Write your reply") });
  const ok = await beginDirectCompose(ctx, user, msg.fromUserId, {
    replyToId: msg.id,
  });
  if (!ok) return;
}

export async function cancelDirectCompose(userId: number) {
  await prisma.directMessage.deleteMany({
    where: { fromUserId: userId, status: "draft" },
  });
}
