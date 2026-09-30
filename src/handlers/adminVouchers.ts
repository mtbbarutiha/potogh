import { Composer, InlineKeyboard } from "grammy";
import { isAdmin } from "../lib/admin.js";
import { findByTelegram, patchUser } from "../db/users.js";
import { formatNum } from "../data/packages.js";
import { parseCoinAmount } from "../services/adminCoins.js";
import {
  buildVoucherConfirmText,
  buildVoucherListText,
  draftWithAutoCode,
  expiryFromDays,
  parseVoucherDraft,
  serializeVoucherDraft,
  voucherCancelKeyboard,
  voucherCodeKeyboard,
  voucherCoinsKeyboard,
  voucherConfirmKeyboard,
  voucherExpiryKeyboard,
  voucherListKeyboard,
  voucherMaxUsesKeyboard,
  voucherPanelKeyboard,
} from "../services/adminVouchers.js";
import {
  createVoucher,
  deactivateVoucher,
  normalizeVoucherCode,
} from "../services/vouchers.js";
import { listVouchers } from "../services/vouchers.js";

export const adminVouchersHandler = new Composer();

function adminOnly(ctx: { from?: { id: number } }) {
  return ctx.from && isAdmin(ctx.from.id);
}

async function resetVoucherFlow(adminUserId: number) {
  await patchUser(adminUserId, {
    state: "idle",
    pendingAnonTo: null,
  });
}

adminVouchersHandler.callbackQuery("adm:vouchers", async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  await ctx.answerCallbackQuery();
  await ctx
    .editMessageText(
      [
        "🎟 مدیریت ووچر (کد هدیه)",
        "",
        "برای تبلیغات و جایزه سکه، ووچر بساز.",
        "هر ووچر: مقدار سکه · تعداد مصرف · زمان انقضا",
      ].join("\n"),
      { reply_markup: voucherPanelKeyboard() },
    )
    .catch(async () => {
      await ctx.reply(
        "🎟 مدیریت ووچر (کد هدیه)",
        { reply_markup: voucherPanelKeyboard() },
      );
    });
});

adminVouchersHandler.callbackQuery("adm:voucher:cancel", async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const admin = await findByTelegram(ctx.from!.id);
  if (admin) await resetVoucherFlow(admin.id);
  await ctx.answerCallbackQuery({ text: "لغو شد" });
  await ctx
    .editMessageText("❌ ساخت ووچر لغو شد.", {
      reply_markup: voucherPanelKeyboard(),
    })
    .catch(async () => {
      await ctx.reply("❌ ساخت ووچر لغو شد.", {
        reply_markup: voucherPanelKeyboard(),
      });
    });
});

adminVouchersHandler.callbackQuery("adm:voucher:create", async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const admin = await findByTelegram(ctx.from!.id);
  if (!admin) {
    await ctx.answerCallbackQuery({ text: "خطا" });
    return;
  }
  await patchUser(admin.id, {
    state: "admin_voucher_coins",
    pendingAnonTo: serializeVoucherDraft({}),
  });
  await ctx.answerCallbackQuery();
  await ctx
    .editMessageText(
      [
        "➕ ساخت ووچر جدید — مرحله ۱/۴",
        "",
        "مقدار سکه جایزه را انتخاب کن:",
      ].join("\n"),
      { reply_markup: voucherCoinsKeyboard() },
    )
    .catch(async () => {
      await ctx.reply("مقدار سکه جایزه را انتخاب کن:", {
        reply_markup: voucherCoinsKeyboard(),
      });
    });
});

adminVouchersHandler.callbackQuery("adm:voucher:list", async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  await ctx.answerCallbackQuery();
  const rows = await listVouchers(15);
  const text = await buildVoucherListText(15);
  await ctx
    .editMessageText(text, {
      reply_markup: voucherListKeyboard(rows),
      parse_mode: "Markdown",
    })
    .catch(async () => {
      await ctx.reply(text, {
        reply_markup: voucherListKeyboard(rows),
        parse_mode: "Markdown",
      });
    });
});

adminVouchersHandler.callbackQuery(/^adm:voucher:off:(\d+)$/, async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const id = Number(ctx.match![1]);
  await deactivateVoucher(id);
  await ctx.answerCallbackQuery({ text: "غیرفعال شد" });
  const rows = await listVouchers(15);
  const text = await buildVoucherListText(15);
  await ctx.editMessageText(text, {
    reply_markup: voucherListKeyboard(rows),
    parse_mode: "Markdown",
  }).catch(() => undefined);
});

