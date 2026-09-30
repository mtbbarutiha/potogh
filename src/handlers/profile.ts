import { Composer } from "grammy";
import type { Context } from "grammy";
import { findByTelegram, patchUser } from "../db/users.js";
import { requireRegistered } from "../services/register.js";
import { prisma } from "../db/prisma.js";
import {
  mainKeyboard,
  profileEditKeyboard,
  confirmDeleteKeyboard,
  cancelKeyboard,
  accountManageKeyboard,
} from "../keyboards/main.js";
import {
  formatNum,
  FACE_VERIFY_REWARD,
  DELETE_ACCOUNT_COST,
} from "../data/packages.js";
import {
  sendProfileCard,
  notifyAdminsPhoto,
  notifyAdminsFace,
  sendFaceVerifyIntro,
} from "../services/profile.js";
import {
  profileCompletePanelText,
  checkProfileCompletionRewards,
} from "../services/profileCompletion.js";
import { langOf, tr } from "../i18n/index.js";
import { isAdmin } from "../lib/admin.js";

export const profileHandler = new Composer();

profileHandler.callbackQuery("prof:edit", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  await ctx.reply("چه چیزی را ویرایش می‌کنی؟", {
    reply_markup: profileEditKeyboard(),
  });
});

profileHandler.callbackQuery("prof:complete", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  const lang = langOf(user);
  await ctx.reply(profileCompletePanelText(user, lang), {
    reply_markup: profileEditKeyboard(user.language)
      .row()
      .text(tr(lang, "📷 ارسال عکس", "📷 Send photo"), "prof:photo")
      .text(tr(lang, "احراز چهره", "Face verify"), "prof:face")
      .row()
      .text(tr(lang, "📍 موقعیت", "📍 Location"), "edit:location"),
  });
});

profileHandler.callbackQuery("prof:likes", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery({
    text: `❤️ تا الان ${formatNum(user.likesCount)} لایک گرفتی`,
    show_alert: true,
  });
});

profileHandler.callbackQuery("prof:contacts", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  const { sendContactsList } = await import("../services/contacts.js");
  await sendContactsList(ctx, user.id);
});

profileHandler.callbackQuery("prof:blocked", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  const lang = user.language === "en" ? "en" : "fa";
  const { listBlockedUsers } = await import("../services/block.js");
  const rows = await listBlockedUsers(user.id);
  if (!rows.length) {
    await ctx.reply(
      lang === "en"
        ? "🚫 Blocked users\n\nYou haven't blocked anyone."
        : "🚫 بلاک‌شده‌ها\n\nهنوز کسی را بلاک نکرده‌ای.",
    );
    return;
  }
  const { InlineKeyboard } = await import("grammy");
  const kb = new InlineKeyboard();
  for (const row of rows) {
    const u = row.blocked;
    if (!u || u.deletedAt) continue;
    const label = `${u.displayName ?? (lang === "en" ? "User" : "کاربر")}${u.age != null ? ` · ${u.age}` : ""}`;
    kb.text(label, u.userCode ? `open:${u.userCode}` : `block:off:${u.id}`).row();
    kb.text(
      lang === "en" ? "🔓 Unblock" : "🔓 رفع بلاک",
      `block:off:${u.id}`,
    )
      .success()
      .row();
  }
  await ctx.reply(
    lang === "en"
      ? `🚫 Blocked users (${rows.length})\nTap Unblock to restore.`
      : `🚫 بلاک‌شده‌ها (${rows.length})\nبرای رفع بلاک، دکمه را بزن.`,
    { reply_markup: kb },
  );
});

profileHandler.callbackQuery("prof:manage", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  const lang = langOf(user);
  await ctx.reply(
    [
      tr(lang, "🔴 مدیریت حساب", "🔴 Account management"),
      "",
      tr(lang, "یکی را انتخاب کن:", "Pick one:"),
      tr(
        lang,
        "• غیرفعال‌سازی: از اکسپلور مخفی می‌شوی (قابل برگشت)",
        "• Deactivate: hide from explore (reversible)",
      ),
      tr(
        lang,
        `• حذف دائمی: حساب پاک می‌شود و برنمی‌گردد — هزینه ${formatNum(DELETE_ACCOUNT_COST)} سکه`,
        `• Permanent delete: account is wiped — costs ${formatNum(DELETE_ACCOUNT_COST)} coins`,
      ),
    ].join("\n"),
    { reply_markup: accountManageKeyboard(user.isActive, lang) },
  );
});

