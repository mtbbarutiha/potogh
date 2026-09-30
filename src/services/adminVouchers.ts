import { InlineKeyboard } from "grammy";
import { formatNum } from "../data/packages.js";
import {
  generateVoucherCode,
  isVoucherExpired,
  listVouchers,
  parseVoucherDraft,
  serializeVoucherDraft,
  voucherRemainingUses,
  type VoucherDraft,
} from "./vouchers.js";

export function voucherPanelKeyboard() {
  return new InlineKeyboard()
    .text("➕ ساخت ووچر جدید", "adm:voucher:create")
    .success()
    .row()
    .text("📋 لیست ووچرها", "adm:voucher:list")
    .primary()
    .row()
    .text("↩️ پنل ادمین", "adm:home");
}

export function voucherCancelKeyboard() {
  return new InlineKeyboard()
    .text("❌ انصراف", "adm:voucher:cancel")
    .danger()
    .row()
    .text("↩️ مدیریت ووچر", "adm:vouchers");
}

export function voucherCoinsKeyboard() {
  return new InlineKeyboard()
    .text("۵۰", "adm:voucher:coins:50")
    .text("۱۰۰", "adm:voucher:coins:100")
    .text("۲۰۰", "adm:voucher:coins:200")
    .row()
    .text("۵۰۰", "adm:voucher:coins:500")
    .text("۱۰۰۰", "adm:voucher:coins:1000")
    .text("۵۰۰۰", "adm:voucher:coins:5000")
    .row()
    .text("✏️ مقدار دلخواه", "adm:voucher:coins:custom")
    .primary()
    .row()
    .text("❌ انصراف", "adm:voucher:cancel")
    .danger();
}

export function voucherMaxUsesKeyboard() {
  return new InlineKeyboard()
    .text("۱", "adm:voucher:max:1")
    .text("۱۰", "adm:voucher:max:10")
    .text("۵۰", "adm:voucher:max:50")
    .row()
    .text("۱۰۰", "adm:voucher:max:100")
    .text("۵۰۰", "adm:voucher:max:500")
    .text("۱۰۰۰", "adm:voucher:max:1000")
    .row()
    .text("✏️ تعداد دلخواه", "adm:voucher:max:custom")
    .primary()
    .row()
    .text("❌ انصراف", "adm:voucher:cancel")
    .danger();
}

export function voucherExpiryKeyboard() {
  return new InlineKeyboard()
    .text("۱ روز", "adm:voucher:exp:1")
    .text("۷ روز", "adm:voucher:exp:7")
    .text("۳۰ روز", "adm:voucher:exp:30")
    .row()
    .text("♾️ بدون انقضا", "adm:voucher:exp:0")
    .primary()
    .row()
    .text("✏️ روز دلخواه", "adm:voucher:exp:custom")
    .primary()
    .row()
    .text("❌ انصراف", "adm:voucher:cancel")
    .danger();
}

export function voucherCodeKeyboard() {
  return new InlineKeyboard()
    .text("🎲 ساخت کد خودکار", "adm:voucher:gen")
    .success()
    .row()
    .text("✏️ کد دلخواه", "adm:voucher:code:custom")
    .primary()
    .row()
    .text("❌ انصراف", "adm:voucher:cancel")
    .danger();
}

export function voucherConfirmKeyboard() {
  return new InlineKeyboard()
    .text("✅ ساخت ووچر", "adm:voucher:ok")
    .success()
    .row()
    .text("↩️ از اول", "adm:voucher:create")
    .primary()
    .text("❌ انصراف", "adm:voucher:cancel")
    .danger();
}

export function voucherListKeyboard(vouchers: { id: number; isActive: boolean }[]) {
  const kb = new InlineKeyboard();
  for (const v of vouchers.slice(0, 8)) {
    if (v.isActive) {
      kb.text(`⛔ غیرفعال #${v.id}`, `adm:voucher:off:${v.id}`).row();
    }
  }
  kb.text("➕ ساخت جدید", "adm:voucher:create").success().row();
  kb.text("↩️ مدیریت ووچر", "adm:vouchers");
  return kb;
}

export function formatVoucherExpiry(expiresAt: Date | null | undefined): string {
  if (!expiresAt) return "بدون انقضا";
  if (isVoucherExpired(expiresAt)) return "منقضی شده";
  return expiresAt.toLocaleString("fa-IR", { timeZone: "Asia/Tehran" });
}

export function formatVoucherLine(v: {
  id: number;
  code: string;
  coinAmount: number;
  maxUses: number;
  currentUses: number;
  expiresAt: Date | null;
  isActive: boolean;
  note: string | null;
}) {
  const status = !v.isActive
    ? "⛔ غیرفعال"
    : isVoucherExpired(v.expiresAt)
      ? "⌛ منقضی"
      : voucherRemainingUses(v) <= 0
        ? "🔚 تمام‌شده"
        : "✅ فعال";
  return [
    `${status} · \`${v.code}\``,
    `💰 ${formatNum(v.coinAmount)} سکه · استفاده ${formatNum(v.currentUses)}/${formatNum(v.maxUses)}`,
    `⏰ ${formatVoucherExpiry(v.expiresAt)}`,
    v.note ? `📝 ${v.note}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function buildVoucherListText(limit = 15): Promise<string> {
  const rows = await listVouchers(limit);
  if (rows.length === 0) {
    return ["📋 لیست ووچرها", "", "هنوز ووچری ساخته نشده."].join("\n");
  }
  return [
    "📋 لیست ووچرها",
    "",
    ...rows.map((v) => formatVoucherLine(v)),
  ].join("\n\n");
}

export function buildVoucherConfirmText(draft: VoucherDraft): string {
  const expires =
    draft.expiresAt == null
      ? "بدون انقضا"
      : new Date(draft.expiresAt).toLocaleString("fa-IR", {
          timeZone: "Asia/Tehran",
        });
  return [
    "⚠️ تأیید ساخت ووچر",
    "",
    `کد: \`${draft.code ?? "—"}\``,
    `سکه: ${formatNum(draft.coinAmount ?? 0)}`,
    `حداکثر استفاده: ${formatNum(draft.maxUses ?? 0)}`,
    `انقضا: ${expires}`,
    draft.note ? `یادداشت: ${draft.note}` : null,
    "",
    "برای تبلیغات می‌تونی همین کد رو تو کانال/اد بذاری.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function expiryFromDays(days: number): string | null {
  if (days <= 0) return null;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function draftWithAutoCode(draft: VoucherDraft): VoucherDraft {
  return { ...draft, code: draft.code ?? generateVoucherCode(8) };
}

export { parseVoucherDraft, serializeVoucherDraft };
