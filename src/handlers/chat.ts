import { Composer, type Api } from "grammy";
import { findByTelegram, patchUser } from "../db/users.js";
import { prisma } from "../db/prisma.js";
import { mainKeyboard } from "../keyboards/main.js";
import { allMenuButtonTexts, btnAll, langOf, t } from "../i18n/index.js";
import { logChatMessage } from "../services/chatLog.js";
import { setSecureChat } from "../services/match.js";
import {
  forbiddenContactMessage,
  rejectForbiddenContact,
} from "../services/contactGuard.js";
import { checkProfileCompletionRewards } from "../services/profileCompletion.js";
import { telegramChatId } from "../lib/telegramSafe.js";
export const chatHandler = new Composer();

const MENU = allMenuButtonTexts();
const SECURE_ON = new Set(btnAll("SECURE_CHAT_ON"));
const SECURE_OFF = new Set(btnAll("SECURE_CHAT_OFF"));

type ChatUser = {
  id: number;
  telegramId: bigint;
  secureChat: boolean;
  language?: string | null;
  lang?: string | null;
};

async function getChattingPair(userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.state !== "chatting" || !user.chatPartnerId) return null;
  const partner = await prisma.user.findUnique({
    where: { id: user.chatPartnerId },
  });
  // Mutual link is enough — partner may briefly be await_direct_msg etc.
  if (!partner || partner.chatPartnerId !== user.id) {
    return { user, partner: null as null };
  }
  return { user, partner };
}

/** پایان اجباری چت + اطلاع به ناظران (مسیرهای orphan در رله) */
async function forceEndChatAndNotify(
  api: Api,
  userIds: number[],
) {
  const unique = [...new Set(userIds.filter((id) => Number.isFinite(id)))];
  for (const id of unique) {
    await patchUser(id, {
      state: "idle",
      chatPartnerId: null,
      secureChat: false,
    });
  }
  try {
    const { notifyChatEndWatchers } = await import("../services/chatEndWatch.js");
    for (const id of unique) {
      await notifyChatEndWatchers(api, id);
    }
  } catch (err) {
    console.error("chatEndWatch notify after force-end failed", err);
  }
}

/** گزینه‌های رله — بدون reply_markup تا کیبورد پایین استاندارد تلگرام بماند */
function partnerRelayOpts(
  user: ChatUser,
  partner: ChatUser,
  extra: Record<string, unknown> = {},
) {
  const secure = user.secureChat || partner.secureChat;
  return {
    ...extra,
    protect_content: secure,
  };
}

async function logRelay(
  user: { id: number; telegramId: bigint },
  partner: { id: number; telegramId: bigint },
  userMsgId: number,
  partnerMsgId: number,
) {
  // غیرمسدود — سرعت رله چت مهم‌تر از لاگ است
  void Promise.all([
    logChatMessage(partner.id, user.id, partner.telegramId, partnerMsgId),
    logChatMessage(user.id, partner.id, user.telegramId, userMsgId),
  ]).catch((err) => console.error("logRelay failed", err));
}

async function relayMessage(
  api: Api,
  user: { id: number; telegramId: bigint },
  partner: { id: number; telegramId: bigint },
  senderMessageId: number,
  relay: () => Promise<{ message_id: number }>,
): Promise<void> {
  const sent = await relay();
  await logRelay(user, partner, senderMessageId, sent.message_id);
}

