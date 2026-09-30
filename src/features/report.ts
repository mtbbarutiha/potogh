import { Composer, InlineKeyboard } from "grammy";
import { findByTelegram, patchUser } from "../db/users.js";
import { requireRegistered } from "../services/register.js";
import { prisma } from "../db/prisma.js";
import { reportReasonKeyboard, mainKeyboard } from "../keyboards/main.js";
import { createUserReport, isReportReason, notifyAdminsNewReport, reasonLabel, } from "../services/report.js";
export const reportHandler = new Composer();
function cancelReportKb(lang: "fa" | "en") {
    return new InlineKeyboard().text(lang === "en" ? "↩️ Cancel" : "↩️ انصراف", "report:cancel");
}
/** id هدف از pendingReportOther یا legacy `report_other:ID` */
function parseReportOtherPending(pending: string | null | undefined) {
    if (!pending) return null;
    const raw = pending.startsWith("report_other:")
        ? pending.slice("report_other:".length)
        : pending;
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
}
reportHandler.callbackQuery(/^report:start:(\d+)$/, async (ctx) => {
    const user = await requireRegistered(ctx);
    if (!user) {
        await ctx.answerCallbackQuery();
        return;
    }
    const targetId = Number(ctx.match[1]);
    const lang = user.language === "en" ? "en" : "fa";
    if (targetId === user.id) {
        await ctx.answerCallbackQuery({
            text: lang === "en" ? "Can't report yourself" : "نمی‌تونی خودت را گزارش کنی",
            show_alert: true,
        });
        return;
    }
    const target = await prisma.user.findUnique({ where: { id: targetId } });
    if (!target || target.deletedAt) {
        await ctx.answerCallbackQuery({
            text: lang === "en" ? "User not found" : "کاربر پیدا نشد",
            show_alert: true,
        });
        return;
    }
    await ctx.answerCallbackQuery();
    const name = target.displayName?.trim() || `user_${target.userCode ?? target.id}`;
    const text = lang === "en"
        ? `🚩 Report user\n\nWho: ${name}\n\nPick a reason (private — only admins see it):`
        : `🚩 گزارش تخلف\n\nکاربر: ${name}\n\nدلیل را انتخاب کن (خصوصی — فقط ادمین می‌بیند):`;
    await ctx.reply(text, { reply_markup: reportReasonKeyboard(targetId, lang) });
});
reportHandler.callbackQuery("report:cancel", async (ctx) => {
    const user = await findByTelegram(ctx.from.id);
    if (user && parseReportOtherPending(user.pendingReportOther)) {
        await patchUser(user.id, { pendingReportOther: null });
    }
    await ctx.answerCallbackQuery({
        text: user?.language === "en" ? "Cancelled" : "لغو شد",
    });
    await ctx.editMessageText(user?.language === "en" ? "Report cancelled." : "گزارش لغو شد.").catch(() => undefined);
});
reportHandler.callbackQuery(/^report:reason:(\d+):([a-z_]+)$/, async (ctx) => {
    const user = await requireRegistered(ctx);
    if (!user) {
        await ctx.answerCallbackQuery();
        return;
    }
    const targetId = Number(ctx.match[1]);
    const reason = ctx.match[2];
    const lang = user.language === "en" ? "en" : "fa";
    if (!reason || !isReportReason(reason)) {
        await ctx.answerCallbackQuery({
            text: lang === "en" ? "Invalid reason" : "دلیل نامعتبر",
            show_alert: true,
        });
        return;
    }
    if (reason === "other") {
        // state/DM/anon را دست نزن — فیلد جدا؛ فروش کارت را آزاد کن
        await patchUser(user.id, {
            pendingReportOther: String(targetId),
            pendingSellCard: null,
        });
        await ctx.answerCallbackQuery();
        const prompt = lang === "en"
            ? "✏️ Write the details of the violation (only admins will see this).\nSend as a normal message."
            : "✏️ توضیح تخلف را بنویس (فقط ادمین می‌بیند).\nبه‌صورت پیام عادی بفرست.";
        await ctx.editMessageText(prompt, { reply_markup: cancelReportKb(lang) }).catch(async () => {
            await ctx.reply(prompt, { reply_markup: cancelReportKb(lang) });
        });
        return;
    }
    const result = await createUserReport({
        reporterUserId: user.id,
        reportedUserId: targetId,
        reason,
    });
    if (!result.ok) {
        const msg = result.reason === "self"
            ? (lang === "en" ? "Can't report yourself" : "نمی‌تونی خودت را گزارش کنی")
            : (lang === "en" ? "User not found" : "کاربر پیدا نشد");
        await ctx.answerCallbackQuery({ text: msg, show_alert: true });
        return;
    }
    await ctx.answerCallbackQuery({
        text: result.duplicate
            ? (lang === "en" ? "Already reported" : "قبلاً گزارش شده")
            : (lang === "en" ? "Report sent ✅" : "گزارش ثبت شد ✅"),
    });
    const done = lang === "en"
        ? `✅ Report submitted.\nReason: ${reasonLabel(reason)}\nAdmins will review it privately.`
        : `✅ گزارش ثبت شد.\nدلیل: ${reasonLabel(reason)}\nادمین‌ها به‌صورت خصوصی بررسی می‌کنند.`;
    await ctx.editMessageText(done).catch(async () => {
        await ctx.reply(done);
    });
    if (!result.duplicate) {
        await notifyAdminsNewReport(ctx.api, result.reportId);
    }
});
/** متن «دیگر موارد» — قبل از chat relay */
reportHandler.on("message:text", async (ctx, next) => {
    if (!ctx.from)
        return next();
    const user = await findByTelegram(ctx.from.id);
    if (!user)
        return next();
    const targetId = parseReportOtherPending(user.pendingReportOther);
    if (!targetId)
        return next();
    const lang = user.language === "en" ? "en" : "fa";
    const text = (ctx.message.text || "").trim();
    if (!text || text.startsWith("/")) {
        return next();
    }
    if (text.length < 3) {
        await ctx.reply(lang === "en"
            ? "Please write a bit more detail (min 3 chars)."
            : "لطفاً توضیح کامل‌تری بنویس (حداقل ۳ حرف).");
        return;
    }
    const result = await createUserReport({
        reporterUserId: user.id,
        reportedUserId: targetId,
        reason: "other",
        details: text.slice(0, 1000),
    });
    await patchUser(user.id, { pendingReportOther: null });
    if (!result.ok) {
        await ctx.reply(lang === "en" ? "Could not submit report." : "ثبت گزارش ممکن نشد.");
        return;
    }
    await ctx.reply(lang === "en"
        ? "✅ Report submitted with your note.\nOnly admins can read it."
        : "✅ گزارش با توضیح تو ثبت شد.\nفقط ادمین می‌تواند آن را بخواند.");
    if (!result.duplicate) {
        await notifyAdminsNewReport(ctx.api, result.reportId);
    }
});
