import { randomBytes } from "node:crypto";
import type { Api, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import type { InlineQueryResult } from "grammy/types";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { ensureUserCode } from "../db/users.js";
import { formatNum, LIST_BLAST_COST, LIST_BLAST_LIMIT } from "../data/packages.js";
import { haversineKm } from "../lib/geo.js";
import {
  ensureCdnThumbUrl,
  getCachedCdnThumbUrl,
  getCachedPublicThumbUrl,
  uploadPublicThumb,
  warmPublicThumbCache,
} from "../lib/publicThumbUpload.js";
import { ensureTelegramThumbFileId } from "../lib/telegramThumbCache.js";
import { normalizeLang, type Lang } from "../i18n/index.js";
import { type ExploreOpts, optsKeyFromExplore } from "./explore.js";
import { findNearby } from "./nearby.js";

const SESSION_TTL_MS = 45 * 60_000;
/** هر اسکرول این‌قدر نتیجه تازه لود می‌شود (سریع، بدون معطلی) */
const PAGE = 10;
/** سقف کل نتایج لیست کشویی */
const MAX_USERS = 50;

export type InlineListKind = "search" | "all" | "nearby" | "contacts";

type InlineListSession = {
  viewerUserId: number;
  viewerTelegramId: number;
  kind: InlineListKind;
  opts: ExploreOpts;
  title: string;
  lang: Lang;
  createdAt: number;
  /** کش نتایج برای اسکرول سریع + پیام گروهی */
  rowsCache?: RowUser[];
};

const sessions = new Map<string, InlineListSession>();

function pruneSessions() {
  const now = Date.now();
  for (const [k, s] of sessions) {
    if (now - s.createdAt > SESSION_TTL_MS) sessions.delete(k);
  }
}

function newToken(): string {
  return randomBytes(5).toString("base64url");
}

export function createInlineListSession(
  data: Omit<InlineListSession, "createdAt">,
): string {
  pruneSessions();
  const token = newToken();
  sessions.set(token, { ...data, createdAt: Date.now() });
  return token;
}

export function getInlineListSession(token: string): InlineListSession | null {
  pruneSessions();
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() - s.createdAt > SESSION_TTL_MS) {
    sessions.delete(token);
    return null;
  }
  return s;
}

function genderEmoji(gender: string | null | undefined): string {
  // مثل پاتوق — ایموجی کنار اسم
  if (gender === "female") return "🙎‍♀️";
  if (gender === "male") return "🙎‍♂️";
  return "🙂";
}

function onlineLine(u: {
  lastActiveAt: Date;
  state: string;
  chatPartnerId: number | null;
}): string {
  const mins = (Date.now() - u.lastActiveAt.getTime()) / 60_000;
  const chatting = u.state === "chatting" || u.chatPartnerId != null;
  if (mins <= 15) {
    return chatting
      ? "هم‌اکنون 👀 آنلاین (درحال چت 🗣️)"
      : "هم‌اکنون 👀 آنلاین";
  }
  if (mins <= 60) return "کمتر از یک ساعت پیش آنلاین";
  if (mins <= 60 * 24) return "امروز آنلاین بوده";
  if (mins <= 60 * 24 * 7) return "این هفته آنلاین بوده";
  return "آخرین بازدید چند روز پیش";
}

function kmLabel(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km)) return "? km";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

type RowUser = {
  id: number;
  userCode: string;
  displayName: string | null;
  age: number | null;
  gender: string | null;
  city: string | null;
  province: string | null;
  likesCount: number;
  lastActiveAt: Date;
  state: string;
  chatPartnerId: number | null;
  photoFileId: string | null;
  photoStatus: string | null;
  faceVerified: boolean;
  latitude: number | null;
  longitude: number | null;
  telegramId: bigint;
  distanceKm?: number | null;
};