chatHandler.on("message:text", async (ctx, next) => {
  const text = ctx.message.text.trim();
  if (text.startsWith("/")) return next();

  const from = ctx.from;
  if (!from) return next();
  const user = await findByTelegram(from.id);
  if (!user) return next();

  const lang = langOf(user);

  if (SECURE_ON.has(text) || SECURE_OFF.has(text)) {
    if (user.state !== "chatting") {
      await ctx.reply(t(lang, "not_chatting"));
      return;
    }
    const ok = await setSecureChat(ctx.api, user.id, SECURE_ON.has(text));
    if (!ok) {
      await ctx.reply(t(lang, "chat_ended"), {
        reply_markup: mainKeyboard(lang),
      });
    }
    return;
  }

  if (MENU.has(text)) {
    // Menu handlers already ran earlier in the chain. If we still reach here
    // while chatting (unhandled menu label), do NOT fall through to
    // sessionRestore — that was jumping users back to the main menu.
    if (user.state === "chatting") return;
    return next();
  }

  if (user.state === "edit_name") {
    if (text.length < 2 || text.length > 24) {
      await ctx.reply("نام باید ۲ تا ۲۴ حرف باشد.");
      return;
    }
    if (await rejectForbiddenContact(ctx, text, lang, ctx.message.entities)) {
      return;
    }
    await patchUser(user.id, { displayName: text, state: "idle" });
    await checkProfileCompletionRewards(user.id, {
      api: ctx.api,
      telegramId: user.telegramId,
    });
    await ctx.reply(
      lang === "en" ? "Name updated ✅" : "نام به‌روز شد ✅",
      { reply_markup: mainKeyboard(lang) },
    );
    return;
  }
  if (user.state === "edit_bio") {
    if (text.length > 150) {
      await ctx.reply("بیو حداکثر ۱۵۰ حرف.");
      return;
    }
    if (await rejectForbiddenContact(ctx, text, lang, ctx.message.entities)) {
      return;
    }
    await patchUser(user.id, { bio: text, state: "idle" });
    await checkProfileCompletionRewards(user.id, {
      api: ctx.api,
      telegramId: user.telegramId,
    });
    await ctx.reply(
      lang === "en" ? "Bio saved ✅" : "بیو ذخیره شد ✅",
      { reply_markup: mainKeyboard(lang) },
    );
    return;
  }

  if (user.state === "await_special") {
    let code = text.trim();
    const m = code.match(/anon_([a-zA-Z0-9]+)/);
    if (m) code = m[1]!;
    else if (code.startsWith("anon_")) code = code.slice(5);

    const target = await prisma.user.findUnique({ where: { anonCode: code } });
    if (!target || target.deletedAt || target.id === user.id) {
      if (target?.deletedAt) {
        const { notifyTargetAccountDeleted } = await import("../services/account.js");
        await notifyTargetAccountDeleted(ctx, lang);
        return;
      }
      await ctx.reply(
        lang === "en"
          ? "Contact not found. Send a valid anonymous link/code, or go back."
          : "مخاطب پیدا نشد. لینک یا کد ناشناس درست را بفرست، یا بازگشت بزن.",
      );
      return;
    }
    const { sendChatRequest } = await import("../services/match.js");
    const result = await sendChatRequest(ctx.api, user.id, target.id);
    if (result === "demo") {
      await patchUser(user.id, { state: "idle" });
      await ctx.reply(
        lang === "en" ? "This is a demo profile." : "این پروفایل نمونه است.",
        { reply_markup: mainKeyboard(lang) },
      );
      return;
    }
    if (result === "pending") {
      await patchUser(user.id, { state: "idle" });
      await ctx.reply(
        lang === "en"
          ? "A previous request is still open."
          : "درخواست قبلی هنوز باز است.",
        { reply_markup: mainKeyboard(lang) },
      );
      return;
    }
    if (result === "silent") {
      await patchUser(user.id, { state: "idle" });
      const { replySilentReject } = await import("../services/chatSilent.js");
      await replySilentReject(ctx, target.id, lang);
      return;
    }
    if (result !== "ok") {
      await patchUser(user.id, { state: "idle" });
      await ctx.reply(
        lang === "en"
          ? "Can't send a request right now. Try again later."
          : "الان نمی‌شود درخواست فرستاد. بعداً دوباره امتحان کن.",
        { reply_markup: mainKeyboard(lang) },
      );
      return;
    }
    await patchUser(user.id, { state: "idle" });
    return;
  }

  if (user.state === "await_anon_msg" && user.pendingAnonTo) {
    if (await rejectForbiddenContact(ctx, text, lang, ctx.message.entities)) {
      return;
    }
    const target = await prisma.user.findUnique({
      where: { anonCode: user.pendingAnonTo },
    });
    if (!target) {
      await patchUser(user.id, { state: "idle", pendingAnonTo: null });
      await ctx.reply(
        lang === "en" ? "Link owner not found." : "صاحب لینک پیدا نشد.",
        { reply_markup: mainKeyboard(lang) },
      );
      return;
    }
    await prisma.anonMessage.create({
      data: { toUserId: target.id, fromUserId: user.id, text },
    });
    await ctx.api.sendMessage(
      telegramChatId(target.telegramId),
      ["🕵️‍♂️ پیام ناشناس جدید:", "", text].join("\n"),
    );
    await patchUser(user.id, { state: "idle", pendingAnonTo: null });
    await ctx.reply(
      lang === "en" ? "Anonymous message sent ✅" : "پیام ناشناس ارسال شد ✅",
      { reply_markup: mainKeyboard(lang) },
    );
    return;
  }

  // DM compose works mid-chat (state may stay chatting with pendingDirectTo)
  if (user.pendingDirectTo) {
    const { handleDirectMsgTyped } = await import("../services/directMsg.js");
    await handleDirectMsgTyped(ctx, user.id, text);
    return;
  }

  if (user.state === "chatting" && user.chatPartnerId) {
    if (await rejectForbiddenContact(ctx, text, lang, ctx.message.entities)) {
      return;
    }
    const pair = await getChattingPair(user.id);
    if (!pair?.partner) {
      await forceEndChatAndNotify(ctx.api, [user.id]);
      await ctx.reply(
        lang === "en"
          ? "Chat ended. Connect again from the menu."
          : "چت قطع شده. از منو دوباره وصل شو.",
        { reply_markup: mainKeyboard(lang) },
      );
      return;
    }
    const partner = pair.partner;
    if (partner.telegramId >= 9000000000n) {
      await forceEndChatAndNotify(ctx.api, [user.id, partner.id]);
      await ctx.reply(
        lang === "en"
          ? "This is a demo contact — not a real chat."
          : "این مخاطب نمونه است — چت واقعی نیست.",
        { reply_markup: mainKeyboard(lang) },
      );
      return;
    }
    try {
      await relayMessage(
        ctx.api,
        user,
        partner,
        ctx.message.message_id,
        () =>
          ctx.api.sendMessage(
            telegramChatId(partner.telegramId),
            text,
            partnerRelayOpts(user, partner),
          ),
      );
    } catch (err) {
      console.error("chat relay failed", user.id, "->", partner.id, err);
      await forceEndChatAndNotify(ctx.api, [user.id, partner.id]);
      await ctx.reply(
        lang === "en" ? "Send failed — chat ended." : "ارسال نشد — چت قطع شد.",
        { reply_markup: mainKeyboard(lang) },
      );
    }
    return;
  }

  return next();
});

