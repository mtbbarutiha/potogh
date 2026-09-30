import type { Api, Context } from "grammy";
import { prisma } from "../db/prisma.js";
import { formatNum, FACE_VERIFY_REWARD } from "../data/packages.js";
import { ownPhotoWithBadge } from "../lib/faceBadgePhoto.js";
import {
  profilePanelKeyboard,
  adminPhotoKeyboard,
  adminFaceKeyboard,
  faceVerifyIntroKeyboard,
} from "../keyboards/main.js";
import { getAdminIds } from "../lib/admin.js";
import { formatAdminUserLine } from "./account.js";
import { langOf, tr, t, type Lang } from "../i18n/index.js";
import {
  cityLabel,
  provinceLabel,
  countryLabel,
} from "../data/locations.js";
import { profileCompletionLine } from "./profileCompletion.js";
import { isPermanentSilentUntil } from "./chatSilent.js";

/** نسخه دوزبانه‌ی photoStatusLabel برای کارت پروفایل */
function photoStatusLabelI18n(lang: Lang, status: string | null | undefined): string {
  switch (status) {
    case "pending":
      return tr(lang, "⏳ در انتظار تأیید ادمین", "⏳ Pending admin approval");
    case "approved":
      return tr(lang, "✅ تأیید شده", "✅ Approved");
    case "rejected":
      return tr(lang, "❌ رد شده — دوباره بفرست", "❌ Rejected — send again");
    default:
      return tr(lang, "🖼️ عکس پیش‌فرض", "🖼️ Default photo");
  }
}

export async function sendProfileCard(ctx: Context, userId: number) {
  let user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) {
    if (user?.deletedAt) {
      const { notifySelfAccountDeleted } = await import("./account.js");
      await notifySelfAccountDeleted(ctx, langOf(user), { previousId: user.id });
    }
    return;
  }
  if (!user.userCode) {
    const { ensureUserCode } = await import("../db/users.js");
    await ensureUserCode(user.id, user.userCode);
    user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;
  }

  const lang = langOf(user);
  const genderEmoji =
    user.gender === "female" ? "👩" : user.gender === "male" ? "🧔‍♂️" : "👤";
  const langTag = user.language === "en" ? "En" : "Fa";
  const interest = tr(lang, "👫 دوست‌یابی", "👫 Dating");
  const locParts = [
    cityLabel(user.city, lang, user.country ?? "IR", user.province),
    provinceLabel(user.province, lang, user.country ?? "IR"),
    countryLabel(user.country, lang),
  ].filter((p) => p && p !== "—");

  const hasGps = user.latitude != null && user.longitude != null;
  const { formatInterestsLine } = await import("../data/interests.js");
  const interests = formatInterestsLine(user.interests);
  const { countContacts } = await import("./contacts.js");
  const contactsCount = await countContacts(user.id);
  const { faceBadgeKind, faceBadgeLabel } = await import(
    "../lib/faceBadgePhoto.js"
  );
  const faceKind = faceBadgeKind(user, true);
  const text = [
    tr(lang, `❤️ ${formatNum(user.likesCount)} لایک`, `❤️ ${formatNum(user.likesCount)} likes`),
    "",
    profileCompletionLine(user, lang),
    user.userCode
      ? tr(lang, `آیدی: /user_${user.userCode}`, `ID: /user_${user.userCode}`)
      : null,
    `${genderEmoji} ${user.displayName ?? tr(lang, "بدون نام", "No name")} (${user.age ?? "—"}) | ${langTag}`,
    locParts.length ? locParts.join(" - ") : tr(lang, "مکان ثبت نشده", "Location not set"),
    interest,
    interests
      ? tr(lang, `✨ ${interests}`, `✨ ${interests}`)
      : tr(lang, "✨ علاقه‌مندی‌ها: هنوز انتخاب نشده", "✨ Interests: not selected yet"),
    "",
    tr(
      lang,
      `💰 ${formatNum(user.diamonds)} | 👁 ${formatNum(user.viewsCount)}`,
      `💰 ${formatNum(user.diamonds)} | 👁 ${formatNum(user.viewsCount)}`,
    ),
    tr(lang, `👥 مخاطبین: ${formatNum(contactsCount)}`, `👥 Contacts: ${formatNum(contactsCount)}`),
    tr(
      lang,
      `عکس: ${photoStatusLabelI18n("fa", user.photoStatus)}`,
      `Photo: ${photoStatusLabelI18n("en", user.photoStatus)}`,
    ),
    tr(
      lang,
      `🛡 ${faceBadgeLabel(faceKind, "fa")}`,
      `🛡 ${faceBadgeLabel(faceKind, "en")}`,
    ),
    hasGps
      ? tr(lang, "📍 موقعیت: ثبت‌شده (قابل ویرایش)", "📍 Location: set (editable)")
      : tr(lang, "📍 موقعیت: ثبت نشده", "📍 Location: not set"),
    !user.isActive ? tr(lang, "⏸️ حساب غیرفعال", "⏸️ Account deactivated") : null,
    user.chatSilentUntil && user.chatSilentUntil.getTime() > Date.now()
      ? isPermanentSilentUntil(user.chatSilentUntil)
        ? tr(lang, "🔇 سایلنت دائم درخواست چت", "🔇 Permanent chat-request silent")
        : tr(lang, "🔇 سایلنت درخواست چت فعال", "🔇 Chat-request silent mode on")
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const photo = await ownPhotoWithBadge(ctx.api, user);
  const sent = await ctx.replyWithPhoto(photo, {
    caption: text,
    reply_markup: profilePanelKeyboard(
      user.isActive,
      user.faceVerified,
      user.likesCount,
      contactsCount,
      user.language,
    ),
  });
  const { ownPhotoCacheKey, rememberPhotoFromMessage } = await import(
    "../lib/faceBadgePhoto.js"
  );
  rememberPhotoFromMessage(ownPhotoCacheKey(user), sent);
}