adminVouchersHandler.callbackQuery(/^adm:voucher:coins:(\d+|custom)$/, async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const admin = await findByTelegram(ctx.from!.id);
  if (!admin) {
    await ctx.answerCallbackQuery({ text: "خطا" });
    return;
  }
  const val = ctx.match![1]!;
  if (val === "custom") {
    await patchUser(admin.id, { state: "admin_voucher_coins" });
    await ctx.answerCallbackQuery();
    await ctx.reply("✏️ مقدار سکه را به عدد بفرست (مثلاً 250):", {
      reply_markup: voucherCancelKeyboard(),
    });
    return;
  }
  const coins = Number(val);
  const draft = { coinAmount: coins };
  await patchUser(admin.id, {
    state: "admin_voucher_maxuses",
    pendingAnonTo: serializeVoucherDraft(draft),
  });
  await ctx.answerCallbackQuery();
  await ctx
    .editMessageText(
      [
        "➕ ساخت ووچر — مرحله ۲/۴",
        "",
        `سکه: ${formatNum(coins)}`,
        "",
        "حداکثر تعداد مصرف (چند نفر بتوانند استفاده کنند):",
      ].join("\n"),
      { reply_markup: voucherMaxUsesKeyboard() },
    )
    .catch(async () => {
      await ctx.reply("حداکثر تعداد مصرف را انتخاب کن:", {
        reply_markup: voucherMaxUsesKeyboard(),
      });
    });
});

adminVouchersHandler.callbackQuery(/^adm:voucher:max:(\d+|custom)$/, async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const admin = await findByTelegram(ctx.from!.id);
  if (!admin) {
    await ctx.answerCallbackQuery({ text: "خطا" });
    return;
  }
  const val = ctx.match![1]!;
  const draft = parseVoucherDraft(admin.pendingAnonTo);
  if (!draft.coinAmount) {
    await ctx.answerCallbackQuery({ text: "اول سکه را انتخاب کن", show_alert: true });
    return;
  }
  if (val === "custom") {
    await patchUser(admin.id, { state: "admin_voucher_maxuses" });
    await ctx.answerCallbackQuery();
    await ctx.reply("✏️ تعداد مصرف را به عدد بفرست (مثلاً 100):", {
      reply_markup: voucherCancelKeyboard(),
    });
    return;
  }
  const maxUses = Number(val);
  await patchUser(admin.id, {
    state: "admin_voucher_expiry",
    pendingAnonTo: serializeVoucherDraft({ ...draft, maxUses }),
  });
  await ctx.answerCallbackQuery();
  await ctx
    .editMessageText(
      [
        "➕ ساخت ووچر — مرحله ۳/۴",
        "",
        `سکه: ${formatNum(draft.coinAmount)} · مصرف: ${formatNum(maxUses)}`,
        "",
        "مدت اعتبار ووچر:",
      ].join("\n"),
      { reply_markup: voucherExpiryKeyboard() },
    )
    .catch(async () => {
      await ctx.reply("مدت اعتبار ووچر:", {
        reply_markup: voucherExpiryKeyboard(),
      });
    });
});

adminVouchersHandler.callbackQuery(/^adm:voucher:exp:(\d+|custom)$/, async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const admin = await findByTelegram(ctx.from!.id);
  if (!admin) {
    await ctx.answerCallbackQuery({ text: "خطا" });
    return;
  }
  const val = ctx.match![1]!;
  const draft = parseVoucherDraft(admin.pendingAnonTo);
  if (!draft.coinAmount || !draft.maxUses) {
    await ctx.answerCallbackQuery({ text: "مراحل قبل ناقص است", show_alert: true });
    return;
  }
  if (val === "custom") {
    await patchUser(admin.id, { state: "admin_voucher_expiry" });
    await ctx.answerCallbackQuery();
    await ctx.reply("✏️ تعداد روز اعتبار را بفرست (۰ = بدون انقضا):", {
      reply_markup: voucherCancelKeyboard(),
    });
    return;
  }
  const days = Number(val);
  const next = {
    ...draft,
    expiresAt: expiryFromDays(days),
  };
  await patchUser(admin.id, {
    state: "admin_voucher_code",
    pendingAnonTo: serializeVoucherDraft(next),
  });
  await ctx.answerCallbackQuery();
  await ctx
    .editMessageText(
      [
        "➕ ساخت ووچر — مرحله ۴/۴",
        "",
        `سکه: ${formatNum(next.coinAmount!)} · مصرف: ${formatNum(next.maxUses!)}`,
        `انقضا: ${days <= 0 ? "بدون انقضا" : `${formatNum(days)} روز`}`,
        "",
        "کد ووچر را انتخاب کن:",
      ].join("\n"),
      { reply_markup: voucherCodeKeyboard() },
    )
    .catch(async () => {
      await ctx.reply("کد ووچر را انتخاب کن:", {
        reply_markup: voucherCodeKeyboard(),
      });
    });
});

