import { Composer, InlineKeyboard } from "grammy";
import { isAdmin } from "../lib/admin.js";
import {
  getRegistrationStats,
  getRevenueStats,
  getLaunchDashboard,
  getTodayRegistrationByGender,
  checkForceJoinHealth,
  listPendingPhotos,
  listPendingFaces,
} from "../services/adminStats.js";
import { formatNum, formatToman } from "../data/packages.js";
import { formatAdminUserLine } from "../services/account.js";
import { sendPendingFaceToAdmin } from "../services/profile.js";
import {
  adminPhotoKeyboard,
} from "../keyboards/main.js";
import { genderLabel } from "../data/packages.js";
import {
  formatHangReportForAdmin,
  formatUptime,
  getLogFilePath,
  getUptimeSec,
  readRecentLogLines,
} from "../lib/logger.js";
import { getPollWatch } from "../lib/pollWatch.js";
import { scheduleSelfRestart } from "../lib/selfRestart.js";
import { adminChatsHandler } from "../admin/chats.js";
import { adminReportsHandler } from "../admin/reports.js";
import { adminCoinSellsHandler } from "../admin/coinSells.js";

export const adminHandler = new Composer();

// chats / reports / coin-sells live in src/admin — must be mounted here
// (handlers/admin overwrite dropped the admin/index re-export).
adminHandler.use(adminChatsHandler);
adminHandler.use(adminCoinSellsHandler);
adminHandler.use(adminReportsHandler);

function adminOnly(ctx: { from?: { id: number } | undefined }) {
  return ctx.from && isAdmin(ctx.from.id);
}

export function adminPanelKeyboard(pendingPhotos: number, pendingFaces: number) {
  return new InlineKeyboard()
    .text("📡 داشبورد لانچ", "adm:launch")
    .primary()
    .row()
    .text(`📷 عکس‌های در انتظار تایید (${formatNum(pendingPhotos)})`, "adm:photos")
    .row()
    .text(`✅ پروفایل‌های در انتظار احراز (${formatNum(pendingFaces)})`, "adm:faces")
    .row()
    .text("📊 گزارش چت فعال", "adm:chats")
    .primary()
    .row()
    .text("🚩 گزارش تخلفات", "adm:reports")
    .danger()
    .row()
    .text("💵 فروش سکه / تسویه", "adm:sells")
    .row()
    .text("💰 افزودن سکه به کاربر", "adm:givecoins")
    .row()
    .text("🗑 حذف عکس کاربر", "adm:clearphoto")
    .danger()
    .row()
    .text("🚫 مسدود کردن کاربر", "adm:ban")
    .danger()
    .text("✅ رفع مسدودیت", "adm:unban")
    .success()
    .row()
    .text("🎟 مدیریت ووچر (کد هدیه)", "adm:vouchers")
    .row()
    .text("🎁 هدیه سکه به همه کاربران", "adm:giftall")
    .success()
    .row()
    .text("💵 درآمد فروش سکه", "adm:revenue")
    .primary()
    .row()
    .text("📊 آمار این ماه", "adm:stats:month")
    .text("📈 آمار ۳ ماه", "adm:stats:3m")
    .row()
    .text("📅 ثبت‌نام امروز (دختر/پسر)", "adm:stats:today")
    .row()
    .text("👥 خلاصه کاربران", "adm:overview")
    .text("🔄 بروزرسانی", "adm:home")
    .row()
    .text("📋 لاگ هنگ / تشخیص", "adm:botlog")
    .text("♻️ ریستارت ربات", "adm:restart");
}

function formatLaunchDashboard(
  d: Awaited<ReturnType<typeof getLaunchDashboard>>,
  forceJoin?: { ok: boolean; detail: string },
) {
  const hb =
    d.heartbeatAgeSec == null
      ? "نامشخص"
      : d.heartbeatAgeSec < 0
        ? "—"
        : `${formatNum(d.heartbeatAgeSec)}ث پیش (${d.heartbeatReason})`;
  return [
    "📡 داشبورد لانچ دوردوریا",
    "",
    "—— کاربران ——",
    `👥 کل ثبت‌نام: ${formatNum(d.totalUsers)}`,
    `📅 امروز: ${formatNum(d.registeredToday)} · ۷روز: ${formatNum(d.registeredWeek)}`,
    `💬 در حال چت: ${formatNum(d.chattingNow)}`,
    `⏳ صف چت سریع: ${formatNum(d.waitingQueue)}`,
    "",
    "—— اقتصاد سکه ——",
    `💰 در گردش: ${formatNum(d.coinsCirculation)}`,
    `❤️ لایک امروز: ${formatNum(d.likesToday)}`,
    `🧵 نخ امروز: ${formatNum(d.threadsToday)}`,
    `📉 خرج تقریبی امروز (لایک+نخ): ${formatNum(d.spentTodayApprox)}`,
    "",
    "—— پرداخت ——",
    d.demoPay
      ? "⚠️ دمو‌پی روشن است — خطر شارژ رایگان!"
      : "✅ شارژ خرید: فقط Stars + کارت‌به‌کارت",
    `⏳ سفارش باز: ${formatNum(d.pendingOrders)}`,
    `💵 پرداخت امروز: ${formatNum(d.paidToday.orders)} سفارش · ${formatToman(d.paidToday.toman)}`,
    "",
    "—— سلامت ——",
    `DB: ${d.dbOk ? "OK ✅" : "FAIL ❌"}`,
    `⏱ آپ‌تایم: ${d.uptime} (pid ${d.pid})`,
    `💓 heartbeat: ${hb}`,
    `📡 poll ok=${formatNum(d.pollOk)} fail=${formatNum(d.pollFail)}`,
    `🧠 RAM: ${formatNum(d.memMb)} MB`,
    `MODE: ${d.mode} · NODE_ENV=${d.nodeEnv}`,
    d.webAppUrl
      ? `Mini App: ${d.webAppUrl}`
      : "Mini App: تنظیم نشده (WEB_APP_URL)",
    "",
    "—— فورس‌جوین ——",
    `کانال: ${d.forceJoinChannel} (${d.forceJoinChatId})`,
    forceJoin
      ? `${forceJoin.ok ? "✅" : "⚠️"} ${forceJoin.detail}`
      : "وضعیت چک نشده",
  ].join("\n");
}

