import { prisma } from "../db/prisma.js";
import { patchUser, ensureUserCode } from "../db/users.js";
import { genderLabel, formatNum } from "../data/packages.js";
import { ratingLabel } from "./chatRating.js";
import { type Context } from "grammy";
import { InlineKeyboard } from "grammy";
import {
  exploreKeyboard,
  mainKeyboard,
} from "../keyboards/main.js";
import type { Prisma } from "@prisma/client";
import { tr, normalizeLang, type Lang } from "../i18n/index.js";
import {
  publicPhotoWithBadge,
  faceBadgeKind,
  faceBadgeEmoji,
} from "../lib/faceBadgePhoto.js";
import { haversineKm, formatDistance } from "../lib/geo.js";
import { formatInterestsLine } from "../data/interests.js";

export type ExploreMode =
  | "explore"
  | "explore_province"
  | "explore_age"
  | "explore_new"
  | "explore_nochats"
  | "explore_popular"
  | "explore_all";

export type ExploreOpts = {
  sameProvince?: boolean;
  sameAge?: boolean;
  newUsers?: boolean;
  noChats?: boolean;
  popular?: boolean;
  /** بدون فیلتر جنسیت علاقه — برای مشاهده همه / هم‌استانی کامل‌تر */
  ignoreLookingFor?: boolean;
  /** جستجوی پیشرفته */
  advanced?: boolean;
  gender?: "female" | "male" | "any";
  province?: string;
  city?: string;
  ageMin?: number;
  ageMax?: number;
  /** محدودیت آخرین فعالیت (ساعت). null = بدون محدودیت */
  onlineHours?: number | null;
  /** شعاع افراد نزدیک (کیلومتر) */
  nearbyRadiusKm?: number;
};

export type SearchListKind = "province" | "age" | "new" | "nochats" | "all";

const pendingSearchKind = new Map<number, SearchListKind>();

export function setPendingSearchKind(userId: number, kind: SearchListKind) {
  pendingSearchKind.set(userId, kind);
}

function takePendingSearchKind(userId: number): SearchListKind | undefined {
  const kind = pendingSearchKind.get(userId);
  pendingSearchKind.delete(userId);
  return kind;
}

export function searchGenderKeyboard(lang: Lang | string | null = "fa") {
  const L = normalizeLang(lang);
  return new InlineKeyboard()
    .text(tr(L, "👩 دختر", "👩 Girls"), "search:g:female")
    .success()
    .text(tr(L, "👨 پسر", "👨 Boys"), "search:g:male")
    .primary()
    .row()
    .text(tr(L, "👥 هردو", "👥 Both"), "search:g:any")
    .primary()
    .row()
    .text(tr(L, "❌ انصراف", "❌ Cancel"), "search:g:cancel")
    .danger();
}

function searchGenderPrompt(kind: SearchListKind, lang: Lang): string {
  const titles: Record<SearchListKind, [string, string]> = {
    province: [
      "🏘 هم‌استانی — با کی می‌خوای ببینی؟",
      "🏘 Same province — who do you want to see?",
    ],
    age: [
      "👤 هم‌سن — با کی می‌خوای ببینی؟",
      "👤 Same age — who do you want to see?",
    ],
    new: [
      "🆕 کاربران جدید — با کی می‌خوای ببینی؟",
      "🆕 New users — who do you want to see?",
    ],
    nochats: [
      "🚶 بدون چت — با کی می‌خوای ببینی؟",
      "🚶 No chats yet — who do you want to see?",
    ],
    all: [
      "📋 مشاهده همه — چه کسانی را نشونت بدم؟",
      "📋 View all — who should I show you?",
    ],
  };
  const [fa, en] = titles[kind];
  return tr(lang, fa, en);
}