profileHandler.callbackQuery("prof:silent", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  const {
    ensureChatSilentState,
    silentPanelText,
    chatSilentKeyboard,
  } = await import("../services/chatSilent.js");
  const st = await ensureChatSilentState(user.id);
  const lang = user.language === "en" ? "en" : "fa";
  await ctx.reply(silentPanelText(st.silent, st.until, lang), {
    reply_markup: chatSilentKeyboard(st.silent, lang),
  });
});

profileHandler.callbackQuery(/^silent:(1h|1d|forever|off)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const action = ctx.match[1] as "1h" | "1d" | "forever" | "off";
  const lang = user.language === "en" ? "en" : "fa";
  const {
    setChatSilent,
    clearChatSilent,
    silentPanelText,
    chatSilentKeyboard,
  } = await import("../services/chatSilent.js");

  if (action === "off") {
    await clearChatSilent(user.id);
    await ctx.answerCallbackQuery({
      text: lang === "en" ? "Back to normal" : "حالت عادی",
    });
    await ctx.reply(silentPanelText(false, null, lang), {
      reply_markup: chatSilentKeyboard(false, lang),
    });
    return;
  }

  const until = await setChatSilent(user.id, action);
  await ctx.answerCallbackQuery({
    text:
      action === "forever"
        ? lang === "en"
          ? "Permanent silent on"
          : "سایلنت دائم فعال شد"
        : lang === "en"
          ? "Silent enabled"
          : "سایلنت فعال شد",
  });
  await ctx.reply(silentPanelText(true, until, lang), {
    reply_markup: chatSilentKeyboard(true, lang),
  });
});

profileHandler.callbackQuery("prof:back", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  await sendProfileCard(ctx, user.id);
});

profileHandler.callbackQuery("prof:close", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "بسته شد" });
  await ctx.reply("منوی اصلی:", { reply_markup: mainKeyboard() });
});

profileHandler.callbackQuery("prof:interactions", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();

  const since = new Date(Date.now() - 24 * 3600_000);
  const [likes24, views24, recentLikes] = await Promise.all([
    prisma.interaction.count({
      where: { toUserId: user.id, type: "like", createdAt: { gte: since } },
    }),
    prisma.interaction.count({
      where: { toUserId: user.id, type: "view", createdAt: { gte: since } },
    }),
    prisma.interaction.findMany({
      where: { toUserId: user.id, type: "like" },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { fromUser: true },
    }),
  ]);

  const lines = recentLikes.map((i, idx) => {
    const n = i.fromUser.displayName ?? "ناشناس";
    const g = i.fromUser.gender === "female" ? "👩" : i.fromUser.gender === "male" ? "👨" : "👤";
    return `${idx + 1}. ${g} ${n} — ${i.createdAt.toLocaleString("fa-IR")}`;
  });

  await ctx.reply(
    [
      "┏━━ 💬 تعاملات ━━┓",
      `┃ ❤️ لایک کل: ${formatNum(user.likesCount)}`,
      `┃ ❤️ لایک ۲۴س: ${formatNum(likes24)}`,
      `┃ 👁 بازدید کل: ${formatNum(user.viewsCount)}`,
      `┃ 👁 بازدید ۲۴س: ${formatNum(views24)}`,
      `┃ 💬 چت‌ها: ${formatNum(user.chatsCount)}`,
      "┗━━━━━━━━━━━━┛",
      "",
      "آخرین لایک‌ها:",
      lines.length ? lines.join("\n") : "هنوز لایکی نداری.",
    ].join("\n"),
    { reply_markup: mainKeyboard() },
  );
});

profileHandler.callbackQuery("prof:photo", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await patchUser(user.id, { state: "edit_photo" });
  await ctx.answerCallbackQuery();
  await ctx.reply(
    [
      "📷 عکس پروفایل",
      "",
      "یک عکس واضح از خودت بفرست.",
      "تا تأیید ادمین، برای بقیه همان عکس پیش‌فرض نمایش داده می‌شود.",
      user.photoStatus === "pending"
        ? "⏳ الان یک عکس در صف تأیید داری."
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    { reply_markup: cancelKeyboard() },
  );
});

profileHandler.callbackQuery("prof:face", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  if (user.faceVerified) {
    await ctx.answerCallbackQuery({ text: "قبلاً تأیید شده" });
    await ctx.reply("✅ احراز چهره تو قبلاً تأیید شده است.");
    return;
  }
  await ctx.answerCallbackQuery();
  await sendFaceVerifyIntro(ctx, user);
});