function adminHomeText(s: Awaited<ReturnType<typeof getRegistrationStats>>) {
  const up = formatUptime();
  const upSec = getUptimeSec();
  const poll = getPollWatch();
  return [
    "🛠 پنل ادمین دوردوریا",
    `⏱ آپ‌تایم: ${up}`,
    `   (${upSec} ثانیه · pid ${process.pid})`,
    poll.pollOkCount > 0
      ? `📡 poll ok=${poll.pollOkCount} fail=${poll.pollFailCount}`
      : null,
    "",
    "—— صف تایید ——",
    `📷 عکس‌های در انتظار تایید: ${formatNum(s.pendingPhotos)}`,
    `✅ پروفایل‌های در انتظار احراز: ${formatNum(s.pendingFaces)}`,
    "",
    "💰 افزودن سکه به یک کاربر یا هدیه همگانی از دکمه‌های پایین",
    "📡 داشبورد لانچ: کاربران زنده · اقتصاد · سلامت · فورس‌جوین",
    "",
    `👥 ثبت‌نام‌شده فعال: ${formatNum(s.totalActive)}`,
    `👩 دختر: ${formatNum(s.registeredFemale)}`,
    `👨 پسر: ${formatNum(s.registeredMale)}`,
    s.registeredOtherGender > 0
      ? `❔ بدون جنسیت/سایر: ${formatNum(s.registeredOtherGender)}`
      : null,
    `📅 ثبت‌نام امروز: ${formatNum(s.registeredToday)}`,
    `   👩 دختر: ${formatNum(s.registeredTodayFemale)} · 👨 پسر: ${formatNum(s.registeredTodayMale)}`,
    s.registeredTodayOther > 0
      ? `   ❔ بدون جنسیت: ${formatNum(s.registeredTodayOther)}`
      : null,
    "",
    "یک گزینه را انتخاب کن:",
  ]
    .filter((x) => x != null)
    .join("\n");
}

adminHandler.command("admin", async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.reply("دسترسی ادمین نداری.");
    return;
  }
  const s = await getRegistrationStats();
  await ctx.reply(adminHomeText(s), {
    reply_markup: adminPanelKeyboard(s.pendingPhotos, s.pendingFaces),
  });
});

adminHandler.command("uptime", async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.reply("دسترسی ادمین نداری.");
    return;
  }
  const poll = getPollWatch();
  await ctx.reply(
    [
      "⏱ وضعیت ربات",
      `آپ‌تایم: ${formatUptime()}`,
      `ثانیه: ${getUptimeSec()}`,
      `pid: ${process.pid}`,
      `poll ok=${poll.pollOkCount} fail=${poll.pollFailCount} hardTimeout=${poll.hardTimeoutCount}`,
      `mem: ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
    ].join("\n"),
    {
      reply_markup: new InlineKeyboard()
        .text("🔄 بروزرسانی", "adm:uptime")
        .text("🛠 پنل ادمین", "adm:home"),
    },
  );
});

adminHandler.callbackQuery(/^adm:uptime$/, async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  await ctx.answerCallbackQuery();
  const poll = getPollWatch();
  const text = [
    "⏱ وضعیت ربات",
    `آپ‌تایم: ${formatUptime()}`,
    `ثانیه: ${getUptimeSec()}`,
    `pid: ${process.pid}`,
    `poll ok=${poll.pollOkCount} fail=${poll.pollFailCount} hardTimeout=${poll.hardTimeoutCount}`,
    `mem: ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
  ].join("\n");
  await ctx
    .editMessageText(text, {
      reply_markup: new InlineKeyboard()
        .text("🔄 بروزرسانی", "adm:uptime")
        .text("🛠 پنل ادمین", "adm:home"),
    })
    .catch(async () => {
      await ctx.reply(text, {
        reply_markup: new InlineKeyboard()
          .text("🔄 بروزرسانی", "adm:uptime")
          .text("🛠 پنل ادمین", "adm:home"),
      });
    });
});

adminHandler.callbackQuery(/^adm:home$/, async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const s = await getRegistrationStats();
  await ctx.answerCallbackQuery();
  const text = adminHomeText(s);
  await ctx.editMessageText(text, {
    reply_markup: adminPanelKeyboard(s.pendingPhotos, s.pendingFaces),
  }).catch(async () => {
    await ctx.reply(text, {
      reply_markup: adminPanelKeyboard(s.pendingPhotos, s.pendingFaces),
    });
  });
});

adminHandler.callbackQuery(/^adm:launch$/, async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  await ctx.answerCallbackQuery();
  const d = await getLaunchDashboard();
  let forceJoin: { ok: boolean; detail: string } | undefined;
  try {
    const me = await ctx.api.getMe();
    forceJoin = await checkForceJoinHealth(ctx.api, me.id);
  } catch {
    forceJoin = { ok: false, detail: "چک کانال ناموفق" };
  }
  const text = formatLaunchDashboard(d, forceJoin);
  const kb = new InlineKeyboard()
    .text("🔄 بروزرسانی", "adm:launch")
    .row()
    .text("💵 درآمد", "adm:revenue")
    .text("↩️ پنل", "adm:home");
  await ctx.editMessageText(text, { reply_markup: kb }).catch(async () => {
    await ctx.reply(text, { reply_markup: kb });
  });
});

adminHandler.command("launch", async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.reply("دسترسی ادمین نداری.");
    return;
  }
  const d = await getLaunchDashboard();
  let forceJoin: { ok: boolean; detail: string } | undefined;
  try {
    const me = await ctx.api.getMe();
    forceJoin = await checkForceJoinHealth(ctx.api, me.id);
  } catch {
    forceJoin = { ok: false, detail: "چک کانال ناموفق" };
  }
  await ctx.reply(formatLaunchDashboard(d, forceJoin), {
    reply_markup: new InlineKeyboard()
      .text("🔄 بروزرسانی", "adm:launch")
      .row()
      .text("🛠 پنل ادمین", "adm:home"),
  });
});

async function sendBotLogReport(ctx: {
  reply: (text: string, extra?: object) => Promise<unknown>;
}) {
  const poll = getPollWatch();
  const pollLines = [
    "",
    "—— polling ——",
    `inFlight: ${poll.inFlightMs}ms`,
    `sinceLastEnd: ${poll.sinceLastEndMs}ms`,
    `ok=${poll.pollOkCount} fail=${poll.pollFailCount} hardTimeout=${poll.hardTimeoutCount}`,
  ].join("\n");
  const report = formatHangReportForAdmin() + pollLines;
  // تلگرام سقف ~4096 کاراکتر دارد
  const chunk = report.length > 3500 ? report.slice(0, 3500) + "\n…" : report;
  await ctx.reply(chunk, {
    reply_markup: new InlineKeyboard()
      .text("🔄 بروزرسانی لاگ", "adm:botlog")
      .text("📄 ۳۰ خط آخر فایل", "adm:botlog:tail")
      .row()
      .text("⬅️ پنل ادمین", "adm:home"),
  });
}

adminHandler.command("botlog", async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.reply("دسترسی ادمین نداری.");
    return;
  }
  await sendBotLogReport(ctx);
});

adminHandler.command("restart", async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.reply("دسترسی ادمین نداری.");
    return;
  }
  const ok = scheduleSelfRestart(`admin:/restart from=${ctx.from?.id}`);
  if (!ok) {
    await ctx.reply("ری‌استارت از قبل برنامه‌ریزی شده.");
    return;
  }
  await ctx.reply(
    "♻️ ربات تا ۱ ثانیه دیگر ری‌استارت می‌شود.\nWatchdog دوباره بالا می‌آورد — چند ثانیه صبر کن، بعد /ping بزن.",
  );
});

adminHandler.callbackQuery(/^adm:restart$/, async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const ok = scheduleSelfRestart(`admin:button from=${ctx.from?.id}`);
  await ctx.answerCallbackQuery({
    text: ok ? "در حال ری‌استارت…" : "قبلاً برنامه‌ریزی شده",
  });
  if (ok) {
    await ctx.reply(
      "♻️ ربات تا ۱ ثانیه دیگر ری‌استارت می‌شود.\nچند ثانیه صبر کن، بعد /ping بزن.",
    );
  }
});