adminVouchersHandler.callbackQuery("adm:voucher:gen", async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const admin = await findByTelegram(ctx.from!.id);
  if (!admin) {
    await ctx.answerCallbackQuery({ text: "خطا" });
    return;
  }
  const draft = draftWithAutoCode(parseVoucherDraft(admin.pendingAnonTo));
  if (!draft.coinAmount || !draft.maxUses || !draft.code) {
    await ctx.answerCallbackQuery({ text: "پیش‌نویس ناقص", show_alert: true });
    return;
  }
  await patchUser(admin.id, {
    state: "admin_voucher_confirm",
    pendingAnonTo: serializeVoucherDraft(draft),
  });
  await ctx.answerCallbackQuery();
  await ctx
    .editMessageText(buildVoucherConfirmText(draft), {
      reply_markup: voucherConfirmKeyboard(),
      parse_mode: "Markdown",
    })
    .catch(async () => {
      await ctx.reply(buildVoucherConfirmText(draft), {
        reply_markup: voucherConfirmKeyboard(),
        parse_mode: "Markdown",
      });
    });
});

adminVouchersHandler.callbackQuery("adm:voucher:code:custom", async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const admin = await findByTelegram(ctx.from!.id);
  if (!admin) {
    await ctx.answerCallbackQuery({ text: "خطا" });
    return;
  }
  await patchUser(admin.id, { state: "admin_voucher_code" });
  await ctx.answerCallbackQuery();
  await ctx.reply(
    "✏️ کد ووچر را بفرست (۴ تا ۳۲ کاراکتر، حروف و عدد):\nمثال: PATOGH100",
    { reply_markup: voucherCancelKeyboard() },
  );
});

adminVouchersHandler.callbackQuery("adm:voucher:ok", async (ctx) => {
  if (!adminOnly(ctx)) {
    await ctx.answerCallbackQuery({ text: "غیرمجاز" });
    return;
  }
  const admin = await findByTelegram(ctx.from!.id);
  if (!admin) {
    await ctx.answerCallbackQuery({ text: "خطا" });
    return;
  }
  const draft = parseVoucherDraft(admin.pendingAnonTo);
  if (!draft.code || !draft.coinAmount || !draft.maxUses) {
    await ctx.answerCallbackQuery({ text: "پیش‌نویس ناقص", show_alert: true });
    return;
  }
  try {
    const created = await createVoucher({
      code: draft.code,
      coinAmount: draft.coinAmount,
      maxUses: draft.maxUses,
      expiresAt: draft.expiresAt ? new Date(draft.expiresAt) : null,
      note: draft.note ?? null,
      createdById: admin.id,
    });
    await resetVoucherFlow(admin.id);
    await ctx.answerCallbackQuery({ text: "ساخته شد ✅" });
    await ctx
      .editMessageText(
        [
          "✅ ووچر ساخته شد",
          "",
          `کد: \`${created.code}\``,
          `💰 ${formatNum(created.coinAmount)} سکه`,
          `👥 ${formatNum(created.maxUses)} بار مصرف`,
          `⏰ ${created.expiresAt ? created.expiresAt.toLocaleString("fa-IR", { timeZone: "Asia/Tehran" }) : "بدون انقضا"}`,
          "",
          "کاربران از منوی سکه → 🎟 کد هدیه می‌توانند وارد کنند.",
        ].join("\n"),
        {
          reply_markup: new InlineKeyboard()
            .text("➕ ساخت دیگر", "adm:voucher:create")
            .row()
            .text("↩️ مدیریت ووچر", "adm:vouchers"),
          parse_mode: "Markdown",
        },
      )
      .catch(async () => {
        await ctx.reply("✅ ووچر ساخته شد.", {
          reply_markup: voucherPanelKeyboard(),
        });
      });
  } catch (err) {
    console.error("create voucher failed", err);
    await ctx.answerCallbackQuery({
      text: "کد تکراری یا نامعتبر — دوباره تلاش کن",
      show_alert: true,
    });
  }
});