profileHandler.callbackQuery("face:ok", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  if (user.faceVerified) {
    await ctx.answerCallbackQuery({ text: "قبلاً تأیید شده" });
    return;
  }
  if (user.photoStatus !== "approved" || !user.photoFileId) {
    await ctx.answerCallbackQuery({ text: "اول عکس تأییدشده لازم است" });
    return;
  }
  await patchUser(user.id, { state: "edit_face" });
  await ctx.answerCallbackQuery({ text: "ویدیو بفرست" });
  await ctx.reply(
    [
      "🎥 الان یک ویدیو مسیج (دایره‌ای) از خودت بفرست.",
      "",
      "چهره‌ات باید با عکس پروفایل بالا یکی باشد.",
      "می‌توانی ویدیو معمولی هم بفرستی.",
      "",
      `🎁 جایزه تأیید: ${formatNum(FACE_VERIFY_REWARD)} سکه`,
    ].join("\n"),
    { reply_markup: cancelKeyboard() },
  );
});

profileHandler.callbackQuery("face:photo", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await patchUser(user.id, { state: "edit_photo" });
  await ctx.answerCallbackQuery();
  await ctx.reply(
    [
      "📷 عکس پروفایل جدید را بفرست.",
      "بعد از تأیید ادمین، دوباره احراز چهره را شروع کن.",
    ].join("\n"),
    { reply_markup: cancelKeyboard() },
  );
});

profileHandler.callbackQuery("face:cancel", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await patchUser(user.id, { state: "idle" });
  await ctx.answerCallbackQuery({ text: "لغو شد" });
  await ctx.reply("احراز چهره لغو شد.", { reply_markup: mainKeyboard() });
});

profileHandler.callbackQuery("prof:toggle", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const next = !user.isActive;
  await patchUser(user.id, { isActive: next });
  await ctx.answerCallbackQuery({
    text: next ? "حساب فعال شد" : "حساب غیرفعال شد",
  });
  await ctx.reply(
    next
      ? "▶️ حسابت فعال شد و دوباره در اکسپلور دیده می‌شوی."
      : "⏸️ حسابت غیرفعال شد و از اکسپلور مخفی شدی. هر وقت خواستی دوباره فعال کن.",
    { reply_markup: mainKeyboard() },
  );
});

profileHandler.callbackQuery("prof:delete", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const lang = langOf(user);
  await ctx.answerCallbackQuery();
  await ctx.reply(
    [
      tr(
        lang,
        "⚠️ مطمئنی حسابت حذف شود؟ این کار برگشت‌پذیر نیست.",
        "⚠️ Delete your account? This cannot be undone.",
      ),
      "",
      tr(
        lang,
        `💰 هزینه: ${formatNum(DELETE_ACCOUNT_COST)} سکه (از موجودی کسر می‌شود)`,
        `💰 Cost: ${formatNum(DELETE_ACCOUNT_COST)} coins (deducted from balance)`,
      ),
      tr(
        lang,
        `موجودی فعلی: ${formatNum(user.diamonds)} 💰`,
        `Current balance: ${formatNum(user.diamonds)} 💰`,
      ),
    ].join("\n"),
    { reply_markup: confirmDeleteKeyboard(lang) },
  );
});

profileHandler.callbackQuery("prof:delete:no", async (ctx) => {
  const user = await requireRegistered(ctx);
  await ctx.answerCallbackQuery({
    text: tr(langOf(user), "لغو شد", "Cancelled"),
  });
  if (user) await sendProfileCard(ctx, user.id);
});

