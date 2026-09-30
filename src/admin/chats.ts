import { Composer, InlineKeyboard } from "grammy";
import { formatNum } from "../data/packages.js";
import { adminOnly } from "./auth.js";
import { getLiveChatStats } from "../services/adminStats.js";

export const adminChatsHandler = new Composer();

function reportKeyboard() {
  return new InlineKeyboard()
    .text("🔄 بروزرسانی", "adm:chats")
    .row()
    .text("↩️ پنل ادمین", "adm:home");
}

async function buildChatsReportText() {
  const live = await getLiveChatStats();
  return [
    "📊 گزارش چت‌های فعال",
    "",
    `💬 افراد در حال چت: ${formatNum(live.chattingUsers)} نفر`,
    `🔗 جفت چت فعال: ${formatNum(live.activeChatPairs)}`,
    `⏳ صف انتظار چت سریع: ${formatNum(live.waitingQueue)}`,
    live.chattingOrphaned > 0 || live.partnerWithoutChatting > 0
      ? `\n⚠️ ناهماهنگی: ${formatNum(live.chattingOrphaned)} بدون شریک · ${formatNum(live.partnerWithoutChatting)} شریک بدون چت`
      : null,
    "",
    "فقط آمار — بدون لیست کاربران و بدون مشاهده گفتگو.",
  ]
    .filter((x) => x != null)
    .join("\n");
}

adminChatsHandler.callbackQuery("adm:chats", async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  await ctx.answerCallbackQuery();
  const text = await buildChatsReportText();
  const kb = reportKeyboard();
  await ctx
    .editMessageText(text, { reply_markup: kb })
    .catch(async () => {
      await ctx.reply(text, { reply_markup: kb });
    });
});

/** Legacy view callbacks — disabled (privacy): redirect to report */
adminChatsHandler.callbackQuery(/^adm:chat:view:/, async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  await ctx.answerCallbackQuery({ text: "مشاهده چت غیرفعال است" });
  const text = await buildChatsReportText();
  const kb = reportKeyboard();
  await ctx
    .editMessageText(text, { reply_markup: kb })
    .catch(async () => {
      await ctx.reply(text, { reply_markup: kb });
    });
});

adminChatsHandler.callbackQuery(/^adm:chat:older:/, async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  await ctx.answerCallbackQuery({ text: "مشاهده چت غیرفعال است" });
  const text = await buildChatsReportText();
  const kb = reportKeyboard();
  await ctx
    .editMessageText(text, { reply_markup: kb })
    .catch(async () => {
      await ctx.reply(text, { reply_markup: kb });
    });
});
