import { Composer, InlineKeyboard } from "grammy";
import { formatNum, genderLabel } from "../data/packages.js";
import { adminOnly } from "./auth.js";
import {
  countOpenReports,
  getReportById,
  listOpenReports,
  markReportStatus,
  reasonLabel,
} from "../services/report.js";

export const adminReportsHandler = new Composer();

function brief(u: {
  id: number;
  displayName: string | null;
  userCode: string | null;
  username?: string | null;
  gender?: string | null;
  age?: number | null;
}) {
  const name = u.displayName?.trim() || `user_${u.userCode ?? u.id}`;
  const g = u.gender ? genderLabel(u.gender) : "?";
  const age = u.age != null ? String(u.age) : "?";
  const code = u.userCode ? ` /user_${u.userCode}` : "";
  const un = u.username ? ` @${u.username}` : "";
  return `${name}${un} (${g} ${age}) #${u.id}${code}`;
}

function listKeyboard(
  rows: Array<{
    id: number;
    reportedUserId: number;
    reported: { displayName: string | null };
  }>,
) {
  const kb = new InlineKeyboard();
  for (const r of rows.slice(0, 15)) {
    const who = (r.reported.displayName || `#${r.reportedUserId}`).slice(0, 20);
    kb.text(`#${r.id} · ${who}`, `adm:report:view:${r.id}`).row();
  }
  kb.text("🔄 بروزرسانی", "adm:reports").row();
  kb.text("↩️ پنل ادمین", "adm:home");
  return kb;
}

function detailKeyboard(id: number) {
  return new InlineKeyboard()
    .text("✅ بررسی شد", `adm:report:done:${id}`)
    .success()
    .text("🗑 رد / بی‌اقدام", `adm:report:dismiss:${id}`)
    .danger()
    .row()
    .text("↩️ لیست گزارش‌ها", "adm:reports")
    .text("🛠 پنل", "adm:home");
}

async function buildListText() {
  const [openCount, rows] = await Promise.all([
    countOpenReports(),
    listOpenReports(20),
  ]);
  const lines = [
    "🚩 گزارش تخلفات کاربران",
    "",
    `باز: ${formatNum(openCount)}`,
    "",
  ];
  if (rows.length === 0) {
    lines.push("گزارش بازی نیست.");
  } else {
    lines.push("روی هر مورد بزن تا جزئیات (خصوصی) را ببینی:");
    lines.push("");
    for (const r of rows.slice(0, 15)) {
      const when = r.createdAt.toLocaleString("fa-IR", {
        dateStyle: "short",
        timeStyle: "short",
      });
      lines.push(`• #${r.id} · ${reasonLabel(r.reason)}`);
      lines.push(`  متخلف: ${brief(r.reported)}`);
      lines.push(`  ${when}`);
    }
  }
  return lines.join("\n");
}

async function buildDetailText(id: number) {
  const r = await getReportById(id);
  if (!r) return null;
  const when = r.createdAt.toLocaleString("fa-IR", {
    dateStyle: "full",
    timeStyle: "short",
  });
  return [
    `🚩 گزارش #${r.id}`,
    `وضعیت: ${r.status}`,
    `زمان: ${when}`,
    "",
    `دلیل: ${reasonLabel(r.reason)}`,
    r.details ? `\n📝 توضیح کاربر (خصوصی ادمین):\n${r.details}\n` : null,
    "",
    "—— گزارش‌دهنده ——",
    brief(r.reporter),
    `tg: ${r.reporter.telegramId}`,
    "",
    "—— متخلف ——",
    brief(r.reported),
    `tg: ${r.reported.telegramId}`,
    r.reported.userCode ? `لینک: /user_${r.reported.userCode}` : null,
  ]
    .filter((x) => x != null)
    .join("\n");
}

adminReportsHandler.callbackQuery("adm:reports", async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  await ctx.answerCallbackQuery();
  const text = await buildListText();
  const rows = await listOpenReports(20);
  const kb = listKeyboard(rows);
  await ctx.editMessageText(text, { reply_markup: kb }).catch(async () => {
    await ctx.reply(text, { reply_markup: kb });
  });
});

adminReportsHandler.callbackQuery(/^adm:report:view:(\d+)$/, async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const id = Number(ctx.match![1]);
  const text = await buildDetailText(id);
  if (!text) {
    await ctx.answerCallbackQuery({ text: "پیدا نشد", show_alert: true });
    return;
  }
  await ctx.answerCallbackQuery();
  const kb = detailKeyboard(id);
  await ctx.editMessageText(text, { reply_markup: kb }).catch(async () => {
    await ctx.reply(text, { reply_markup: kb });
  });
});

adminReportsHandler.callbackQuery(
  /^adm:report:(done|dismiss):(\d+)$/,
  async (ctx) => {
    if (!adminOnly(ctx)) {
      await ctx.answerCallbackQuery({ text: "غیرمجاز" });
      return;
    }
    const action = ctx.match![1];
    const id = Number(ctx.match![2]);
    const status = action === "done" ? "reviewed" : "dismissed";
    try {
      await markReportStatus(id, status);
    } catch {
      await ctx.answerCallbackQuery({ text: "خطا", show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery({
      text: status === "reviewed" ? "بررسی شد ✅" : "رد شد",
    });
    const text = await buildListText();
    const rows = await listOpenReports(20);
    const kb = listKeyboard(rows);
    await ctx.editMessageText(text, { reply_markup: kb }).catch(async () => {
      await ctx.reply(text, { reply_markup: kb });
    });
  },
);