function genderLabelI18n(lang: Lang, g: string | null | undefined): string {
  if (g === "female") return tr(lang, "خانم", "Female");
  if (g === "male") return tr(lang, "آقا", "Male");
  return tr(lang, "نامشخص", "Unspecified");
}

/** پروفایل طرف مقابل وسط چت ناشناس */
export async function showPartnerProfileInChat(
  ctx: Context,
  viewerId: number,
  partnerId: number,
) {
  const me = await prisma.user.findUnique({ where: { id: viewerId } });
  const partner = await prisma.user.findUnique({ where: { id: partnerId } });
  const lang = langOf(me);
  if (!me || !partner || partner.deletedAt) {
    if (partner?.deletedAt) {
      const { targetAccountDeletedText } = await import("./account.js");
      await ctx.reply(targetAccountDeletedText(lang));
      return;
    }
    await ctx.reply(tr(lang, "پروفایل طرف مقابل در دسترس نیست.", "The partner's profile is not available."));
    return;
  }
  if (me.state !== "chatting" || me.chatPartnerId !== partner.id) {
    await ctx.reply(tr(lang, "الان با این کاربر در چت نیستی.", "You're not chatting with this user right now."));
    return;
  }

  const { formatNum } = await import("../data/packages.js");
  const { formatInterestsLine } = await import("../data/interests.js");
  const {
    publicPhotoWithBadge,
    publicPhotoCacheKey,
    rememberPhotoFromMessage,
    faceBadgeKind,
    faceBadgeLabel,
  } = await import("../lib/faceBadgePhoto.js");
  const { partnerInChatKeyboard, chattingKeyboard } = await import(
    "../keyboards/main.js"
  );
  const { isInContacts } = await import("./contacts.js");
  const { hasBlocked } = await import("./block.js");
  const inContacts = await isInContacts(viewerId, partner.id);
  const blocked = await hasBlocked(viewerId, partner.id);

  const loc = [
    cityLabel(partner.city, lang, partner.country ?? "IR", partner.province),
    provinceLabel(partner.province, lang, partner.country ?? "IR"),
  ]
    .filter((x) => x && x !== "—")
    .join(lang === "en" ? ", " : " - ");
  const faceKind = faceBadgeKind(partner, false);
  const badge = faceBadgeLabel(faceKind, lang);
  const interests = formatInterestsLine(partner.interests);
  const text = [
    tr(lang, "👤 پروفایل طرف مقابل", "👤 Partner profile"),
    "",
    tr(lang, `❤️ ${formatNum(partner.likesCount)} لایک`, `❤️ ${formatNum(partner.likesCount)} likes`),
    partner.userCode
      ? tr(lang, `آیدی: /user_${partner.userCode}`, `ID: /user_${partner.userCode}`)
      : null,
    `👤 ${partner.displayName ?? tr(lang, "بدون نام", "No name")} (${partner.age ?? "—"}) ${badge}`,
    `┃ ${genderLabelI18n(lang, partner.gender)}`,
    loc ? `┃ 📍 ${loc}` : null,
    partner.bio ? `┃ ${partner.bio}` : null,
    interests ? `┃ ✨ ${interests}` : null,
    tr(lang, `┃ 👁 ${formatNum(partner.viewsCount)}`, `┃ 👁 ${formatNum(partner.viewsCount)}`),
    "┗━━━━━━━━━━━━┛",
    "",
    tr(lang, "چت همچنان باز است — می‌توانی ادامه بدهی.", "The chat is still open — you can keep chatting."),
  ]
    .filter(Boolean)
    .join("\n");

  const photo = await publicPhotoWithBadge(ctx.api, partner);
  const sent = await ctx.replyWithPhoto(photo, {
    caption: text,
    reply_markup: partnerInChatKeyboard(
      partner.id,
      partner.likesCount,
      inContacts,
      me.language,
      blocked,
    ),
  });
  rememberPhotoFromMessage(publicPhotoCacheKey(partner), sent);
  try {
    const { notifyProfileViewSafe } = await import("./profileViewNotify.js");
    notifyProfileViewSafe(ctx.api, viewerId, partner.id);
  } catch {
    /* fail soft — viewing still succeeded */
  }
  // کیبورد چت را دوباره نشان بده تا گم نشود
  await ctx.reply(t(lang, "chat_still_open"), {
    reply_markup: chattingKeyboard(me.secureChat, me.language),
  });
}