adminHandler.callbackQuery(/^adm:botlog$/, async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  await ctx.answerCallbackQuery();
  await sendBotLogReport(ctx);
});

adminHandler.callbackQuery(/^adm:botlog:tail$/, async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  await ctx.answerCallbackQuery();
  const lines = readRecentLogLines(30);
  const path = getLogFilePath();
  if (lines.length === 0) {
    await ctx.reply(`فایل لاگ خالی است.\n${path}`);
    return;
  }
  const pretty = lines
    .map((line) => {
      try {
        const j = JSON.parse(line) as Record<string, unknown>;
        const ts = String(j.ts ?? "").slice(11, 19);
        const extra =
          j.err ?? j.reason ?? (j.ms != null ? `${j.ms}ms` : j.from ?? "");
        return `${ts} ${j.level} ${j.event}${extra ? " " + String(extra).slice(0, 60) : ""}`;
      } catch {
        return line.slice(0, 100);
      }
    })
    .join("\n");
  const body = `📄 ${path}\n\n<pre>${pretty
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .slice(0, 3500)}</pre>`;
  await ctx.reply(body, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard()
      .text("📋 خلاصه", "adm:botlog")
      .text("⬅️ پنل", "adm:home"),
  });
});

adminHandler.callbackQuery("adm:stats:today", async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const t = await getTodayRegistrationByGender();
  await ctx.answerCallbackQuery();
  const text = [
    "📅 ثبت‌نام امروز (وقت تهران)",
    "",
    `🗓 ${t.dateLabel}`,
    "",
    `👩 دختر: ${formatNum(t.female)}`,
    `👨 پسر: ${formatNum(t.male)}`,
    t.other > 0 ? `❔ بدون جنسیت/سایر: ${formatNum(t.other)}` : null,
    "",
    `📊 جمع کل: ${formatNum(t.total)}`,
  ]
    .filter((x) => x != null)
    .join("\n");
  const kb = new InlineKeyboard()
    .text("🔄 بروزرسانی", "adm:stats:today")
    .row()
    .text("↩️ پنل ادمین", "adm:home");
  if (ctx.callbackQuery.message) {
    await ctx.editMessageText(text, { reply_markup: kb }).catch(async () => {
      await ctx.reply(text, { reply_markup: kb });
    });
  } else {
    await ctx.reply(text, { reply_markup: kb });
  }
});

adminHandler.callbackQuery("adm:overview", async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const s = await getRegistrationStats();
  await ctx.answerCallbackQuery();
  await ctx.reply(
    [
      "👥 خلاصه کاربران",
      "",
      `ثبت‌نام کامل: ${formatNum(s.totalRegistered)}`,
      `👩 دختر: ${formatNum(s.registeredFemale)}`,
      `👨 پسر: ${formatNum(s.registeredMale)}`,
      s.registeredOtherGender > 0
        ? `❔ بدون جنسیت/سایر: ${formatNum(s.registeredOtherGender)}`
        : null,
      `فعال در اکسپلور: ${formatNum(s.totalActive)}`,
      `ثبت‌نام ناقص: ${formatNum(s.incompleteRegs)}`,
      `حساب‌های حذف‌شده: ${formatNum(s.deletedAccounts)}`,
      `عکس pending: ${formatNum(s.pendingPhotos)}`,
      `احراز pending: ${formatNum(s.pendingFaces)}`,
    ]
      .filter((x) => x != null)
      .join("\n"),
    {
      reply_markup: new InlineKeyboard().text("↩️ پنل ادمین", "adm:home"),
    },
  );
});

adminHandler.callbackQuery("adm:revenue", async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const r = await getRevenueStats();
  await ctx.answerCallbackQuery();

  const line = (
    title: string,
    block: { toman: number; diamonds: number; orders: number },
  ) =>
    [
      title,
      `💵 ${formatToman(block.toman)}`,
      `📦 ${formatNum(block.orders)} سفارش · 💰 ${formatNum(block.diamonds)} سکه`,
    ].join("\n");

  const recent =
    r.recentPaid.length === 0
      ? ["هنوز پرداخت موفقی ثبت نشده."]
      : r.recentPaid.map((o) => {
          const who =
            o.user.displayName ??
            (o.user.userCode ? `/user_${o.user.userCode}` : `#${o.userId}`);
          const when = o.updatedAt.toLocaleString("fa-IR", {
            dateStyle: "short",
            timeStyle: "short",
          });
          return `• ${who} — ${formatToman(o.amountToman)} (${formatNum(o.diamonds)}💰) — ${when}`;
        });

  const text = [
    "💵 درآمد فروش سکه",
    "",
    line("📅 امروز", r.today),
    "",
    line("↩️ دیروز", r.yesterday),
    "",
    line("📆 ۷ روز اخیر", r.week),
    "",
    line("🗓 این ماه", r.month),
    "",
    line("♾ کل درآمد (پرداخت‌شده)", r.all),
    "",
    "—— در انتظار پرداخت ——",
    `⏳ ${formatToman(r.pending.toman)} · ${formatNum(r.pending.orders)} سفارش باز`,
    "",
    "—— آخرین پرداخت‌های موفق ——",
    ...recent,
  ].join("\n");

  await ctx
    .editMessageText(text, {
      reply_markup: new InlineKeyboard()
        .text("🔄 بروزرسانی درآمد", "adm:revenue")
        .row()
        .text("↩️ پنل ادمین", "adm:home"),
    })
    .catch(async () => {
      await ctx.reply(text, {
        reply_markup: new InlineKeyboard()
          .text("🔄 بروزرسانی درآمد", "adm:revenue")
          .row()
          .text("↩️ پنل ادمین", "adm:home"),
      });
    });
});

adminHandler.callbackQuery("adm:stats:month", async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const s = await getRegistrationStats();
  await ctx.answerCallbackQuery();
  const thisMonth = s.byMonth[0];
  await ctx.reply(
    [
      "📊 آمار ثبت‌نام این ماه",
      "",
      `ماه جاری (${thisMonth?.label ?? "—"}): ${formatNum(thisMonth?.count ?? s.registeredThisMonth)}`,
      `👩 دختر این ماه: ${formatNum(thisMonth?.female ?? 0)}`,
      `👨 پسر این ماه: ${formatNum(thisMonth?.male ?? 0)}`,
      `امروز: ${formatNum(s.registeredToday)}`,
      "",
      `کل ثبت‌نام‌شده: ${formatNum(s.totalRegistered)}`,
      `👩 کل دختر: ${formatNum(s.registeredFemale)}`,
      `👨 کل پسر: ${formatNum(s.registeredMale)}`,
      `کل فعال: ${formatNum(s.totalActive)}`,
    ].join("\n"),
    {
      reply_markup: new InlineKeyboard().text("↩️ پنل ادمین", "adm:home"),
    },
  );
});

