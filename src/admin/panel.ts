import { InlineKeyboard } from "grammy";
import { formatNum } from "../data/packages.js";

export function adminPanelKeyboard(pendingPhotos: number, pendingFaces: number) {
  return new InlineKeyboard()
    .text("📊 مانیتور یکپارچه", "adm:monitor")
    .primary()
    .row()
    .text("📡 داشبورد لانچ", "adm:launch")
    .row()
    .text(`📷 عکس‌های در انتظار (${formatNum(pendingPhotos)})`, "adm:photos")
    .row()
    .text(`✅ احراز در انتظار (${formatNum(pendingFaces)})`, "adm:faces")
    .row()
    .text("📊 گزارش چت فعال", "adm:chats")
    .primary()
    .row()
    .text("🚩 گزارش تخلفات", "adm:reports")
    .danger()
    .row()
    .text("💵 فروش سکه / تسویه", "adm:sells")
    .row()
    .text("💰 افزودن سکه", "adm:givecoins")
    .row()
    .text("🎟 ووچر", "adm:vouchers")
    .row()
    .text("🎁 هدیه همگانی", "adm:giftall")
    .success()
    .row()
    .text("💵 درآمد", "adm:revenue")
    .row()
    .text("📊 آمار ماه", "adm:stats:month")
    .text("📈 ۳ ماه", "adm:stats:3m")
    .row()
    .text("📅 امروز", "adm:stats:today")
    .text("👥 خلاصه", "adm:overview")
    .row()
    .text("🔄 بروزرسانی", "adm:home")
    .text("📋 لاگ", "adm:botlog")
    .row()
    .text("♻️ ریستارت", "adm:restart");
}

export function adminBackKeyboard() {
  return new InlineKeyboard().text("↩️ پنل ادمین", "adm:home");
}