profileHandler.callbackQuery("prof:delete:yes", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const lang = langOf(user);
  if (user.diamonds < DELETE_ACCOUNT_COST) {
    await ctx.answerCallbackQuery({
      text: tr(lang, "سکه کافی نیست", "Not enough coins"),
    });
    await ctx.reply(
      tr(
        lang,
        `برای پاک کردن حساب به ${formatNum(DELETE_ACCOUNT_COST)} سکه نیاز داری.\nموجودی: ${formatNum(user.diamonds)} 💰`,
        `Deleting your account needs ${formatNum(DELETE_ACCOUNT_COST)} coins.\nBalance: ${formatNum(user.diamonds)} 💰`,
      ),
      { reply_markup: mainKeyboard(lang) },
    );
    return;
  }
  const { leaveQueueOrChat } = await import("../services/match.js");
  await leaveQueueOrChat(ctx.api, user, true);
  const { deleteAccountPermanently } = await import("../services/account.js");
  const oldId = user.id;
  const deleted = await deleteAccountPermanently(user, {
    coinCost: DELETE_ACCOUNT_COST,
  });
  if (!deleted) {
    await ctx.answerCallbackQuery({
      text: tr(lang, "سکه کافی نیست", "Not enough coins"),
    });
    await ctx.reply(
      tr(
        lang,
        `برای پاک کردن حساب به ${formatNum(DELETE_ACCOUNT_COST)} سکه نیاز داری.`,
        `Deleting your account needs ${formatNum(DELETE_ACCOUNT_COST)} coins.`,
      ),
      { reply_markup: mainKeyboard(lang) },
    );
    return;
  }
  await ctx.answerCallbackQuery({
    text: tr(lang, "حذف شد", "Deleted"),
  });
  await ctx.reply(
    [
      tr(lang, "🗑️ حسابت حذف شد.", "🗑️ Your account was deleted."),
      tr(lang, `شناسهٔ قبلی تو: #${oldId}`, `Previous ID: #${oldId}`),
      tr(
        lang,
        `💰 ${formatNum(DELETE_ACCOUNT_COST)} سکه بابت حذف کسر شد.`,
        `💰 ${formatNum(DELETE_ACCOUNT_COST)} coins were charged for deletion.`,
      ),
      "",
      tr(
        lang,
        "منوی قبلی دیگر کار نمی‌کند.",
        "Your previous menu no longer works.",
      ),
      tr(
        lang,
        "با /start می‌توانی حساب کاملاً جدید بسازی.",
        "Use /start to create a brand-new account.",
      ),
      tr(
        lang,
        "(شناسهٔ قدیمی برای ادمین قابل مشاهده می‌ماند)",
        "(Your old ID remains visible to admins)",
      ),
    ].join("\n"),
    { reply_markup: { remove_keyboard: true } },
  );
});

/** آپلود عکس پروفایل (احراز دیگر با عکس نیست) */
profileHandler.on("message:photo", async (ctx, next) => {
  const from = ctx.from;
  if (!from) return next();
  const user = await findByTelegram(from.id);
  if (!user) return next();

  const photos = ctx.message.photo;
  const best = photos[photos.length - 1];
  if (!best) return next();

  if (user.state === "edit_photo") {
    await patchUser(user.id, {
      photoPendingFileId: best.file_id,
      photoStatus: "pending",
      state: "idle",
    });
    await notifyAdminsPhoto(ctx.api, user, best.file_id);
    await ctx.reply(
      [
        "📷 عکس دریافت شد.",
        "وضعیت: ⏳ در انتظار تأیید ادمین",
        "",
        "تا قبل از تأیید، در اکسپلور با عکس پیش‌فرض دیده می‌شوی.",
      ].join("\n"),
      { reply_markup: mainKeyboard() },
    );
    return;
  }

  if (user.state === "edit_face") {
    await ctx.reply(
      "برای احراز چهره باید ویدیو مسیج (دایره‌ای) یا ویدیو بفرستی، نه عکس.",
      { reply_markup: cancelKeyboard() },
    );
    return;
  }

  return next();
});

async function acceptFaceVideo(
  ctx: Context,
  fileId: string,
  kind: "video_note" | "video",
) {
  const from = ctx.from;
  if (!from) return false;
  const user = await findByTelegram(from.id);
  if (!user || user.state !== "edit_face") return false;
  if (user.photoStatus !== "approved" || !user.photoFileId) {
    await ctx.reply("اول عکس پروفایل تأییدشده لازم است.");
    return true;
  }

  await patchUser(user.id, {
    facePendingFileId: fileId,
    facePendingKind: kind,
    faceStatus: "pending",
    faceVerified: false,
    state: "idle",
  });
  await notifyAdminsFace(
    ctx.api,
    { ...user, photoFileId: user.photoFileId },
    fileId,
    kind,
  );
  await ctx.reply(
    [
      "✅ ویدیو احراز دریافت شد و برای ادمین ارسال شد.",
      "اگر چهره‌ات با عکس پروفایل یکی باشد، احراز تأیید می‌شود.",
      `🎁 جایزه در صورت تأیید: ${formatNum(FACE_VERIFY_REWARD)} سکه`,
    ].join("\n"),
    { reply_markup: mainKeyboard() },
  );
  return true;
}