adminHandler.callbackQuery("adm:stats:3m", async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const s = await getRegistrationStats();
  await ctx.answerCallbackQuery();
  const lines = s.byMonth.map(
    (m) =>
      `• ${m.label}: ${formatNum(m.count)} نفر (👩 ${formatNum(m.female)} · 👨 ${formatNum(m.male)})`,
  );
  await ctx.reply(
    [
      "📈 آمار ثبت‌نام ۳ ماه اخیر",
      "",
      ...lines,
      "",
      `جمع ۳ ماه: ${formatNum(s.registeredLast3Months)}`,
      `👩 کل دختر: ${formatNum(s.registeredFemale)}`,
      `👨 کل پسر: ${formatNum(s.registeredMale)}`,
    ].join("\n"),
    {
      reply_markup: new InlineKeyboard().text("↩️ پنل ادمین", "adm:home"),
    },
  );
});

adminHandler.callbackQuery("adm:photos", async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  // اول پاسخ callback — بعد کار سنگین، تا اسپینر گیر نکند
  await ctx.answerCallbackQuery();
  const list = await listPendingPhotos(15);
  if (!list.length) {
    await ctx.reply("📷 عکسی در انتظار تأیید نیست.", {
      reply_markup: new InlineKeyboard().text("↩️ پنل ادمین", "adm:home"),
    });
    return;
  }
  await ctx.reply(`📷 ${formatNum(list.length)} عکس در صف تأیید:`);
  for (const u of list) {
    if (!u.photoPendingFileId) continue;
    const info = await formatAdminUserLine(u);
    await ctx.api
      .sendPhoto(ctx.from!.id, u.photoPendingFileId, {
        caption: [
          "📷 عکس پروفایل — در انتظار",
          info,
          `${genderLabel(u.gender)} | ${u.age ?? "—"} | ${[u.province, u.city].filter(Boolean).join("، ") || "—"}`,
        ].join("\n"),
        reply_markup: adminPhotoKeyboard(u.id),
      })
      .catch(() => undefined);
  }
});

adminHandler.callbackQuery("adm:faces", async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  await ctx.answerCallbackQuery();
  const list = await listPendingFaces(15);
  if (!list.length) {
    await ctx.reply("✅ احرازی در انتظار نیست.", {
      reply_markup: new InlineKeyboard().text("↩️ پنل ادمین", "adm:home"),
    });
    return;
  }
  await ctx.reply(`✅ ${formatNum(list.length)} احراز در صف:`);
  for (const u of list) {
    if (!u.facePendingFileId) continue;
    await sendPendingFaceToAdmin(ctx.api, ctx.from!.id, u);
  }
});

adminHandler.callbackQuery(/^adm:giftall$/, async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const { patchUser, findByTelegram } = await import("../db/users.js");
  const {
    giftAllAmountKeyboard,
    countGiftRecipients,
  } = await import("../services/adminGiftAll.js");
  const admin = await findByTelegram(ctx.from!.id);
  if (!admin) {
    await ctx.answerCallbackQuery({
      text: "اول یک‌بار /start بزن",
      show_alert: true,
    });
    return;
  }
  await patchUser(admin.id, { state: "idle", pendingAnonTo: null });
  const counts = await countGiftRecipients();
  await ctx.answerCallbackQuery();
  const text = [
    "🎁 هدیه سکه به همه کاربران",
    "",
    `ثبت‌نام‌شده‌ها (دریافت سکه): ${formatNum(counts.allRegistered)}`,
    `کاربران واقعی (دریافت پیام): ${formatNum(counts.realMessagable)}`,
    "",
    "مقدار هدیه را انتخاب کن:",
  ].join("\n");
  await ctx
    .editMessageText(text, { reply_markup: giftAllAmountKeyboard() })
    .catch(async () => {
      await ctx.reply(text, { reply_markup: giftAllAmountKeyboard() });
    });
});

adminHandler.callbackQuery("adm:giftall:cancel", async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const { patchUser, findByTelegram } = await import("../db/users.js");
  const admin = await findByTelegram(ctx.from!.id);
  if (admin) {
    await patchUser(admin.id, { state: "idle", pendingAnonTo: null });
  }
  await ctx.answerCallbackQuery({ text: "لغو شد" });
  const s = await getRegistrationStats();
  await ctx
    .editMessageText(
      [
        "❌ هدیه همگانی لغو شد.",
        "",
        "🛠 پنل ادمین دوردوریا",
      ].join("\n"),
      {
        reply_markup: adminPanelKeyboard(s.pendingPhotos, s.pendingFaces),
      },
    )
    .catch(async () => {
      await ctx.reply("❌ هدیه همگانی لغو شد.", {
        reply_markup: adminPanelKeyboard(s.pendingPhotos, s.pendingFaces),
      });
    });
});

adminHandler.callbackQuery("adm:giftall:custom", async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const { patchUser, findByTelegram } = await import("../db/users.js");
  const admin = await findByTelegram(ctx.from!.id);
  if (!admin) {
    await ctx.answerCallbackQuery({ text: "خطا" });
    return;
  }
  await patchUser(admin.id, {
    state: "admin_gift_all_amount",
    pendingAnonTo: null,
  });
  await ctx.answerCallbackQuery();
  await ctx.reply(
    [
      "✏️ مقدار هدیه همگانی را عدد بفرست.",
      "مثال: ۵۰ یا 50",
      "حداکثر: ۱٬۰۰۰٬۰۰۰",
      "",
      "انصراف: /cancel",
    ].join("\n"),
    {
      reply_markup: new InlineKeyboard()
        .text("❌ انصراف", "adm:giftall:cancel")
        .danger(),
    },
  );
});

adminHandler.callbackQuery(/^adm:giftall:amt:(\d+)$/, async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const amount = Number(ctx.match![1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    await ctx.answerCallbackQuery({ text: "نامعتبر", show_alert: true });
    return;
  }
  const {
    countGiftRecipients,
    giftAllConfirmKeyboard,
    buildGiftAllMessage,
  } = await import("../services/adminGiftAll.js");
  const counts = await countGiftRecipients();
  await ctx.answerCallbackQuery();
  const preview = buildGiftAllMessage(amount, "fa")
    .replace(/<\/?b>/g, "")
    .slice(0, 400);
  const text = [
    "⚠️ تأیید هدیه همگانی",
    "",
    `مقدار: +${formatNum(amount)} سکه برای هر کاربر`,
    `سکه به: ${formatNum(counts.allRegistered)} نفر`,
    `پیام به: ${formatNum(counts.realMessagable)} نفر واقعی`,
    "",
    "—— پیش‌نمایش پیام ——",
    preview,
    "",
    "بعد از تأیید، ارسال شروع می‌شود.",
  ].join("\n");
  await ctx
    .editMessageText(text, { reply_markup: giftAllConfirmKeyboard(amount) })
    .catch(async () => {
      await ctx.reply(text, { reply_markup: giftAllConfirmKeyboard(amount) });
    });
});