function toRow(
  u: {
    id: number;
    userCode: string | null;
    displayName: string | null;
    age: number | null;
    gender: string | null;
    city: string | null;
    province: string | null;
    likesCount: number;
    lastActiveAt: Date;
    state: string;
    chatPartnerId: number | null;
    photoFileId: string | null;
    photoStatus: string | null;
    faceVerified: boolean;
    latitude: number | null;
    longitude: number | null;
    telegramId: bigint;
  },
  code: string,
  distanceKm: number | null,
): RowUser {
  return {
    id: u.id,
    userCode: code,
    displayName: u.displayName,
    age: u.age,
    gender: u.gender,
    city: u.city,
    province: u.province,
    likesCount: u.likesCount,
    lastActiveAt: u.lastActiveAt,
    state: u.state,
    chatPartnerId: u.chatPartnerId,
    photoFileId: u.photoFileId,
    photoStatus: u.photoStatus,
    faceVerified: u.faceVerified,
    latitude: u.latitude,
    longitude: u.longitude,
    telegramId: u.telegramId,
    distanceKm,
  };
}

async function loadSearchRows(
  viewerId: number,
  opts: ExploreOpts,
): Promise<RowUser[]> {
  const me = await prisma.user.findUnique({ where: { id: viewerId } });
  if (!me) return [];

  const { excludedUserIds } = await import("./block.js");
  const blockedIds = await excludedUserIds(viewerId);

  const where: Prisma.UserWhereInput = {
    registered: true,
    isActive: true,
    deletedAt: null,
    id: { notIn: [viewerId, ...blockedIds] },
  };

  if (opts.gender && opts.gender !== "any") {
    where.gender = opts.gender;
  } else if (!opts.ignoreLookingFor && me.lookingFor && me.lookingFor !== "any") {
    where.gender = me.lookingFor;
  }
  if (opts.sameProvince && me.province) {
    where.province = me.province;
    if (me.country) where.country = me.country;
  }
  if (opts.sameAge && me.age != null) {
    where.age = { gte: me.age - 3, lte: me.age + 3 };
  }
  if (opts.noChats) where.chatsCount = 0;
  if (opts.sameProvince || opts.sameAge) {
    where.lastActiveAt = {
      gte: new Date(Date.now() - 30 * 24 * 3600_000),
    };
  }

  let orderBy: Prisma.UserOrderByWithRelationInput[] = [
    { isPro: "desc" },
    { boostUntil: "desc" },
    { lastActiveAt: "desc" },
  ];
  if (opts.popular) {
    orderBy = [{ likesCount: "desc" }, { lastActiveAt: "desc" }];
  }
  if (opts.newUsers) orderBy = [{ createdAt: "desc" }];

  let list = await prisma.user.findMany({
    where,
    orderBy,
    take: MAX_USERS,
  });

  if (!list.length && opts.sameProvince && me.province) {
    const where2: Prisma.UserWhereInput = {
      registered: true,
      isActive: true,
      deletedAt: null,
      id: { notIn: [viewerId, ...blockedIds] },
      province: me.province,
      ...(me.country ? { country: me.country } : {}),
      ...(opts.gender && opts.gender !== "any" ? { gender: opts.gender } : {}),
    };
    list = await prisma.user.findMany({
      where: where2,
      orderBy,
      take: MAX_USERS,
    });
  }

  const out: RowUser[] = [];
  for (const u of list) {
    if (!u.userCode) await ensureUserCode(u.id, u.userCode);
    const code = u.userCode ?? (await ensureUserCode(u.id, null));
    if (!code) continue;
    let distanceKm: number | null = null;
    if (
      me.latitude != null &&
      me.longitude != null &&
      u.latitude != null &&
      u.longitude != null
    ) {
      distanceKm = haversineKm(
        me.latitude,
        me.longitude,
        u.latitude,
        u.longitude,
      );
    }
    out.push(toRow(u, code, distanceKm));
  }
  return out;
}

async function loadNearbyRows(
  viewerId: number,
  radiusKm?: number,
): Promise<RowUser[]> {
  const nearby = await findNearby(viewerId, radiusKm);
  const out: RowUser[] = [];
  for (const item of nearby.slice(0, MAX_USERS)) {
    const u = item.user;
    if (!u.userCode) await ensureUserCode(u.id, u.userCode);
    const code = u.userCode ?? (await ensureUserCode(u.id, null));
    if (!code) continue;
    out.push(toRow(u, code, item.km));
  }
  return out;
}