profileHandler.on("message:video_note", async (ctx, next) => {
  const handled = await acceptFaceVideo(
    ctx,
    ctx.message.video_note.file_id,
    "video_note",
  );
  if (!handled) return next();
});

profileHandler.on("message:video", async (ctx, next) => {
  const handled = await acceptFaceVideo(ctx, ctx.message.video.file_id, "video");
  if (!handled) return next();
});

/** تأیید/رد ادمین */
profileHandler.callbackQuery(/^adm:photo:(ok|no):(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    await ctx.answerCallbackQuery({ text: "دسترسی نداری" });
    return;
  }
  const ok = ctx.match[1] === "ok";
  const userId = Number(ctx.match[2]);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.photoPendingFileId) {
    await ctx.answerCallbackQuery({ text: "چیزی برای بررسی نیست" });
    return;
  }

  if (ok) {
    await patchUser(user.id, {
      photoFileId: user.photoPendingFileId,
      photoPendingFileId: null,
      photoStatus: "approved",
    });
    await ctx.answerCallbackQuery({ text: "تأیید شد" });
    await ctx.api
      .sendMessage(
        Number(user.telegramId),
        "✅ عکس پروفایلت تأیید شد و الان برای بقیه نمایش داده می‌شود.",
      )
      .catch(() => undefined);
    await checkProfileCompletionRewards(user.id, {
      api: ctx.api,
      telegramId: user.telegramId,
    });
  } else {
    await patchUser(user.id, {
      photoPendingFileId: null,
      photoStatus: "rejected",
    });
    await ctx.answerCallbackQuery({ text: "رد شد" });
    await ctx.api
      .sendMessage(
        Number(user.telegramId),
        "❌ عکس پروفایلت رد شد. لطفاً عکس مناسب‌تری از بخش پروفایل بفرست.",
      )
      .catch(() => undefined);
  }
  await ctx.editMessageCaption({
    caption: (ctx.callbackQuery.message && "caption" in ctx.callbackQuery.message
      ? String(ctx.callbackQuery.message.caption ?? "")
      : "") + `\n\nنتیجه: ${ok ? "✅ تأیید" : "❌ رد"}`,
  }).catch(() => undefined);
});

profileHandler.callbackQuery(/^adm:face:(ok|no):(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    await ctx.answerCallbackQuery({ text: "دسترسی نداری" });
    return;
  }
  const ok = ctx.match[1] === "ok";
  const userId = Number(ctx.match[2]);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    await ctx.answerCallbackQuery({ text: "کاربر نیست" });
    return;
  }

  if (ok) {
    const updated = await prisma.user.updateMany({
      where: { id: userId, faceStatus: { not: "approved" } },
      data: {
        faceVerified: true,
        faceStatus: "approved",
        facePendingFileId: null,
        facePendingKind: null,
        diamonds: { increment: FACE_VERIFY_REWARD },
      },
    });
    if (updated.count !== 1) {
      await ctx.answerCallbackQuery({ text: "قبلاً تأیید شده" });
      return;
    }
    const fresh = await prisma.user.findUnique({ where: { id: user.id } });
    await ctx.answerCallbackQuery({ text: "احراز شد +۱۰۰💰" });
    await ctx.api
      .sendMessage(
        Number(user.telegramId),
        [
          "✅ احراز چهره‌ات تأیید شد!",
          `🎁 جایزه: ${formatNum(FACE_VERIFY_REWARD)} سکه به حسابت اضافه شد.`,
          `موجودی: ${formatNum(fresh?.diamonds ?? 0)} 💰`,
        ].join("\n"),
      )
      .catch(() => undefined);
    await checkProfileCompletionRewards(user.id, {
      api: ctx.api,
      telegramId: user.telegramId,
    });
  } else {
    await patchUser(user.id, {
      faceVerified: false,
      faceStatus: "rejected",
      facePendingFileId: null,
      facePendingKind: null,
    });
    await ctx.answerCallbackQuery({ text: "رد شد" });
    await ctx.api
      .sendMessage(
        Number(user.telegramId),
        "❌ احراز چهره رد شد.\nچهره ویدیو با عکس پروفایل یکی نبود. از پروفایل → احراز چهره دوباره ویدیو بفرست.",
      )
      .catch(() => undefined);
  }
});