/** قبل از لیست — انتخاب دختر / پسر / هردو */
export async function promptSearchGender(
  ctx: Context,
  userId: number,
  kind: SearchListKind,
) {
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) return;
  const lang = normalizeLang(me.language);

  if (kind === "province" && !me.province) {
    await ctx.reply(
      tr(lang, "اول استان را در پروفایل ثبت کن.", "Set your province in profile first."),
      { reply_markup: mainKeyboard(lang) },
    );
    return;
  }
  if (kind === "age" && me.age == null) {
    await ctx.reply(
      tr(lang, "اول سن را در پروفایل ثبت کن.", "Set your age in profile first."),
      { reply_markup: mainKeyboard(lang) },
    );
    return;
  }

  setPendingSearchKind(userId, kind);
  await ctx.reply(searchGenderPrompt(kind, lang), {
    reply_markup: searchGenderKeyboard(lang),
  });
}

export async function runSearchWithGender(
  ctx: Context,
  userId: number,
  gender: "female" | "male" | "any",
) {
  const kind = takePendingSearchKind(userId);
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) return;
  const lang = normalizeLang(me.language);

  if (!kind) {
    await ctx.reply(
      tr(
        lang,
        "جستجو منقضی شد. دوباره از منو انتخاب کن.",
        "Search expired. Pick again from the menu.",
      ),
      { reply_markup: mainKeyboard(lang) },
    );
    return;
  }

  const base: ExploreOpts = { gender, ignoreLookingFor: true };

  switch (kind) {
    case "province":
      await ctx.reply(
        tr(
          lang,
          `🏘 هم‌استانی‌های «${me.province}»:`,
          `🏘 Same province «${me.province}»:`,
        ),
      );
      await sendSearchList(ctx, userId, { ...base, sameProvince: true });
      return;
    case "age":
      await ctx.reply(
        tr(
          lang,
          `👤 هم‌سن‌های حدود ${me.age} سال:`,
          `👤 Around age ${me.age}:`,
        ),
      );
      await sendSearchList(ctx, userId, { ...base, sameAge: true });
      return;
    case "new":
      await sendSearchList(ctx, userId, { ...base, newUsers: true });
      return;
    case "nochats":
      await sendSearchList(ctx, userId, { ...base, noChats: true });
      return;
    case "all":
      await sendViewAllList(ctx, userId, { ...base, ignoreLookingFor: true });
      return;
  }
}

/** آخرین فیلتر سرچ هر کاربر — برای دکمه‌های «مشاهده همه / بعدی» */
const lastExploreOptsByUser = new Map<number, ExploreOpts>();

export function rememberExploreOpts(userId: number, opts: ExploreOpts) {
  lastExploreOptsByUser.set(userId, opts);
}

export function lastExploreOpts(userId: number): ExploreOpts | undefined {
  return lastExploreOptsByUser.get(userId);
}

export function exploreOptsFromState(state: string): ExploreOpts {
  switch (state) {
    case "explore_province":
      return { sameProvince: true };
    case "explore_age":
      return { sameAge: true };
    case "explore_new":
      return { newUsers: true };
    case "explore_nochats":
      return { noChats: true };
    case "explore_popular":
      return { popular: true };
    case "explore_all":
      return { ignoreLookingFor: true };
    default:
      return {};
  }
}

export function exploreStateFromOpts(opts: ExploreOpts): ExploreMode {
  if (opts.sameProvince) return "explore_province";
  if (opts.sameAge) return "explore_age";
  if (opts.newUsers) return "explore_new";
  if (opts.noChats) return "explore_nochats";
  if (opts.popular) return "explore_popular";
  if (opts.ignoreLookingFor) return "explore_all";
  return "explore";
}

export function optsKeyFromExplore(opts: ExploreOpts): string {
  if (opts.advanced) return "adv";
  if (opts.sameProvince) return "province";
  if (opts.sameAge) return "age";
  if (opts.newUsers) return "new";
  if (opts.noChats) return "nochats";
  if (opts.popular) return "popular";
  if (opts.ignoreLookingFor) return "all";
  return "default";
}

