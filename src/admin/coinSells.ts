import { Composer, InlineKeyboard } from "grammy";
import { formatNum, formatToman, genderLabel } from "../data/packages.js";
import { adminOnly } from "./auth.js";
import {
  countOpenCoinSells,
  getCoinSellById,
  listOpenCoinSells,
  markCoinSellPaid,
  rejectCoinSell,
  formatCardGrouped,
} from "../services/coinSell.js";

export const adminCoinSellsHandler = new Composer();

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
    userId: number;
    user: { displayName: string | null };
  }>,
) {
  const kb = new InlineKeyboard();
  for (const r of rows.slice(0, 15)) {
    const who = (r.user.displayName || `#${r.userId}`).slice(0, 20);
    kb.text(`#${r.id} · ${who}`, `adm:sell:view:${r.id}`).row();
  }
  kb.text("🔄 بروزرسانی", "adm:sells").row();
  kb.text("↩️ پنل ادمین", "adm:home");
  return kb;
}

function detailKeyboard(id: number) {
  return new InlineKeyboard()
    .text("✅ پرداخت شد", `adm:sell:paid:${id}`)
    .success()
    .text("🗑 رد + برگشت سکه", `adm:sell:reject:${id}`)
    .danger()
    .row()
    .text("↩️ لیست فروش‌ها", "adm:sells")
    .text("🛠 پنل", "adm:home");
}

async function buildListText() {
  const [openCount, rows] = await Promise.all([
    countOpenCoinSells(),
    listOpenCoinSells(20),
  ]);
  const lines = [
    "💵 درخواست‌های فروش سکه",
    "",
    `باز: ${formatNum(openCount)}`,
    "",
  ];
  if (rows.length === 0) {
    lines.push("درخواست بازی نیست.");
  } else {
    lines.push("روی هر مورد بزن تا کارت و جزئیات را ببینی:");
    lines.push("");
    for (const r of rows.slice(0, 15)) {
      const when = r.createdAt.toLocaleString("fa-IR", {
        dateStyle: "short",
        timeStyle: "short",
      });
      lines.push(
        `• #${r.id} · ${formatNum(r.coins)} سکه · ${formatToman(r.amountToman)}`,
      );
      lines.push(`  ${brief(r.user)}`);
      lines.push(`  ${when}`);
    }
  }
  return lines.join("\n");
}

async function buildDetailText(id: number) {
  const r = await getCoinSellById(id);
  if (!r) return null;
  const when = r.createdAt.toLocaleString("fa-IR", {
    dateStyle: "full",
    timeStyle: "short",
  });
  return [
    `💵 فروش سکه #${r.id}`,
    `وضعیت: ${r.status}`,
    `زمان: ${when}`,
    "",
    `سکه: ${formatNum(r.coins)}`,
    `نرخ: ${formatNum(r.rateToman)} ت/سکه`,
    `مبلغ: ${formatToman(r.amountToman)}`,
    `کارت: ${formatCardGrouped(r.cardNumber)}`,
    r.adminNote ? `یادداشت: ${r.adminNote}` : null,
    "",
    "—— کاربر ——",
    brief(r.user),
    `tg: ${r.user.telegramId}`,
    `موجودی فعلی: ${formatNum(r.user.diamonds)}`,
    r.user.userCode ? `لینک: /user_${r.user.userCode}` : null,
  ]
    .filter((x) => x != null)
    .join("\n");
}

adminCoinSellsHandler.callbackQuery("adm:sells", async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  await ctx.answerCallbackQuery();
  const text = await buildListText();
  const rows = await listOpenCoinSells(20);
  const kb = listKeyboard(rows);
  await ctx.editMessageText(text, { reply_markup: kb }).catch(async () => {
    await ctx.reply(text, { reply_markup: kb });
  });
});

adminCoinSellsHandler.callbackQuery(/^adm:sell:view:(\d+)$/, async (ctx) => {
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

adminCoinSellsHandler.callbackQuery(
  /^adm:sell:(paid|reject):(\d+)$/,
  async (ctx) => {
    if (!adminOnly(ctx)) {
      await ctx.answerCallbackQuery({ text: "غیرمجاز" });
      return;
    }
    const action = ctx.match![1];
    const id = Number(ctx.match![2]);
    try {
      if (action === "paid") {
        const row = await markCoinSellPaid(id);
        if (!row) {
          await ctx.answerCallbackQuery({ text: "قابل پرداخت نیست", show_alert: true });
          return;
        }
        await ctx.answerCallbackQuery({ text: "پرداخت شد ✅" });
        // اطلاع به کاربر
        await ctx.api
          .sendMessage(
            Number(row.user.telegramId),
            [
              "✅ درخواست فروش سکه‌ات پرداخت شد.",
              `شماره: #${row.id}`,
              `مبلغ: ${formatToman(row.amountToman)}`,
              `کارت: ${formatCardGrouped(row.cardNumber)}`,
            ].join("\n"),
          )
          .catch(() => undefined);
      } else {
        const result = await rejectCoinSell(id);
        if (!result.ok) {
          await ctx.answerCallbackQuery({
            text: result.reason === "missing" ? "پیدا نشد" : "وضعیت نامعتبر",
            show_alert: true,
          });
          return;
        }
        await ctx.answerCallbackQuery({ text: "رد شد — سکه برگشت" });
        const row = await getCoinSellById(id);
        if (row) {
          await ctx.api
            .sendMessage(
              Number(row.user.telegramId),
              [
                "❌ درخواست فروش سکه رد شد.",
                `شماره: #${row.id}`,
                `${formatNum(result.refunded)} سکه به حسابت برگشت.`,
              ].join("\n"),
            )
            .catch(() => undefined);
        }
      }
    } catch {
      await ctx.answerCallbackQuery({ text: "خطا", show_alert: true });
      return;
    }
    const text = await buildListText();
    const rows = await listOpenCoinSells(20);
    const kb = listKeyboard(rows);
    await ctx.editMessageText(text, { reply_markup: kb }).catch(async () => {
      await ctx.reply(text, { reply_markup: kb });
    });
  },
);