adminHandler.callbackQuery(/^adm:giftall:ok:(\d+)$/, async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const amount = Number(ctx.match![1]);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
    await ctx.answerCallbackQuery({ text: "نامعتبر", show_alert: true });
    return;
  }
  const { patchUser, findByTelegram } = await import("../db/users.js");
  const { giftCoinsToAllUsers } = await import("../services/adminGiftAll.js");
  const admin = await findByTelegram(ctx.from!.id);
  if (admin) {
    await patchUser(admin.id, { state: "idle", pendingAnonTo: null });
  }
  await ctx.answerCallbackQuery({ text: "شروع ارسال…" });
  await ctx
    .editMessageText(
      [
        "⏳ در حال هدیه دادن سکه و ارسال پیام…",
        `مقدار: +${formatNum(amount)} سکه`,
        "",
        "لطفاً صبر کن؛ گزارش نهایی همین‌جا می‌آید.",
      ].join("\n"),
    )
    .catch(() => undefined);

  const progressMsg = await ctx.reply("📤 پیشرفت: ۰٪");
  let lastPct = -1;
  try {
    const result = await giftCoinsToAllUsers(
      ctx.api,
      amount,
      async (done, total) => {
        const pct = total ? Math.floor((done / total) * 100) : 100;
        if (pct === lastPct || (pct < 100 && pct - lastPct < 10)) return;
        lastPct = pct;
        await ctx.api
          .editMessageText(
            ctx.chat!.id,
            progressMsg.message_id,
            `📤 پیشرفت ارسال پیام: ${formatNum(done)}/${formatNum(total)} (${pct}٪)`,
          )
          .catch(() => undefined);
      },
    );

    const doneText = [
      "✅ هدیه همگانی انجام شد",
      "",
      `➕ سکه برای هر نفر: ${formatNum(result.amount)}`,
      `👥 موجودی به‌روز شد: ${formatNum(result.credited)} کاربر`,
      `📨 پیام ارسال شد: ${formatNum(result.messaged)}`,
      result.failed
        ? `⚠️ ارسال ناموفق: ${formatNum(result.failed)} (بلاک ربات / حذف‌شده)`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    await ctx.api
      .editMessageText(ctx.chat!.id, progressMsg.message_id, doneText, {
        reply_markup: new InlineKeyboard()
          .text("🎁 هدیه دوباره", "adm:giftall")
          .row()
          .text("↩️ پنل ادمین", "adm:home"),
      })
      .catch(async () => {
        await ctx.reply(doneText, {
          reply_markup: new InlineKeyboard()
            .text("🎁 هدیه دوباره", "adm:giftall")
            .row()
            .text("↩️ پنل ادمین", "adm:home"),
        });
      });
  } catch (err) {
    console.error("gift all failed", err);
    await ctx.reply("❌ خطا در هدیه همگانی. دوباره تلاش کن.", {
      reply_markup: new InlineKeyboard().text("↩️ پنل ادمین", "adm:home"),
    });
  }
});

adminHandler.callbackQuery("adm:givecoins", async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const { patchUser, findByTelegram } = await import("../db/users.js");
  const {
    giveCoinsCancelKeyboard,
  } = await import("../services/adminCoins.js");
  const admin = await findByTelegram(ctx.from!.id);
  if (!admin) {
    await ctx.answerCallbackQuery({
      text: "اول یک‌بار /start بزن",
      show_alert: true,
    });
    return;
  }
  await patchUser(admin.id, {
    state: "admin_give_code",
    pendingAnonTo: null,
  });
  await ctx.answerCallbackQuery();
  await ctx.reply(
    [
      "💰 افزودن سکه به کاربر",
      "",
      "یکی از این‌ها را بفرست:",
      "• کد کاربر: Y2FMzi",
      "• دستور: /user_Y2FMzi",
      "• یوزرنیم: @username",
      "• تلگرام‌آیدی عددی",
      "",
      "انصراف: دکمه زیر یا /cancel",
    ].join("\n"),
    { reply_markup: giveCoinsCancelKeyboard() },
  );
});

adminHandler.callbackQuery("adm:give:cancel", async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const { patchUser, findByTelegram } = await import("../db/users.js");
  const admin = await findByTelegram(ctx.from!.id);
  if (admin) {
    await patchUser(admin.id, { state: "idle", pendingAnonTo: null });
  }
  await ctx.answerCallbackQuery({ text: "لغو شد" });
  const s = await getRegistrationStats();
  await ctx.editMessageText(
    [
      "❌ افزودن سکه لغو شد.",
      "",
      "🛠 پنل ادمین دوردوریا",
      `📷 عکس pending: ${formatNum(s.pendingPhotos)}`,
      `✅ احراز pending: ${formatNum(s.pendingFaces)}`,
    ].join("\n"),
    {
      reply_markup: adminPanelKeyboard(s.pendingPhotos, s.pendingFaces),
    },
  ).catch(async () => {
    await ctx.reply("❌ افزودن سکه لغو شد.", {
      reply_markup: adminPanelKeyboard(s.pendingPhotos, s.pendingFaces),
    });
  });
});

adminHandler.callbackQuery(/^adm:give:pick:(\d+)$/, async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const targetId = Number(ctx.match![1]);
  const { prisma } = await import("../db/prisma.js");
  const { patchUser, findByTelegram } = await import("../db/users.js");
  const {
    describeTarget,
    giveCoinsAmountKeyboard,
  } = await import("../services/adminCoins.js");
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  const admin = await findByTelegram(ctx.from!.id);
  if (!target || target.deletedAt || !admin) {
    await ctx.answerCallbackQuery({ text: "کاربر پیدا نشد", show_alert: true });
    return;
  }
  await patchUser(admin.id, {
    state: "admin_give_amount",
    pendingAnonTo: String(target.id),
  });
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    [
      "💰 انتخاب مقدار سکه",
      "",
      await describeTarget(target),
      "",
      "یک مبلغ آماده را بزن یا «مقدار دلخواه» را انتخاب کن.",
    ].join("\n"),
    { reply_markup: giveCoinsAmountKeyboard(target.id) },
  ).catch(async () => {
    await ctx.reply(
      [
        "💰 انتخاب مقدار سکه",
        "",
        await describeTarget(target),
      ].join("\n"),
      { reply_markup: giveCoinsAmountKeyboard(target.id) },
    );
  });
});

adminHandler.callbackQuery(/^adm:give:custom:(\d+)$/, async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const targetId = Number(ctx.match![1]);
  const { patchUser, findByTelegram } = await import("../db/users.js");
  const { giveCoinsCancelKeyboard } = await import("../services/adminCoins.js");
  const admin = await findByTelegram(ctx.from!.id);
  if (!admin) {
    await ctx.answerCallbackQuery({ text: "خطا" });
    return;
  }
  await patchUser(admin.id, {
    state: "admin_give_amount",
    pendingAnonTo: String(targetId),
  });
  await ctx.answerCallbackQuery();
  await ctx.reply(
    [
      "✏️ مقدار دلخواه را به‌صورت عدد بفرست.",
      "مثال: ۱۰۰ یا 100",
      "حداکثر: ۱٬۰۰۰٬۰۰۰",
    ].join("\n"),
    { reply_markup: giveCoinsCancelKeyboard() },
  );
});