export function exploreOptsFromKey(key: string, userId?: number): ExploreOpts {
  const last = userId != null ? lastExploreOpts(userId) : undefined;
  const lastKey = last ? optsKeyFromExplore(last) : null;

  let base: ExploreOpts;
  if (key === "adv") {
    base =
      last ??
      {
        advanced: true,
        ignoreLookingFor: true,
      };
    return base;
  }
  switch (key) {
    case "province":
      base = { sameProvince: true };
      break;
    case "age":
      base = { sameAge: true };
      break;
    case "new":
      base = { newUsers: true };
      break;
    case "nochats":
      base = { noChats: true };
      break;
    case "popular":
      base = { popular: true };
      break;
    case "all":
      base = { ignoreLookingFor: true };
      break;
    default:
      base = {};
  }

  if (last && lastKey === key) {
    return {
      ...base,
      ...(last.gender ? { gender: last.gender } : {}),
      ignoreLookingFor: last.ignoreLookingFor ?? true,
    };
  }
  return base;
}

function listIntro(opts: ExploreOpts): string {
  if (opts.advanced) return "نتایج جستجوی پیشرفته:";
  if (opts.sameProvince) return "لیست افراد هم‌استانی:";
  if (opts.sameAge) return "لیست هم‌سن‌ها:";
  if (opts.newUsers) return "لیست کاربران جدید:";
  if (opts.noChats) return "لیست کاربرانی که هنوز چت نکرده‌اند:";
  if (opts.popular) return "لیست محبوب‌ترین‌ها بر اساس لایک:";
  if (opts.ignoreLookingFor) return "مشاهده همه کاربران فعال:";
  return "لیست کاربران مطابق فیلتر تو:";
}

function applyFilters(
  where: Prisma.UserWhereInput,
  me: {
    lookingFor: string | null;
    province: string | null;
    country: string | null;
    age: number | null;
  },
  opts: ExploreOpts,
  softActivity = false,
) {
  // جنسیت — اولویت با فیلتر پیشرفته
  if (opts.gender && opts.gender !== "any") {
    where.gender = opts.gender;
  } else if (!opts.ignoreLookingFor && me.lookingFor && me.lookingFor !== "any") {
    where.gender = me.lookingFor;
  }

  // مکان پیشرفته
  if (opts.province) {
    where.province = opts.province;
    where.country = me.country ?? "IR";
  }
  if (opts.city) {
    where.city = opts.city;
  }

  // سن پیشرفته
  if (opts.ageMin != null || opts.ageMax != null) {
    where.age = {
      ...(opts.ageMin != null ? { gte: opts.ageMin } : {}),
      ...(opts.ageMax != null ? { lte: opts.ageMax } : {}),
    };
  }

  if (opts.sameProvince && me.province && !opts.province) {
    where.province = me.province;
    if (me.country) where.country = me.country;
  }
  if (opts.sameAge && me.age != null && opts.ageMin == null && opts.ageMax == null) {
    where.age = { gte: me.age - 3, lte: me.age + 3 };
  }
  if (opts.noChats) {
    where.chatsCount = 0;
  }

  // زمان آنلاین / فعالیت
  if (opts.onlineHours != null && opts.onlineHours > 0) {
    where.lastActiveAt = {
      gte: new Date(Date.now() - opts.onlineHours * 3600_000),
    };
  } else if ((opts.sameProvince || opts.sameAge) && !softActivity && !opts.advanced) {
    where.lastActiveAt = {
      gte: new Date(Date.now() - 30 * 24 * 3600_000),
    };
  }
}

function orderFor(opts: ExploreOpts): Prisma.UserOrderByWithRelationInput[] {
  if (opts.popular) {
    return [{ likesCount: "desc" }, { lastActiveAt: "desc" }];
  }
  if (opts.newUsers) {
    return [{ createdAt: "desc" }];
  }
  return [{ isPro: "desc" }, { boostUntil: "desc" }, { lastActiveAt: "desc" }];
}

function isOnlineNow(lastActiveAt: Date): boolean {
  return Date.now() - lastActiveAt.getTime() <= 15 * 60_000;
}