/** رله عکس */
chatHandler.on("message:photo", async (ctx, next) => {
  const from = ctx.from;
  if (!from) return next();
  const user = await findByTelegram(from.id);
  if (!user || user.state !== "chatting") return next();
  const lang = langOf(user);

  const pair = await getChattingPair(user.id);
  if (!pair?.partner) {
    await forceEndChatAndNotify(ctx.api, [user.id]);
    await ctx.reply(t(lang, "chat_ended"), { reply_markup: mainKeyboard(lang) });
    return;
  }
  const partner = pair.partner;
  if (partner.telegramId >= 9000000000n) {
    await ctx.reply("مخاطب نمونه است.");
    return;
  }

  const photos = ctx.message.photo;
  const best = photos[photos.length - 1]!;
  const secure = user.secureChat || partner.secureChat;
  if (
    ctx.message.caption &&
    (await rejectForbiddenContact(
      ctx,
      ctx.message.caption,
      lang,
      ctx.message.caption_entities,
    ))
  ) {
    return;
  }

  try {
    await relayMessage(
      ctx.api,
      user,
      partner,
      ctx.message.message_id,
      () =>
        ctx.api.sendPhoto(
          telegramChatId(partner.telegramId),
          best.file_id,
          partnerRelayOpts(user, partner, {
            ...(ctx.message.caption ? { caption: ctx.message.caption } : {}),
          }),
        ),
    );
    if (secure) {
      const ack = await ctx.reply("🔒 عکس با چت امن ارسال شد.");
      await logChatMessage(user.id, partner.id, user.telegramId, ack.message_id);
    }
  } catch (err) {
    console.error("photo relay failed", err);
    await ctx.reply("ارسال عکس نشد.");
  }
});

/** رله ویدیو */
chatHandler.on("message:video", async (ctx, next) => {
  const from = ctx.from;
  if (!from) return next();
  const user = await findByTelegram(from.id);
  if (!user || user.state !== "chatting") return next();
  const lang = langOf(user);

  const pair = await getChattingPair(user.id);
  if (!pair?.partner) {
    await forceEndChatAndNotify(ctx.api, [user.id]);
    await ctx.reply(t(lang, "chat_ended"), { reply_markup: mainKeyboard(lang) });
    return;
  }
  const partner = pair.partner;
  if (partner.telegramId >= 9000000000n) {
    await ctx.reply("مخاطب نمونه است.");
    return;
  }

  const secure = user.secureChat || partner.secureChat;
  if (
    ctx.message.caption &&
    (await rejectForbiddenContact(
      ctx,
      ctx.message.caption,
      lang,
      ctx.message.caption_entities,
    ))
  ) {
    return;
  }

  try {
    await relayMessage(
      ctx.api,
      user,
      partner,
      ctx.message.message_id,
      () =>
        ctx.api.sendVideo(
          telegramChatId(partner.telegramId),
          ctx.message.video.file_id,
          partnerRelayOpts(user, partner, {
            ...(ctx.message.caption ? { caption: ctx.message.caption } : {}),
          }),
        ),
    );
    if (secure) {
      const ack = await ctx.reply("🔒 ویدیو با چت امن ارسال شد.");
      await logChatMessage(user.id, partner.id, user.telegramId, ack.message_id);
    }
  } catch (err) {
    console.error("video relay failed", err);
    await ctx.reply("ارسال ویدیو نشد.");
  }
});