adminHandler.callbackQuery(/^adm:give:amt:(\d+):(\d+)$/, async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const targetId = Number(ctx.match![1]);
  const amount = Number(ctx.match![2]);
  const { prisma } = await import("../db/prisma.js");
  const { patchUser, findByTelegram } = await import("../db/users.js");
  const {
    describeTarget,
    giveCoinsConfirmKeyboard,
  } = await import("../services/adminCoins.js");
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  const admin = await findByTelegram(ctx.from!.id);
  if (!target || !admin || !Number.isFinite(amount) || amount <= 0) {
    await ctx.answerCallbackQuery({ text: "نامعتبر", show_alert: true });
    return;
  }
  await patchUser(admin.id, {
    state: "admin_give_confirm",
    pendingAnonTo: `${target.id}:${amount}`,
  });
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    [
      "⚠️ تأیید افزودن سکه",
      "",
      await describeTarget(target),
      "",
      `مقدار: +${formatNum(amount)} سکه`,
      `موجودی بعد از تأیید: ${formatNum(target.diamonds + amount)} 💰`,
    ].join("\n"),
    { reply_markup: giveCoinsConfirmKeyboard(target.id, amount) },
  ).catch(async () => {
    await ctx.reply(
      [
        "⚠️ تأیید افزودن سکه",
        "",
        await describeTarget(target),
        `مقدار: +${formatNum(amount)} سکه`,
      ].join("\n"),
      { reply_markup: giveCoinsConfirmKeyboard(target.id, amount) },
    );
  });
});

adminHandler.callbackQuery(/^adm:give:ok:(\d+):(\d+)$/, async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const targetId = Number(ctx.match![1]);
  const amount = Number(ctx.match![2]);
  const { patchUser, findByTelegram } = await import("../db/users.js");
  const {
    creditUserCoins,
    describeTarget,
  } = await import("../services/adminCoins.js");
  const { prisma } = await import("../db/prisma.js");
  const admin = await findByTelegram(ctx.from!.id);
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (
    !admin ||
    !target ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > 1_000_000
  ) {
    await ctx.answerCallbackQuery({ text: "نامعتبر", show_alert: true });
    return;
  }

  const updated = await creditUserCoins(target.id, amount);
  await patchUser(admin.id, { state: "idle", pendingAnonTo: null });
  await ctx.answerCallbackQuery({ text: "سکه اضافه شد ✅" });

  const doneText = [
    "✅ سکه با موفقیت اضافه شد",
    "",
    await describeTarget({ ...target, diamonds: updated.diamonds }),
    "",
    `➕ افزوده‌شده: ${formatNum(amount)} سکه`,
  ].join("\n");

  await ctx
    .editMessageText(doneText, {
      reply_markup: new InlineKeyboard()
        .text("💰 افزودن دوباره", "adm:givecoins")
        .row()
        .text("↩️ پنل ادمین", "adm:home"),
    })
    .catch(async () => {
      await ctx.reply(doneText, {
        reply_markup: new InlineKeyboard()
          .text("💰 افزودن دوباره", "adm:givecoins")
          .row()
          .text("↩️ پنل ادمین", "adm:home"),
      });
    });

  if (target.telegramId < 9000000000n) {
    await ctx.api
      .sendMessage(
        Number(target.telegramId),
        [
          "🎁 از طرف پشتیبانی دوردوریا",
          `${formatNum(amount)} سکه به حسابت اضافه شد.`,
          `موجودی: ${formatNum(updated.diamonds)} 💰`,
        ].join("\n"),
      )
      .catch(() => undefined);
  }
});

async function startAdminLookupFlow(
  ctx: { from?: { id: number }; answerCallbackQuery: Function; reply: Function },
  opts: {
    state: string;
    title: string;
    cancelKind: "clearphoto" | "ban" | "unban";
  },
) {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const { patchUser, findByTelegram } = await import("../db/users.js");
  const { adminModerationCancelKeyboard } = await import(
    "../services/adminModeration.js"
  );
  const admin = await findByTelegram(ctx.from!.id);
  if (!admin) {
    await ctx.answerCallbackQuery({
      text: "اول یک‌بار /start بزن",
      show_alert: true,
    });
    return;
  }
  await patchUser(admin.id, { state: opts.state, pendingAnonTo: null });
  await ctx.answerCallbackQuery();
  await ctx.reply(
    [
      opts.title,
      "",
      "یکی از این‌ها را بفرست:",
      "• آیدی داخلی: ۱۲۳",
      "• کد کاربر: Y2FMzi",
      "• دستور: /user_Y2FMzi",
      "• یوزرنیم: @username",
      "• تلگرام‌آیدی عددی",
      "",
      "انصراف: دکمه زیر یا /cancel",
    ].join("\n"),
    { reply_markup: adminModerationCancelKeyboard(opts.cancelKind) },
  );
}

adminHandler.callbackQuery("adm:clearphoto", async (ctx) => {
  await startAdminLookupFlow(ctx, {
    state: "admin_clear_photo_code",
    title: "🗑 حذف عکس کاربر",
    cancelKind: "clearphoto",
  });
});

adminHandler.callbackQuery("adm:ban", async (ctx) => {
  await startAdminLookupFlow(ctx, {
    state: "admin_ban_code",
    title: "🚫 مسدود کردن کاربر از ربات",
    cancelKind: "ban",
  });
});

adminHandler.callbackQuery("adm:unban", async (ctx) => {
  await startAdminLookupFlow(ctx, {
    state: "admin_unban_code",
    title: "✅ رفع مسدودیت کاربر",
    cancelKind: "unban",
  });
});

async function cancelModerationFlow(
  ctx: {
    from?: { id: number };
    answerCallbackQuery: Function;
    editMessageText: Function;
    reply: Function;
  },
  label: string,
) {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const { patchUser, findByTelegram } = await import("../db/users.js");
  const admin = await findByTelegram(ctx.from!.id);
  if (admin) {
    await patchUser(admin.id, { state: "idle", pendingAnonTo: null });
  }
  await ctx.answerCallbackQuery({ text: "لغو شد" });
  const s = await getRegistrationStats();
  const text = [
    `❌ ${label} لغو شد.`,
    "",
    "🛠 پنل ادمین دوردوریا",
    `📷 عکس pending: ${formatNum(s.pendingPhotos)}`,
    `✅ احراز pending: ${formatNum(s.pendingFaces)}`,
  ].join("\n");
  await ctx
    .editMessageText(text, {
      reply_markup: adminPanelKeyboard(s.pendingPhotos, s.pendingFaces),
    })
    .catch(async () => {
      await ctx.reply(`❌ ${label} لغو شد.`, {
        reply_markup: adminPanelKeyboard(s.pendingPhotos, s.pendingFaces),
      });
    });
}

adminHandler.callbackQuery("adm:clearphoto:cancel", (ctx) =>
  cancelModerationFlow(ctx, "حذف عکس"),
);
adminHandler.callbackQuery("adm:ban:cancel", (ctx) =>
  cancelModerationFlow(ctx, "مسدودسازی"),
);
adminHandler.callbackQuery("adm:unban:cancel", (ctx) =>
  cancelModerationFlow(ctx, "رفع مسدودیت"),
);