async function loadContactsRows(ownerUserId: number): Promise<RowUser[]> {
  const rows = await prisma.contact.findMany({
    where: {
      ownerUserId,
      contact: { deletedAt: null, registered: true },
    },
    orderBy: { createdAt: "desc" },
    include: { contact: true },
    take: MAX_USERS,
  });
  const out: RowUser[] = [];
  for (const row of rows) {
    const u = row.contact;
    if (!u) continue;
    if (!u.userCode) await ensureUserCode(u.id, u.userCode);
    const code = u.userCode ?? (await ensureUserCode(u.id, null));
    if (!code) continue;
    out.push(toRow(u, code, null));
  }
  return out;
}

async function rowsForSession(s: InlineListSession): Promise<RowUser[]> {
  if (s.rowsCache) return s.rowsCache;
  let rows: RowUser[];
  if (s.kind === "nearby") {
    rows = await loadNearbyRows(s.viewerUserId, s.opts.nearbyRadiusKm);
  } else if (s.kind === "contacts") {
    rows = await loadContactsRows(s.viewerUserId);
  } else {
    const opts: ExploreOpts =
      s.kind === "all" ? { ...s.opts, ignoreLookingFor: true } : s.opts;
    rows = await loadSearchRows(s.viewerUserId, opts);
  }
  s.rowsCache = rows.slice(0, MAX_USERS);
  return s.rowsCache;
}

/** گیرندگان واقعی برای پیام گروهی — فقط ۱۰ نفر اول لیست */
export async function getBlastRecipients(
  token: string,
  viewerTelegramId: number,
): Promise<{ session: InlineListSession; recipients: RowUser[] } | null> {
  const session = getInlineListSession(token);
  if (!session || session.viewerTelegramId !== viewerTelegramId) return null;
  const rows = await rowsForSession(session);
  const recipients = rows
    .filter((u) => u.id !== session.viewerUserId && u.telegramId < 9000000000n)
    .slice(0, LIST_BLAST_LIMIT);
  return { session, recipients };
}

const publicThumbCache = new Map<string, { url: string; at: number }>();
const thumbBuildInflight = new Map<string, Promise<string | null>>();
const genderDefaultUrls = new Map<string, string>();
const PLACEHOLDER =
  "https://via.placeholder.com/128/1a1a1a/ffffff?text=No+Photo";

function cacheKeyFor(u: RowUser): string {
  const hasPhoto = u.photoStatus === "approved" && Boolean(u.photoFileId);
  return hasPhoto
    ? `p:${u.photoFileId}:${u.faceVerified ? "v" : "u"}`
    : genderThumbKey(u.gender);
}

function genderThumbKey(gender: string | null | undefined): string {
  if (gender === "female") return "nophoto:female";
  if (gender === "male") return "nophoto:male";
  return "nophoto:anon";
}

/** startup — index دیسک → RAM + پیش‌فرض جنسیت */
export async function initInlineThumbCache(): Promise<void> {
  const n = await warmPublicThumbCache();
  await ensureGenderDefaultPublicUrl("female").catch(() => undefined);
  await ensureGenderDefaultPublicUrl("male").catch(() => undefined);
  await ensureGenderDefaultPublicUrl(null).catch(() => undefined);
  // عکس‌های پیش‌فرض جنسیت را روی CDN هم آماده کن تا تلگرام در لیست نشانشان دهد
  await ensureGenderDefaultCdnUrl("female").catch(() => undefined);
  await ensureGenderDefaultCdnUrl("male").catch(() => undefined);
  await ensureGenderDefaultCdnUrl(null).catch(() => undefined);
  if (n > 0) console.log(`[inline] thumb cache warmed: ${n} urls`);
}

/** عکس پیش‌فرض جنسیت را روی CDN آماده می‌کند (برای thumbnail لیست اینلاین) */
async function ensureGenderDefaultCdnUrl(
  gender: string | null | undefined,
): Promise<void> {
  const key = genderThumbKey(gender);
  if (await getCachedCdnThumbUrl(key)) return;
  const { defaultGenderThumbBuffer } = await import("../lib/faceBadgePhoto.js");
  const buf = await defaultGenderThumbBuffer(gender, 128);
  await ensureCdnThumbUrl(buf, key).catch(() => undefined);
}