/** رله ویدیو مسیج (دایره‌ای) */
chatHandler.on("message:video_note", async (ctx, next) => {
  const from = ctx.from;
  if (!from) return next();
  const user = await findByTelegram(from.id);
  if (!user || user.state !== "chatting") return next();
  const lang = langOf(user);

  const pair = await getChattingPair(user.id);
  if (!pair?.partner) {
    await forceEndChatAndNotify(ctx.api, [user.id]);
    await ctx.reply(t(lang, "chat_ended"), { reply_markup: mainKeyboard(lang) });
    return;
  }
  const partner = pair.partner;
  if (partner.telegramId >= 9000000000n) {
    await ctx.reply("مخاطب نمونه است.");
    return;
  }

  try {
    await relayMessage(
      ctx.api,
      user,
      partner,
      ctx.message.message_id,
      () =>
        ctx.api.sendVideoNote(
          telegramChatId(partner.telegramId),
          ctx.message.video_note.file_id,
          partnerRelayOpts(user, partner),
        ),
    );
  } catch (err) {
    console.error("video_note relay failed", err);
    await ctx.reply("ارسال ویدیومسیج نشد.");
  }
});

/** ویس در حالت نوشتن پیام دایرکت (حتی وسط چت ناشناس با pendingDirectTo) */
chatHandler.on("message:voice", async (ctx, next) => {
  const from = ctx.from;
  if (!from) return next();
  const user = await findByTelegram(from.id);
  if (!user || !user.pendingDirectTo) {
    return next();
  }
  const voice = ctx.message.voice;
  if (!voice) return next();
  const { handleDirectMsgVoice } = await import("../services/directMsg.js");
  await handleDirectMsgVoice(ctx, user.id, voice.file_id, ctx.message.caption);
});

/** رله ویس / استیکر / گیف / صوت / فایل */
chatHandler.on(
  [
    "message:voice",
    "message:sticker",
    "message:animation",
    "message:audio",
    "message:document",
  ],
  async (ctx, next) => {
    const from = ctx.from;
    if (!from) return next();
    const user = await findByTelegram(from.id);
    if (!user || user.state !== "chatting") return next();
    const lang = langOf(user);

    const pair = await getChattingPair(user.id);
    if (!pair?.partner) {
      await forceEndChatAndNotify(ctx.api, [user.id]);
      await ctx.reply(t(lang, "chat_ended"), {
        reply_markup: mainKeyboard(lang),
      });
      return;
    }
    const partner = pair.partner;
    if (partner.telegramId >= 9000000000n) {
      await ctx.reply("مخاطب نمونه است.");
      return;
    }

    const msg = ctx.message;

    if (
      msg.caption &&
      (await rejectForbiddenContact(
        ctx,
        msg.caption,
        lang,
        msg.caption_entities,
      ))
    ) {
      return;
    }

    try {
      await relayMessage(
        ctx.api,
        user,
        partner,
        ctx.message.message_id,
        async () => {
          if (msg.voice) {
            return ctx.api.sendVoice(
              telegramChatId(partner.telegramId),
              msg.voice.file_id,
              partnerRelayOpts(user, partner, {
                ...(msg.caption ? { caption: msg.caption } : {}),
              }),
            );
          }
          if (msg.sticker) {
            return ctx.api.sendSticker(
              telegramChatId(partner.telegramId),
              msg.sticker.file_id,
              partnerRelayOpts(user, partner),
            );
          }
          if (msg.animation) {
            return ctx.api.sendAnimation(
              telegramChatId(partner.telegramId),
              msg.animation.file_id,
              partnerRelayOpts(user, partner, {
                ...(msg.caption ? { caption: msg.caption } : {}),
              }),
            );
          }
          if (msg.audio) {
            return ctx.api.sendAudio(
              telegramChatId(partner.telegramId),
              msg.audio.file_id,
              partnerRelayOpts(user, partner, {
                ...(msg.caption ? { caption: msg.caption } : {}),
              }),
            );
          }
          if (msg.document) {
            return ctx.api.sendDocument(
              telegramChatId(partner.telegramId),
              msg.document.file_id,
              partnerRelayOpts(user, partner, {
                ...(msg.caption ? { caption: msg.caption } : {}),
              }),
            );
          }
          throw new Error("unsupported media relay");
        },
      );
    } catch (err) {
      console.error("media relay failed", err);
      await ctx.reply(
        lang === "en" ? "Couldn't send this media." : "ارسال این فایل نشد.",
      );
    }
  },
);

/** کارت مخاطب تلگرام — برای کاربران ثبت‌نام‌شده مسدود */
chatHandler.on("message:contact", async (ctx, next) => {
  const from = ctx.from;
  if (!from) return next();
  const user = await findByTelegram(from.id);
  if (!user?.registered) return next();
  await ctx.reply(forbiddenContactMessage(langOf(user), "contact_card"));
});