/** نمایش عکس پروفایل + راهنمای احراز (مثل دوردور) */
export async function sendFaceVerifyIntro(
  ctx: Context,
  user: {
    photoFileId: string | null;
    photoStatus: string;
    faceStatus: string;
    language?: string | null;
  },
) {
  const lang = langOf(user);
  if (user.photoStatus !== "approved" || !user.photoFileId) {
    await ctx.reply(
      [
        tr(
          lang,
          "برای احراز چهره اول باید عکس پروفایل تأییدشده داشته باشی.",
          "You need an approved profile photo before verifying your face.",
        ),
        tr(
          lang,
          "از پروفایل → تکمیل پروفایل / ارسال عکس، عکس بفرست.",
          "Send one from Profile → Complete profile / Send photo.",
        ),
      ].join("\n"),
    );
    return false;
  }

  const pendingNote =
    user.faceStatus === "pending"
      ? "\n\n" +
        tr(
          lang,
          "⏳ یک درخواست قبلی هنوز در صف ادمین است؛ با ارسال ویدیو جدید جایگزین می‌شود.",
          "⏳ A previous request is still pending admin review; sending a new video will replace it.",
        )
      : "";

  await ctx.replyWithPhoto(user.photoFileId, {
    caption: [
      tr(lang, "👆 این عکس ۱ پروفایل شماست", "👆 This is your profile photo #1"),
      "",
      tr(lang, "⚠️ توجه مهم", "⚠️ Important note"),
      tr(
        lang,
        "ویدیو مسیج ارسالی برای احراز چهره باید با عکس ۱ پروفایل شما که در بالا نمایش داده شده، تطابق چهره داشته باشد.",
        "The video message you send for face verification must match the face in profile photo #1 shown above.",
      ),
      "",
      tr(
        lang,
        `🎁 جایزه پس از تأیید ادمین: ${formatNum(FACE_VERIFY_REWARD)} سکه`,
        `🎁 Reward once approved by an admin: ${formatNum(FACE_VERIFY_REWARD)} coins`,
      ),
      pendingNote,
    ]
      .filter(Boolean)
      .join("\n"),
    reply_markup: faceVerifyIntroKeyboard(lang),
  });
  return true;
}