async function uploadThumbBuffer(
  buf: Buffer,
  cacheKey: string,
  api?: Api,
): Promise<string | null> {
  const disk = await getCachedPublicThumbUrl(cacheKey);
  if (disk) {
    publicThumbCache.set(cacheKey, { url: disk, at: Date.now() });
    if (api) {
      void ensureTelegramThumbFileId(api, cacheKey, buf).catch(() => undefined);
    }
    return disk;
  }
  const hit = publicThumbCache.get(cacheKey);
  if (hit && Date.now() - hit.at < 6 * 60 * 60_000) {
    if (api) {
      void ensureTelegramThumbFileId(api, cacheKey, buf).catch(() => undefined);
    }
    return hit.url;
  }
  const url = await uploadPublicThumb(buf, cacheKey);
  if (url) {
    publicThumbCache.set(cacheKey, { url, at: Date.now() });
    if (api) {
      void ensureTelegramThumbFileId(api, cacheKey, buf).catch(() => undefined);
    }
    return url;
  }
  return hit?.url ?? null;
}

/** URL عمومی پیش‌فرض جنسیت (دختر → female.jpg و …) */
async function ensureGenderDefaultPublicUrl(
  gender: string | null | undefined,
): Promise<string | null> {
  const key = genderThumbKey(gender);
  const mem = genderDefaultUrls.get(key);
  if (mem) return mem;

  const hit = publicThumbCache.get(key);
  if (hit && Date.now() - hit.at < 6 * 60 * 60_000) {
    genderDefaultUrls.set(key, hit.url);
    return hit.url;
  }

  const disk = await getCachedPublicThumbUrl(key);
  if (disk) {
    publicThumbCache.set(key, { url: disk, at: Date.now() });
    genderDefaultUrls.set(key, disk);
    return disk;
  }

  const { defaultGenderThumbBuffer } = await import("../lib/faceBadgePhoto.js");
  const buf = await defaultGenderThumbBuffer(gender, 128);
  const url = await uploadThumbBuffer(buf, key);
  if (url) {
    publicThumbCache.set(key, { url, at: Date.now() });
    genderDefaultUrls.set(key, url);
  }
  return url ?? hit?.url ?? null;
}

function genderDefaultFast(gender: string | null | undefined): string {
  const key = genderThumbKey(gender);
  return (
    genderDefaultUrls.get(key) ??
    publicThumbCache.get(key)?.url ??
    PLACEHOLDER
  );
}

/** فقط از کش — CDN برای Article inline، بدون آپلود در مسیر داغ */
async function cachedThumbOnly(u: RowUser): Promise<string | null> {
  const key = cacheKeyFor(u);
  const cdn = await getCachedCdnThumbUrl(key);
  if (cdn) {
    publicThumbCache.set(key, { url: cdn, at: Date.now() });
    return cdn;
  }
  const mem = publicThumbCache.get(key);
  if (mem && Date.now() - mem.at < 6 * 60 * 60_000 && !mem.url.includes("placeholder.com")) {
    return mem.url;
  }
  // thumbnail سرور خودمان (sslip) — تلگرام با HTTPS معتبر لودش می‌کند؛ کات‌باکس مرده است
  const disk = await getCachedPublicThumbUrl(key);
  if (disk) {
    publicThumbCache.set(key, { url: disk, at: Date.now() });
    return disk;
  }
  return null;
}

/** ساخت و ذخیرهٔ thumbnail — با dedup */
async function buildAndStoreThumb(api: Api, u: RowUser): Promise<string | null> {
  const hasPhoto = u.photoStatus === "approved" && Boolean(u.photoFileId);
  const cacheKey = cacheKeyFor(u);
  const existing = await cachedThumbOnly(u);
  if (existing) return existing;

  try {
    const { listThumbBuffer, defaultGenderThumbBuffer } = await import(
      "../lib/faceBadgePhoto.js"
    );
    // بدون عکس → عکس پیش‌فرض جنسیت؛ آن هم مثل عکس واقعی روی CDN آپلود می‌شود
    // تا تلگرام نشانش دهد (به‌جای اول‌حرف رنگی پیش‌فرض خودِ تلگرام).
    const buf = hasPhoto
      ? await listThumbBuffer(
          api,
          {
            gender: u.gender,
            photoFileId: u.photoFileId,
            photoStatus: u.photoStatus,
            faceVerified: u.faceVerified,
          },
          128,
        )
      : await defaultGenderThumbBuffer(u.gender, 128);
    const url = await uploadThumbBuffer(buf, cacheKey, api);
    await ensureCdnThumbUrl(buf, cacheKey).catch(() => undefined);
    await ensureTelegramThumbFileId(api, cacheKey, buf).catch(() => undefined);
    return url;
  } catch (err) {
    console.error("[inline] buildAndStoreThumb failed", u.id, err);
    return hasPhoto ? null : ensureGenderDefaultPublicUrl(u.gender);
  }
}