adminHandler.callbackQuery(/^adm:clearphoto:ok:(\d+)$/, async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const targetId = Number(ctx.match![1]);
  const { patchUser, findByTelegram } = await import("../db/users.js");
  const { prisma } = await import("../db/prisma.js");
  const {
    clearUserPhotoByAdmin,
    notifyTargetSafe,
  } = await import("../services/adminModeration.js");
  const { describeTarget } = await import("../services/adminCoins.js");
  const admin = await findByTelegram(ctx.from!.id);
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!admin || !target || target.deletedAt) {
    await ctx.answerCallbackQuery({ text: "کاربر پیدا نشد", show_alert: true });
    return;
  }
  await clearUserPhotoByAdmin(target.id);
  await patchUser(admin.id, { state: "idle", pendingAnonTo: null });
  await ctx.answerCallbackQuery({ text: "عکس پاک شد ✅" });
  const fresh = await prisma.user.findUnique({ where: { id: target.id } });
  const done = [
    "✅ عکس کاربر پاک شد",
    "",
    await describeTarget(fresh ?? target),
    "",
    "عکس و احراز چهره ریست شد.",
  ].join("\n");
  await ctx
    .editMessageText(done, {
      reply_markup: new InlineKeyboard()
        .text("🗑 حذف عکس دیگر", "adm:clearphoto")
        .row()
        .text("↩️ پنل ادمین", "adm:home"),
    })
    .catch(async () => {
      await ctx.reply(done, {
        reply_markup: new InlineKeyboard()
          .text("🗑 حذف عکس دیگر", "adm:clearphoto")
          .row()
          .text("↩️ پنل ادمین", "adm:home"),
      });
    });
  await notifyTargetSafe(
    ctx.api,
    target,
    "📷 عکس پروفایلت توسط پشتیبانی حذف شد.\nالان با عکس پیش‌فرض دیده می‌شوی. می‌توانی دوباره عکس بفرستی.",
  );
});

adminHandler.callbackQuery(/^adm:ban:ok:(\d+)$/, async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const targetId = Number(ctx.match![1]);
  const { patchUser, findByTelegram } = await import("../db/users.js");
  const { prisma } = await import("../db/prisma.js");
  const {
    banUserByAdmin,
    notifyTargetSafe,
  } = await import("../services/adminModeration.js");
  const { describeTarget } = await import("../services/adminCoins.js");
  const admin = await findByTelegram(ctx.from!.id);
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!admin || !target || target.deletedAt) {
    await ctx.answerCallbackQuery({ text: "کاربر پیدا نشد", show_alert: true });
    return;
  }
  if (isAdmin(Number(target.telegramId))) {
    await ctx.answerCallbackQuery({
      text: "ادمین را نمی‌شود مسدود کرد",
      show_alert: true,
    });
    return;
  }
  try {
    const { leaveQueueOrChat } = await import("../services/match.js");
    await leaveQueueOrChat(ctx.api, target, true);
  } catch {
    /* ignore */
  }
  await banUserByAdmin(target.id);
  await patchUser(admin.id, { state: "idle", pendingAnonTo: null });
  await ctx.answerCallbackQuery({ text: "مسدود شد 🚫" });
  const fresh = await prisma.user.findUnique({ where: { id: target.id } });
  const done = [
    "🚫 کاربر از ربات مسدود شد",
    "",
    await describeTarget(fresh ?? target),
  ].join("\n");
  await ctx
    .editMessageText(done, {
      reply_markup: new InlineKeyboard()
        .text("🚫 مسدود کردن دیگر", "adm:ban")
        .row()
        .text("✅ رفع مسدودیت", "adm:unban")
        .row()
        .text("↩️ پنل ادمین", "adm:home"),
    })
    .catch(async () => {
      await ctx.reply(done, {
        reply_markup: new InlineKeyboard()
          .text("↩️ پنل ادمین", "adm:home"),
      });
    });
  await notifyTargetSafe(
    ctx.api,
    target,
    "🚫 حسابت توسط پشتیبانی مسدود شد.\nامکان استفاده از ربات وجود ندارد.",
  );
});

adminHandler.callbackQuery(/^adm:unban:ok:(\d+)$/, async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const targetId = Number(ctx.match![1]);
  const { patchUser, findByTelegram } = await import("../db/users.js");
  const { prisma } = await import("../db/prisma.js");
  const {
    unbanUserByAdmin,
    notifyTargetSafe,
  } = await import("../services/adminModeration.js");
  const { describeTarget } = await import("../services/adminCoins.js");
  const admin = await findByTelegram(ctx.from!.id);
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!admin || !target || target.deletedAt) {
    await ctx.answerCallbackQuery({ text: "کاربر پیدا نشد", show_alert: true });
    return;
  }
  if (!target.bannedAt && target.state !== "banned") {
    await ctx.answerCallbackQuery({
      text: "این کاربر مسدود نیست",
      show_alert: true,
    });
    return;
  }
  await unbanUserByAdmin(target.id);
  await patchUser(admin.id, { state: "idle", pendingAnonTo: null });
  await ctx.answerCallbackQuery({ text: "رفع مسدودیت ✅" });
  const fresh = await prisma.user.findUnique({ where: { id: target.id } });
  const done = [
    "✅ مسدودیت کاربر برداشته شد",
    "",
    await describeTarget(fresh ?? target),
  ].join("\n");
  await ctx
    .editMessageText(done, {
      reply_markup: new InlineKeyboard()
        .text("✅ رفع مسدودیت دیگر", "adm:unban")
        .row()
        .text("↩️ پنل ادمین", "adm:home"),
    })
    .catch(async () => {
      await ctx.reply(done, {
        reply_markup: new InlineKeyboard().text("↩️ پنل ادمین", "adm:home"),
      });
    });
  await notifyTargetSafe(
    ctx.api,
    target,
    "✅ مسدودیت حسابت برداشته شد.\nدوباره می‌توانی از ربات استفاده کنی. /start بزن.",
  );
});