export async function notifyAdminsPhoto(
  api: Api,
  user: {
    id: number;
    telegramId: bigint;
    displayName: string | null;
    username?: string | null;
  },
  fileId: string,
) {
  const admins = getAdminIds();
  const info = await formatAdminUserLine(user);
  for (const adminId of admins) {
    await api
      .sendPhoto(adminId, fileId, {
        caption: ["📷 عکس پروفایل جدید برای تأیید", info].join("\n"),
        reply_markup: adminPhotoKeyboard(user.id),
      })
      .catch(() => undefined);
  }
}

export async function notifyAdminsFace(
  api: Api,
  user: {
    id: number;
    telegramId: bigint;
    displayName: string | null;
    username?: string | null;
    photoFileId?: string | null;
  },
  videoFileId: string,
  kind: "video_note" | "video",
) {
  const admins = getAdminIds();
  const info = await formatAdminUserLine(user);
  const caption = [
    "✅ درخواست احراز چهره",
    "عکس پروفایل ↑ و ویدیو ↓ را مقایسه کن",
    info,
    `نوع: ${kind === "video_note" ? "ویدیو مسیج (دایره‌ای)" : "ویدیو"}`,
  ].join("\n");

  for (const adminId of admins) {
    try {
      if (user.photoFileId) {
        await api.sendPhoto(adminId, user.photoFileId, {
          caption: "📷 عکس پروفایل کاربر",
        });
      }
      if (kind === "video_note") {
        await api.sendVideoNote(adminId, videoFileId);
        await api.sendMessage(adminId, caption, {
          reply_markup: adminFaceKeyboard(user.id),
        });
      } else {
        await api.sendVideo(adminId, videoFileId, {
          caption,
          reply_markup: adminFaceKeyboard(user.id),
        });
      }
    } catch {
      // ignore per-admin failures
    }
  }
}

/** ارسال مجدد مدیای احراز برای ادمین */
export async function sendPendingFaceToAdmin(
  api: Api,
  adminId: number,
  user: {
    id: number;
    displayName: string | null;
    username?: string | null;
    gender?: string | null;
    age?: number | null;
    photoFileId?: string | null;
    facePendingFileId: string | null;
    facePendingKind?: string | null;
    telegramId: bigint;
  },
) {
  if (!user.facePendingFileId) return;
  const info = await formatAdminUserLine(user);
  const kind =
    user.facePendingKind === "video" ? "video" : "video_note";
  const caption = [
    "✅ احراز چهره — در انتظار",
    info,
    `${user.gender === "female" ? "خانم" : user.gender === "male" ? "آقا" : "—"} | ${user.age ?? "—"}`,
  ].join("\n");

  if (user.photoFileId) {
    await api
      .sendPhoto(adminId, user.photoFileId, { caption: "📷 عکس پروفایل" })
      .catch(() => undefined);
  }
  if (kind === "video_note") {
    await api
      .sendVideoNote(adminId, user.facePendingFileId)
      .catch(() => undefined);
    await api
      .sendMessage(adminId, caption, {
        reply_markup: adminFaceKeyboard(user.id),
      })
      .catch(() => undefined);
  } else {
    await api
      .sendVideo(adminId, user.facePendingFileId, {
        caption,
        reply_markup: adminFaceKeyboard(user.id),
      })
      .catch(() => undefined);
  }
}