function scheduleThumbBuild(api: Api, u: RowUser): void {
  const key = cacheKeyFor(u);
  if (thumbBuildInflight.has(key)) return;
  const task = buildAndStoreThumb(api, u).finally(() =>
    thumbBuildInflight.delete(key),
  );
  thumbBuildInflight.set(key, task);
  void task.catch(() => undefined);
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return out;
}

/** پیش‌گرم موازی — وقتی لیست باز می‌شود */
export async function prewarmListThumbs(
  api: Api,
  rows: RowUser[],
  limit = 40,
): Promise<void> {
  const slice = rows.slice(0, limit);
  await mapPool(slice, 3, async (u) => {
    try {
      await buildAndStoreThumb(api, u);
    } catch {
      /* ignore */
    }
  });
}

/** عنوان + توضیح دقیقاً شبیه پاتوق */
function resultTitle(u: RowUser): string {
  const name = (u.displayName ?? "کاربر").trim();
  const age = u.age != null ? String(u.age) : "";
  return `${name}${age ? ` ${age}` : ""} ${genderEmoji(u.gender)}`.trim();
}

function resultDescription(u: RowUser): string {
  const age = u.age != null ? String(u.age) : "?";
  const city = u.city ?? "?";
  const prov = u.province ? `(${u.province})` : "";
  const dist = `🏁 ${kmLabel(u.distanceKm ?? null)}`;
  const likes = `❤️ ${u.likesCount}`;
  const line1 = `${age} ${city}${prov} (${dist})(${likes})`;
  const line2 = onlineLine(u);
  return `${line1}\n${line2}`;
}

/** Article — ظاهر لیست کشویی؛ thumbnail از سرور خودمان (sslip, HTTPS معتبر) */
function toInlineResult(
  u: RowUser,
  offset: number,
  thumbUrl: string | null | undefined,
): InlineQueryResult {
  const base: InlineQueryResult = {
    type: "article",
    id: `u${u.id}_${offset}`,
    title: resultTitle(u),
    description: resultDescription(u),
    input_message_content: {
      message_text: `/user_${u.userCode}`,
    },
  };
  if (
    thumbUrl &&
    !thumbUrl.includes("placeholder.com")
  ) {
    return {
      ...base,
      thumbnail_url: thumbUrl,
      thumbnail_width: 128,
      thumbnail_height: 128,
    };
  }
  return base;
}

/**
 * باز کردن لیست اینلاین تلگرام (مثل پاتوق)
 * اگر اینلاین خاموش باشد → راهنمای BotFather
 */