function onlineStatus(u: {
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

function listCaption(
  u: {
    userCode: string | null;
    displayName: string | null;
    age: number | null;
    city: string | null;
    province: string | null;
    likesCount: number;
    lastActiveAt: Date;
    state: string;
    chatPartnerId: number | null;
    latitude: number | null;
    longitude: number | null;
    faceVerified: boolean;
    isPro?: boolean;
  },
  me: { latitude: number | null; longitude: number | null },
): string {
  const code = u.userCode ?? "????";
  const online = isOnlineNow(u.lastActiveAt) ? "🟢 " : "";
  const badge = faceBadgeEmoji(faceBadgeKind(u, false));
  const vip = u.isPro ? "👑 " : "";
  const name = u.displayName ?? "بدون‌نام";
  const age = u.age ?? "—";
  const place = [u.city, u.province ? `(${u.province})` : null]
    .filter(Boolean)
    .join("");
  let dist = "";
  if (
    me.latitude != null &&
    me.longitude != null &&
    u.latitude != null &&
    u.longitude != null
  ) {
    const km = haversineKm(me.latitude, me.longitude, u.latitude, u.longitude);
    dist = ` (🏁 ${formatDistance(km)})`;
  }
  return [
    `${vip}${online}${name} ${age} ${badge}`,
    `/user_${code}`,
    `${place || "—"}${dist} (❤️ ${formatNum(u.likesCount)})`,
    onlineStatus(u),
  ].join("\n");
}

async function queryList(
  viewerId: number,
  me: {
    lookingFor: string | null;
    province: string | null;
    country: string | null;
    age: number | null;
  },
  opts: ExploreOpts,
  limit: number,
) {
  const { excludedUserIds } = await import("./block.js");
  const blockedIds = await excludedUserIds(viewerId);
  const where: Prisma.UserWhereInput = {
    registered: true,
    isActive: true,
    deletedAt: null,
    id: { notIn: [viewerId, ...blockedIds] },
  };
  applyFilters(where, me, opts, false);

  let list = await prisma.user.findMany({
    where,
    orderBy: orderFor(opts),
    take: limit,
  });

  // اگر هم‌استانی خالی بود: بدون محدودیت فعالیت / بدون فیلتر علاقه
  if (!list.length && opts.sameProvince && me.province) {
    const where2: Prisma.UserWhereInput = {
      registered: true,
      isActive: true,
      deletedAt: null,
      id: { notIn: [viewerId, ...blockedIds] },
      province: me.province,
      ...(me.country ? { country: me.country } : {}),
    };
    applyFilters(where2, me, { ...opts, sameProvince: false }, true);
    list = await prisma.user.findMany({
      where: where2,
      orderBy: orderFor(opts),
      take: limit,
    });
  }

  return list;
}

/** لیست سرچ — Inline Query تلگرام (مثل پاتوق) */
export async function sendSearchList(
  ctx: Context,
  viewerId: number,
  opts: ExploreOpts = {},
  _limit = 100,
  _page = 0,
  _edit = false,
) {
  const me = await prisma.user.findUnique({ where: { id: viewerId } });
  if (!me) return;
  const lang = me.language === "en" ? "en" : "fa";

  if (opts.sameProvince && !me.province) {
    await ctx.reply(
      lang === "en"
        ? "Set your province in profile first."
        : "اول استان را در پروفایل ثبت کن.",
      { reply_markup: mainKeyboard(lang) },
    );
    return;
  }

  const list = await queryList(viewerId, me, opts, 1);

  if (!list.length) {
    await ctx.reply(
      [
        lang === "en"
          ? "No one matched this filter."
          : "فعلاً کسی با این فیلتر پیدا نشد.",
        opts.sameProvince
          ? lang === "en"
            ? `Your province: ${me.province ?? "—"}`
            : `استان تو: ${me.province ?? "—"} — شاید هنوز هم‌استانی فعالی ثبت‌نام نکرده.`
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
      { reply_markup: mainKeyboard(lang) },
    );
    return;
  }

  await patchUser(viewerId, {
    state: exploreStateFromOpts(opts),
    lastActiveAt: new Date(),
  });

  rememberExploreOpts(viewerId, opts);

  const { openInlineUserList } = await import("./inlineList.js");
  await openInlineUserList(ctx, {
    viewerUserId: viewerId,
    kind: "search",
    title: `🔍 ${listIntro(opts)}`,
    exploreOpts: opts,
    lang,
  });
}

/** مشاهده همه — Inline Query */
export async function sendViewAllList(
  ctx: Context,
  viewerId: number,
  opts: ExploreOpts = {},
  _limit = 100,
  _page = 0,
  _edit = false,
) {
  const me = await prisma.user.findUnique({ where: { id: viewerId } });
  if (!me) return;
  const lang = me.language === "en" ? "en" : "fa";

  const list = await queryList(
    viewerId,
    me,
    { ...opts, ignoreLookingFor: opts.ignoreLookingFor ?? true },
    1,
  );

  if (!list.length) {
    await ctx.reply(
      lang === "en" ? "No users to show." : "فعلاً کاربری برای نمایش نیست.",
      { reply_markup: mainKeyboard(lang) },
    );
    return;
  }

  await patchUser(viewerId, { state: "explore_all", lastActiveAt: new Date() });
  rememberExploreOpts(viewerId, {
    ...opts,
    ignoreLookingFor: opts.ignoreLookingFor ?? true,
  });

  const { openInlineUserList } = await import("./inlineList.js");
  await openInlineUserList(ctx, {
    viewerUserId: viewerId,
    kind: "all",
    title:
      lang === "en" ? "📋 View all users" : "📋 مشاهده همه کاربران",
    exploreOpts: { ...opts, ignoreLookingFor: true },
    lang,
  });
}

/** باز کردن پروفایل با /user_CODE */
export async function showProfileByUserCode(
  ctx: Context,
  viewerId: number,
  userCode: string,
) {
  const me = await prisma.user.findUnique({ where: { id: viewerId } });
  if (!me) return;

  const candidate = await prisma.user.findUnique({ where: { userCode } });
  if (!candidate || candidate.deletedAt || !candidate.registered) {
    await ctx.reply("این کاربر پیدا نشد یا غیرفعال است.");
    return;
  }
  if (candidate.id === viewerId) {
    const { sendProfileCard } = await import("./profile.js");
    await sendProfileCard(ctx, viewerId);
    return;
  }
  if (!candidate.isActive) {
    await ctx.reply("این حساب فعلاً غیرفعال است.");
    return;
  }

  const { hasBlocked } = await import("./block.js");
  const theyBlockedMe = await hasBlocked(candidate.id, viewerId);
  if (theyBlockedMe) {
    const lang = me.language === "en" ? "en" : "fa";
    await ctx.reply(
      lang === "en"
        ? "You can't view this profile."
        : "امکان مشاهده این پروفایل نیست.",
    );
    return;
  }
  const iBlocked = await hasBlocked(viewerId, candidate.id);

  await prisma.exploreSeen.upsert({
    where: { viewerId_shownId: { viewerId, shownId: candidate.id } },
    create: { viewerId, shownId: candidate.id },
    update: {},
  });
  const viewCreated = await prisma.interaction.createMany({
    data: [{ type: "view", fromUserId: viewerId, toUserId: candidate.id }],
    skipDuplicates: true,
  });
  if (viewCreated.count > 0) {
    // Do NOT use patchUser — it bumps lastActiveAt and falsely marks the viewee "online".
    await prisma.user.update({
      where: { id: candidate.id },
      data: { viewsCount: { increment: 1 } },
    });
  }

  const loc = [candidate.city, candidate.province].filter(Boolean).join(" - ");
  let distanceLine = "🏁 فاصله از شما: نامعلوم";
  if (
    me.latitude != null &&
    me.longitude != null &&
    candidate.latitude != null &&
    candidate.longitude != null
  ) {
    const km = haversineKm(
      me.latitude,
      me.longitude,
      candidate.latitude,
      candidate.longitude,
    );
    distanceLine = `🏁 فاصله از شما: ${formatDistance(km)}`;
  }

  const online = isOnlineNow(candidate.lastActiveAt) ? "🟢 " : "";
  const badge = faceBadgeEmoji(faceBadgeKind(candidate, false));
  const interests = formatInterestsLine(candidate.interests);
  const viewsShown =
    viewCreated.count > 0
      ? candidate.viewsCount + 1
      : candidate.viewsCount;
  const text = [
    `❤️ ${formatNum(candidate.likesCount)} لایک`,
    "",
    `آیدی: /user_${candidate.userCode}`,
    `${candidate.isPro ? "👑 " : ""}${online}👤 ${candidate.displayName ?? "بدون نام"} (${candidate.age ?? "—"}) ${badge}`,
    `┃ ${genderLabel(candidate.gender)}`,
    loc ? `┃ 📍 ${loc}` : null,
    candidate.bio ? `┃ ${candidate.bio}` : null,
    interests ? `┃ ✨ ${interests}` : null,
    `┃ 👁 ${formatNum(viewsShown)}`,
    `┃ ${ratingLabel(candidate.ratingSum, candidate.ratingCount, "fa")}`,
    `┃ ${distanceLine}`,
    `┃ ${onlineStatus(candidate)}`,
    "┗━━━━━━━━━━━━┛",
  ]
    .filter(Boolean)
    .join("\n");

  const contactsP = (await import("./contacts.js")).isInContacts(
    viewerId,
    candidate.id,
  );
  const kb = exploreKeyboard(
    candidate.id,
    candidate.likesCount,
    await contactsP,
    me.language,
    iBlocked,
  );
  try {
    const photo = await publicPhotoWithBadge(ctx.api, candidate);
    const sent = await ctx.replyWithPhoto(photo, {
      caption: text,
      reply_markup: kb,
    });
    const { publicPhotoCacheKey, rememberPhotoFromMessage } = await import(
      "../lib/faceBadgePhoto.js"
    );
    rememberPhotoFromMessage(publicPhotoCacheKey(candidate), sent);
  } catch (err) {
    console.error("showProfileByUserCode send photo failed", candidate.id, err);
    await ctx.reply(text, { reply_markup: kb });
  }

  try {
    const { notifyProfileViewSafe } = await import("./profileViewNotify.js");
    notifyProfileViewSafe(ctx.api, viewerId, candidate.id);
  } catch {
    /* fail soft — viewing still succeeded */
  }
}

/** بعدی/رد — یک پروفایل تصادفی با همان فیلتر (از فوتر لیست) */
export async function nextExploreProfile(
  ctx: Context,
  viewerId: number,
  opts: ExploreOpts = {},
) {
  const me = await prisma.user.findUnique({ where: { id: viewerId } });
  if (!me) return;

  const seen = await prisma.exploreSeen.findMany({
    where: { viewerId },
    select: { shownId: true },
  });
  const seenIds = seen.map((s) => s.shownId);

  const where: Prisma.UserWhereInput = {
    registered: true,
    isActive: true,
    deletedAt: null,
    id: { not: viewerId, ...(seenIds.length ? { notIn: seenIds } : {}) },
  };
  applyFilters(where, me, opts);

  let candidate = await prisma.user.findFirst({
    where,
    orderBy: orderFor(opts),
  });

  if (!candidate && seenIds.length) {
    await prisma.exploreSeen.deleteMany({ where: { viewerId } });
    const where2: Prisma.UserWhereInput = {
      registered: true,
      isActive: true,
      deletedAt: null,
      id: { not: viewerId },
    };
    applyFilters(where2, me, opts);
    candidate = await prisma.user.findFirst({
      where: where2,
      orderBy: orderFor(opts),
    });
  }

  if (!candidate && opts.sameProvince && me.province) {
    candidate = await prisma.user.findFirst({
      where: {
        registered: true,
        isActive: true,
        deletedAt: null,
        id: { not: viewerId },
        province: me.province,
      },
      orderBy: orderFor(opts),
    });
  }

  if (!candidate) {
    await ctx.reply("پروفایل دیگری در این فیلتر نیست.", {
      reply_markup: mainKeyboard(),
    });
    return;
  }

  if (!candidate.userCode) {
    await ensureUserCode(candidate.id, candidate.userCode);
    const again = await prisma.user.findUnique({ where: { id: candidate.id } });
    if (again?.userCode) {
      await showProfileByUserCode(ctx, viewerId, again.userCode);
      return;
    }
  } else {
    await showProfileByUserCode(ctx, viewerId, candidate.userCode);
  }
}
