import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import {
  formatNum,
  NEARBY_RADIUS_OPTIONS_KM,
} from "../data/packages.js";
import { mainKeyboard } from "../keyboards/main.js";
import {
  findNearby,
  getNearbyRadius,
  setNearbyRadius,
} from "./nearby.js";
import { openInlineUserList } from "./inlineList.js";
import { langOf, tr, normalizeLang, type Lang } from "../i18n/index.js";
import { prisma } from "../db/prisma.js";
import type { Api } from "grammy";

export function nearbyLocationChoiceKeyboard(lang: Lang | string | null = "fa") {
  const L = normalizeLang(lang);
  const en = L === "en";
  return new InlineKeyboard()
    .text(
      en ? "📍 My saved location" : "📍 لوکیشن ذخیره‌شده من",
      "nearby:saved",
    )
    .primary()
    .row()
    .text(
      en ? "📡 Live location (fresh)" : "📡 لوکیشن فعلی (تازه)",
      "nearby:fresh",
    )
    .success();
}

/** انتخاب شعاع فاصله بر اساس لوکیشن */
export function nearbyRadiusKeyboard(
  lang: Lang | string | null = "fa",
  opts?: { showUpdateLocation?: boolean },
) {
  const L = normalizeLang(lang);
  const en = L === "en";
  const kb = new InlineKeyboard();
  const labels = en
    ? NEARBY_RADIUS_OPTIONS_KM.map((km) => `${km} km`)
    : NEARBY_RADIUS_OPTIONS_KM.map((km) => `${km} کیلومتر`);

  for (let i = 0; i < NEARBY_RADIUS_OPTIONS_KM.length; i++) {
    const km = NEARBY_RADIUS_OPTIONS_KM[i]!;
    kb.text(labels[i]!, `nearby:r:${km}`).primary();
    if ((i + 1) % 2 === 0) kb.row();
  }
  if (NEARBY_RADIUS_OPTIONS_KM.length % 2 !== 0) kb.row();
  if (opts?.showUpdateLocation) {
    kb.text(
      en ? "📡 Update my GPS location" : "📡 به‌روزرسانی موقعیت GPS",
      "nearby:fresh",
    )
      .success()
      .row();
  }
  return kb;
}

export async function askNearbyRadius(
  ctx: Context,
  lang: Lang | string | null = "fa",
  opts?: { showUpdateLocation?: boolean; intro?: string },
) {
  const L = normalizeLang(lang);
  const text =
    opts?.intro ??
    (L === "en"
      ? [
          "🛰 Nearby search",
          "",
          "How far should I look for people around you?",
          "Results are based on real GPS distance.",
          "Pick a radius (5–100 km):",
        ].join("\n")
      : [
          "🛰 جستجوی افراد نزدیک",
          "",
          "تا چه فاصله‌ای اطراف تو را بگردم؟",
          "نتایج بر اساس فاصله واقعی لوکیشن (GPS) است.",
          "یکی از شعاع‌های ۵ تا ۱۰۰ کیلومتر را بزن:",
        ].join("\n"));
  await ctx.reply(text, {
    reply_markup: nearbyRadiusKeyboard(
      L,
      opts?.showUpdateLocation ? { showUpdateLocation: true } : undefined,
    ),
  });
}

/** لیست نزدیک‌ها — Inline Query */
export async function showNearbyResults(
  ctx: Context,
  userId: number,
  radiusKm?: number,
  _page = 0,
  _edit = false,
) {
  const me = await prisma.user.findUnique({ where: { id: userId } });
  const lang = langOf(me);
  const radius = radiusKm ?? getNearbyRadius(userId);
  if (radiusKm != null) setNearbyRadius(userId, radiusKm);

  const nearby = await findNearby(userId, radius);

  if (!nearby.length) {
    await ctx.reply(
      lang === "en"
        ? `No one found within ${formatNum(radius)} km right now.`
        : `فعلاً کسی تا شعاع ${formatNum(radius)} کیلومتر پیدا نشد.`,
      {
        reply_markup: new InlineKeyboard()
          .text(
            lang === "en" ? "🔄 Change radius" : "🔄 تغییر شعاع",
            "nearby:radius",
          )
          .primary()
          .row()
          .text(
            lang === "en" ? "📍 Change location" : "📍 تغییر لوکیشن",
            "nearby:fresh",
          )
          .success(),
      },
    );
    return;
  }

  await openInlineUserList(ctx, {
    viewerUserId: userId,
    kind: "nearby",
    title:
      lang === "en"
        ? `🛰 Nearby ≤ ${formatNum(radius)} km (${formatNum(nearby.length)})`
        : `🛰 اطراف من ≤ ${formatNum(radius)} کیلومتر (${formatNum(nearby.length)})`,
    exploreOpts: { nearbyRadiusKm: radius },
    lang,
  });
}

export async function notifyWipeDone(
  api: Api,
  telegramId: bigint | number,
  deletedCount: number,
) {
  if (telegramId >= 9000000000n) return;
  try {
    const recipient = await prisma.user.findFirst({
      where: { telegramId: BigInt(telegramId) },
      select: { language: true },
    });
    const lang = langOf(recipient);
    await api.sendMessage(
      Number(telegramId),
      tr(
        lang,
        [
          "🗑 گفتگو پاک شد.",
          `${deletedCount} پیام (متن/عکس/ویدیو) حذف شد.`,
          "",
          "اگر هنوز چیزی باقی مانده، در تلگرام روی این چت بزن → Clear history.",
        ].join("\n"),
        [
          "🗑 Chat wiped.",
          `${deletedCount} message(s) (text/photo/video) deleted.`,
          "",
          "If anything remains, tap this chat in Telegram → Clear history.",
        ].join("\n"),
      ),
      { reply_markup: mainKeyboard(lang) },
    );
  } catch {
    /* ignore */
  }
}