export async function openInlineUserList(
  ctx: Context,
  opts: {
    viewerUserId: number;
    kind: InlineListKind;
    title: string;
    exploreOpts?: ExploreOpts;
    lang?: Lang | string | null;
  },
) {
  if (!ctx.from) return;
  const lang = normalizeLang(opts.lang);

  const token = createInlineListSession({
    viewerUserId: opts.viewerUserId,
    viewerTelegramId: ctx.from.id,
    kind: opts.kind,
    opts: opts.exploreOpts ?? {},
    title: opts.title,
    lang,
  });

  const session = getInlineListSession(token)!;
  const rows = await rowsForSession(session);
  const realCount = rows.filter(
    (u) => u.id !== opts.viewerUserId && u.telegramId < 9000000000n,
  ).length;
  const blastCount = Math.min(realCount, LIST_BLAST_LIMIT);

  const botInfo = await ctx.api.getMe();
  if (!botInfo.supports_inline_queries) {
    await ctx.reply(
      lang === "en"
        ? [
            "⚠️ Inline mode is still OFF.",
            "",
            "Do NOT type /setinline here.",
            "Open @BotFather → send /setinline → pick @Patoghchatbot",
            "Placeholder: search users",
          ].join("\n")
        : [
            "⚠️ حالت اینلاین هنوز خاموش است.",
            "",
            "❌ دستور /setinline را اینجا نزن.",
            "✅ برو @BotFather → بفرست /setinline",
            "✅ بات @Patoghchatbot را انتخاب کن",
            "✅ متن نمونه: جستجوی کاربران",
          ].join("\n"),
      {
        reply_markup: new InlineKeyboard().url(
          lang === "en" ? "Open BotFather" : "فتح BotFather",
          "https://t.me/BotFather",
        ),
      },
    );
    return;
  }

  const hint =
    lang === "en"
      ? [opts.title, "", "Tap below to open the scrollable list."].join("\n")
      : [opts.title, "", "برای دیدن لیست، دکمه زیر را بزن و اسکرول کن."].join(
          "\n",
        );

  const kb = new InlineKeyboard().switchInlineCurrent(
    lang === "en" ? "📋 Show as list" : "📋 نمایش بصورت لیستی",
    `search_${token}`,
  );
  kb.primary();
  if (blastCount > 0) {
    kb.row()
      .text(
        lang === "en"
          ? `✉️ DM first ${formatNum(blastCount)} (${formatNum(LIST_BLAST_COST)}💰)`
          : `✉️ پیام به ${formatNum(blastCount)} نفر اول (${formatNum(LIST_BLAST_COST)}💰)`,
        `list:blast:${token}`,
      )
      .success();
  }

  await ctx.reply(hint, { reply_markup: kb });

  // پیش‌گرم — قبل از اسکرول کاربر
  await ensureGenderDefaultPublicUrl("female").catch(() => undefined);
  await ensureGenderDefaultPublicUrl("male").catch(() => undefined);
  void prewarmListThumbs(ctx.api, rows, Math.min(50, rows.length)).catch(
    () => undefined,
  );
}

export async function answerInlineUserList(ctx: Context) {
  const q = ctx.inlineQuery;
  if (!q || !ctx.from) return;

  const raw = (q.query ?? "").trim();
  const m = /^search_([A-Za-z0-9_-]+)$/.exec(raw);
  if (!m) {
    const { answerInlineBotIntro } = await import("./inlineBotCard.js");
    await answerInlineBotIntro(ctx);
    return;
  }

  const session = getInlineListSession(m[1]!);
  if (!session || session.viewerTelegramId !== ctx.from.id) {
    await ctx.answerInlineQuery([], {
      cache_time: 1,
      is_personal: true,
      button: {
        text:
          session?.lang === "en" ? "Open bot first" : "اول ربات را باز کن",
        start_parameter: "list",
      },
    });
    return;
  }

  const offset = Number(q.offset || "0") || 0;
  const rows = await rowsForSession(session);
  const slice = rows.slice(offset, offset + PAGE);

  // مسیر داغ: فقط کش — fallback به عکس پیش‌فرض جنسیت
  let anyFallback = false;
  const results: InlineQueryResult[] = await Promise.all(
    slice.map(async (u) => {
      const cached = await cachedThumbOnly(u);
      if (cached) return toInlineResult(u, offset, cached);

      anyFallback = true;
      scheduleThumbBuild(ctx.api, u);
      // عکس پیش‌فرض جنسیت از سرور خودمان (sslip) — کات‌باکس مرده است
      const defUrl = await ensureGenderDefaultPublicUrl(u.gender).catch(
        () => null,
      );
      return toInlineResult(u, offset, defUrl);
    }),
  );

  // صفحهٔ بعد را پیش‌گرم کن
  const nextSlice = rows.slice(offset + PAGE, offset + PAGE * 2);
  if (nextSlice.length) {
    void prewarmListThumbs(ctx.api, nextSlice, nextSlice.length).catch(
      () => undefined,
    );
  }

  const nextEnd = offset + PAGE;
  const next =
    nextEnd < rows.length && nextEnd < MAX_USERS ? String(nextEnd) : "";

  await ctx.answerInlineQuery(results, {
    cache_time: anyFallback ? 1 : 120,
    is_personal: true,
    next_offset: next,
  });
}

export function inlineScopeKey(kind: InlineListKind, opts: ExploreOpts): string {
  if (kind === "nearby") return "n";
  if (kind === "contacts") return "c";
  if (kind === "all") return `a:${optsKeyFromExplore(opts)}`;
  return `s:${optsKeyFromExplore(opts)}`;
}