/** ورودی متنی ادمین برای ووچر */
export async function handleAdminVoucherText(
  ctx: {
    from: { id: number };
    reply: (t: string, x?: object) => Promise<unknown>;
  },
  admin: { id: number; state: string; pendingAnonTo: string | null },
  text: string,
): Promise<boolean> {
  if (!adminOnly(ctx)) return false;

  const draft = parseVoucherDraft(admin.pendingAnonTo);

  if (admin.state === "admin_voucher_coins") {
    const amount = parseCoinAmount(text);
    if (amount == null) {
      await ctx.reply("عدد معتبر بفرست (مثلاً 100):", {
        reply_markup: voucherCancelKeyboard(),
      });
      return true;
    }
    await patchUser(admin.id, {
      state: "admin_voucher_maxuses",
      pendingAnonTo: serializeVoucherDraft({ ...draft, coinAmount: amount }),
    });
    await ctx.reply(
      [
        `✅ سکه: ${formatNum(amount)}`,
        "",
        "حداکثر تعداد مصرف:",
      ].join("\n"),
      { reply_markup: voucherMaxUsesKeyboard() },
    );
    return true;
  }

  if (admin.state === "admin_voucher_maxuses") {
    const maxUses = parseCoinAmount(text);
    if (maxUses == null) {
      await ctx.reply("عدد معتبر بفرست (مثلاً 50):", {
        reply_markup: voucherCancelKeyboard(),
      });
      return true;
    }
    await patchUser(admin.id, {
      state: "admin_voucher_expiry",
      pendingAnonTo: serializeVoucherDraft({ ...draft, maxUses }),
    });
    await ctx.reply("مدت اعتبار (روز):", {
      reply_markup: voucherExpiryKeyboard(),
    });
    return true;
  }

  if (admin.state === "admin_voucher_expiry") {
    const days = parseCoinAmount(text);
    if (days == null) {
      await ctx.reply("عدد روز بفرست (۰ = بدون انقضا):", {
        reply_markup: voucherCancelKeyboard(),
      });
      return true;
    }
    const next = {
      ...draft,
      expiresAt: expiryFromDays(days),
    };
    await patchUser(admin.id, {
      state: "admin_voucher_code",
      pendingAnonTo: serializeVoucherDraft(next),
    });
    await ctx.reply("کد ووچر:", { reply_markup: voucherCodeKeyboard() });
    return true;
  }

  if (admin.state === "admin_voucher_code") {
    const code = normalizeVoucherCode(text);
    if (code.length < 4 || code.length > 32) {
      await ctx.reply("کد باید ۴ تا ۳۲ کاراکتر باشد:", {
        reply_markup: voucherCancelKeyboard(),
      });
      return true;
    }
    const next = { ...draft, code };
    await patchUser(admin.id, {
      state: "admin_voucher_confirm",
      pendingAnonTo: serializeVoucherDraft(next),
    });
    await ctx.reply(buildVoucherConfirmText(next), {
      reply_markup: voucherConfirmKeyboard(),
      parse_mode: "Markdown",
    });
    return true;
  }

  if (admin.state === "admin_voucher_confirm") {
    await ctx.reply("از دکمه تأیید استفاده کن.", {
      reply_markup: voucherConfirmKeyboard(),
    });
    return true;
  }

  return false;
}

export async function adminVoucherHome(ctx: {
  editMessageText?: (t: string, x?: object) => Promise<unknown>;
  reply: (t: string, x?: object) => Promise<unknown>;
}) {
  const text = [
    "🎟 مدیریت ووچر (کد هدیه)",
    "",
    "برای تبلیغات و جایزه سکه، ووچر بساز.",
    "هر ووچر: مقدار سکه · تعداد مصرف · زمان انقضا",
  ].join("\n");
  await ctx
    .editMessageText?.(text, { reply_markup: voucherPanelKeyboard() })
    .catch(async () => {
      await ctx.reply(text, { reply_markup: voucherPanelKeyboard() });
    });
}