/** دریافت شناسه / مقدار سکه از ادمین */
adminHandler.on("message:text", async (ctx, next) => {
  if (!adminOnly(ctx)) return next();
  const text = ctx.message.text.trim();

  const { findByTelegram, patchUser } = await import("../db/users.js");
  const { allMenuButtonTexts } = await import("../i18n/index.js");
  const {
    resolveAdminTarget,
    describeTarget,
    giveCoinsAmountKeyboard,
    giveCoinsConfirmKeyboard,
    giveCoinsCancelKeyboard,
    parseCoinAmount,
  } = await import("../services/adminCoins.js");
  const {
    adminModerationCancelKeyboard,
    clearPhotoConfirmKeyboard,
    banConfirmKeyboard,
    unbanConfirmKeyboard,
    confirmClearPhotoText,
    confirmBanText,
    confirmUnbanText,
  } = await import("../services/adminModeration.js");

  const admin = await findByTelegram(ctx.from!.id);
  if (!admin) return next();

  const inGiveFlow =
    admin.state === "admin_give_code" ||
    admin.state === "admin_give_amount" ||
    admin.state === "admin_give_confirm" ||
    admin.state === "admin_gift_all_amount";

  const inModerationFlow =
    admin.state === "admin_clear_photo_code" ||
    admin.state === "admin_ban_code" ||
    admin.state === "admin_unban_code";

  const inVoucherFlow =
    admin.state === "admin_voucher_coins" ||
    admin.state === "admin_voucher_maxuses" ||
    admin.state === "admin_voucher_expiry" ||
    admin.state === "admin_voucher_code" ||
    admin.state === "admin_voucher_confirm";

  if (!inGiveFlow && !inVoucherFlow && !inModerationFlow) return next();

  // دستورات سیستمی را رد نکن؛ /cancel و /admin در start/admin جدا هستند
  if (
    text.startsWith("/") &&
    !/^\/user_/i.test(text) &&
    text !== "/cancel"
  ) {
    // اگر ادمین دستور دیگری زد، فلو را رها کن
    await patchUser(admin.id, { state: "idle", pendingAnonTo: null });
    return next();
  }
  if (text === "/cancel" || text.startsWith("/cancel")) {
    return next();
  }

  // دکمه‌های منو → خروج از فلو
  const menuTexts = allMenuButtonTexts();
  if (menuTexts.has(text)) {
    await patchUser(admin.id, { state: "idle", pendingAnonTo: null });
    return next();
  }

  if (admin.state === "admin_clear_photo_code") {
    const target = await resolveAdminTarget(text);
    if (!target) {
      await ctx.reply(
        [
          "❌ کاربر پیدا نشد.",
          "",
          "آیدی / کد / یوزرنیم / تلگرام‌آیدی را دوباره بفرست.",
          "انصراف: /cancel",
        ].join("\n"),
        { reply_markup: adminModerationCancelKeyboard("clearphoto") },
      );
      return;
    }
    await patchUser(admin.id, {
      state: "idle",
      pendingAnonTo: String(target.id),
    });
    await ctx.reply(await confirmClearPhotoText(target), {
      reply_markup: clearPhotoConfirmKeyboard(target.id),
    });
    return;
  }

  if (admin.state === "admin_ban_code") {
    const target = await resolveAdminTarget(text);
    if (!target) {
      await ctx.reply(
        [
          "❌ کاربر پیدا نشد.",
          "",
          "آیدی / کد / یوزرنیم / تلگرام‌آیدی را دوباره بفرست.",
          "انصراف: /cancel",
        ].join("\n"),
        { reply_markup: adminModerationCancelKeyboard("ban") },
      );
      return;
    }
    await patchUser(admin.id, {
      state: "idle",
      pendingAnonTo: String(target.id),
    });
    await ctx.reply(await confirmBanText(target), {
      reply_markup: banConfirmKeyboard(target.id),
    });
    return;
  }

  if (admin.state === "admin_unban_code") {
    const target = await resolveAdminTarget(text);
    if (!target) {
      await ctx.reply(
        [
          "❌ کاربر پیدا نشد.",
          "",
          "آیدی / کد / یوزرنیم / تلگرام‌آیدی را دوباره بفرست.",
          "انصراف: /cancel",
        ].join("\n"),
        { reply_markup: adminModerationCancelKeyboard("unban") },
      );
      return;
    }
    await patchUser(admin.id, {
      state: "idle",
      pendingAnonTo: String(target.id),
    });
    await ctx.reply(await confirmUnbanText(target), {
      reply_markup: unbanConfirmKeyboard(target.id),
    });
    return;
  }

  if (admin.state === "admin_gift_all_amount") {
    const {
      countGiftRecipients,
      giftAllConfirmKeyboard,
      buildGiftAllMessage,
    } = await import("../services/adminGiftAll.js");
    const amount = parseCoinAmount(text);
    if (amount == null) {
      await ctx.reply("عدد معتبر بفرست (مثلاً ۵۰) یا /cancel");
      return;
    }
    await patchUser(admin.id, { state: "idle", pendingAnonTo: null });
    const counts = await countGiftRecipients();
    const preview = buildGiftAllMessage(amount, "fa")
      .replace(/<\/?b>/g, "")
      .slice(0, 400);
    await ctx.reply(
      [
        "⚠️ تأیید هدیه همگانی",
        "",
        `مقدار: +${formatNum(amount)} سکه برای هر کاربر`,
        `سکه به: ${formatNum(counts.allRegistered)} نفر`,
        `پیام به: ${formatNum(counts.realMessagable)} نفر واقعی`,
        "",
        "—— پیش‌نمایش پیام ——",
        preview,
      ].join("\n"),
      { reply_markup: giftAllConfirmKeyboard(amount) },
    );
    return;
  }

  if (admin.state === "admin_give_code") {
    const target = await resolveAdminTarget(text);
    if (!target || !target.registered) {
      await ctx.reply(
        [
          "❌ کاربر پیدا نشد.",
          "",
          "کد /user_XXXX یا یوزرنیم یا تلگرام‌آیدی را دوباره بفرست.",
          "انصراف: /cancel",
        ].join("\n"),
        { reply_markup: giveCoinsCancelKeyboard() },
      );
      return;
    }
    await patchUser(admin.id, {
      state: "admin_give_amount",
      pendingAnonTo: String(target.id),
    });
    await ctx.reply(
      [
        "✅ کاربر پیدا شد",
        "",
        await describeTarget(target),
        "",
        "مقدار سکه را از دکمه‌ها انتخاب کن یا «مقدار دلخواه» را بزن.",
      ].join("\n"),
      { reply_markup: giveCoinsAmountKeyboard(target.id) },
    );
    return;
  }

  if (admin.state === "admin_give_amount" && admin.pendingAnonTo) {
    const targetId = Number(String(admin.pendingAnonTo).split(":")[0]);
    const amount = parseCoinAmount(text);
    if (amount == null) {
      await ctx.reply("عدد معتبر بفرست (مثلاً ۱۰۰) یا از دکمه‌ها استفاده کن.", {
        reply_markup: giveCoinsCancelKeyboard(),
      });
      return;
    }
    const { prisma } = await import("../db/prisma.js");
    const target = await prisma.user.findUnique({ where: { id: targetId } });
    if (!target) {
      await patchUser(admin.id, { state: "idle", pendingAnonTo: null });
      await ctx.reply("کاربر پیدا نشد.", {
        reply_markup: new InlineKeyboard().text("↩️ پنل ادمین", "adm:home"),
      });
      return;
    }
    await patchUser(admin.id, {
      state: "admin_give_confirm",
      pendingAnonTo: `${target.id}:${amount}`,
    });
    await ctx.reply(
      [
        "⚠️ تأیید افزودن سکه",
        "",
        await describeTarget(target),
        "",
        `مقدار: +${formatNum(amount)} سکه`,
        `موجودی بعد از تأیید: ${formatNum(target.diamonds + amount)} 💰`,
      ].join("\n"),
      { reply_markup: giveCoinsConfirmKeyboard(target.id, amount) },
    );
    return;
  }

  if (admin.state === "admin_give_confirm") {
    await ctx.reply("لطفاً از دکمه‌های تأیید / انصراف استفاده کن.", {
      reply_markup: giveCoinsCancelKeyboard(),
    });
    return;
  }

  if (inVoucherFlow) {
    const { handleAdminVoucherText } = await import("./adminVouchers.js");
    const handled = await handleAdminVoucherText(ctx, admin, text);
    if (handled) return;
  }

  return next();
});
