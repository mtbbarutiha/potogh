import { prisma } from "../db/prisma.js";
import {
  LIKE_GIFT_DIAMONDS,
  THREAD_GIFT_COST,
} from "../data/packages.js";
import { formatUptime, getUptimeSec } from "../lib/logger.js";
import { getPollWatch, HEARTBEAT_FILE } from "../lib/pollWatch.js";
import { channelChatId, channelUsername } from "../middleware/forceJoin.js";
import { isDemoPayAllowed } from "./diamonds.js";
import fs from "node:fs";

import { tehranTodayStart } from "./dailyCoin.js";

function startOfMonth(year: number, month: number) {
  return new Date(year, month, 1);
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek() {
  const d = startOfToday();
  d.setDate(d.getDate() - 6);
  return d;
}

function todayRegisteredWhere(from: Date) {
  return {
    registered: true,
    deletedAt: null,
    createdAt: { gte: from },
  } as const;
}

/** ثبت‌نام‌های امروز (تهران) به تفکیک جنسیت */
export async function getTodayRegistrationByGender() {
  const todayStart = tehranTodayStart();
  const base = todayRegisteredWhere(todayStart);
  const [female, male, other, total] = await Promise.all([
    prisma.user.count({ where: { ...base, gender: "female" } }),
    prisma.user.count({ where: { ...base, gender: "male" } }),
    prisma.user.count({
      where: {
        ...base,
        OR: [{ gender: null }, { gender: { notIn: ["female", "male"] } }],
      },
    }),
    prisma.user.count({ where: base }),
  ]);
  return {
    dateLabel: todayStart.toLocaleDateString("fa-IR", {
      timeZone: "Asia/Tehran",
      dateStyle: "full",
    }),
    female,
    male,
    other,
    total,
  };
}

export async function getRegistrationStats() {
  const now = new Date();
  // ماه شمسی جاری (نه میلادی) تا آمار «این ماه» درست باشد
  const monthStart = tehranJalaliMonthStart(now);
  // ۳ ماه اخیر = پنجره‌ی ۹۰ روزه‌ی چرخشی
  const threeMonths = new Date(tehranTodayStart(now).getTime() - 90 * 86_400_000);
  const todayStart = tehranTodayStart();

  const [
    totalRegistered,
    totalActive,
    registeredToday,
    registeredTodayFemale,
    registeredTodayMale,
    registeredTodayOther,
    registeredThisMonth,
    registeredLast3Months,
    pendingPhotos,
    pendingFaces,
    deletedAccounts,
    incompleteRegs,
    registeredFemale,
    registeredMale,
    registeredOtherGender,
  ] = await Promise.all([
    prisma.user.count({ where: { registered: true, deletedAt: null } }),
    prisma.user.count({
      where: { registered: true, isActive: true, deletedAt: null },
    }),
    prisma.user.count({ where: todayRegisteredWhere(todayStart) }),
    prisma.user.count({
      where: { ...todayRegisteredWhere(todayStart), gender: "female" },
    }),
    prisma.user.count({
      where: { ...todayRegisteredWhere(todayStart), gender: "male" },
    }),
    prisma.user.count({
      where: {
        ...todayRegisteredWhere(todayStart),
        OR: [{ gender: null }, { gender: { notIn: ["female", "male"] } }],
      },
    }),
    prisma.user.count({
      where: {
        registered: true,
        deletedAt: null,
        createdAt: { gte: monthStart },
      },
    }),
    prisma.user.count({
      where: {
        registered: true,
        deletedAt: null,
        createdAt: { gte: threeMonths },
      },
    }),
    prisma.user.count({
      where: { photoStatus: "pending", deletedAt: null },
    }),
    prisma.user.count({
      where: { faceStatus: "pending", deletedAt: null },
    }),
    prisma.deletedAccount.count(),
    prisma.user.count({
      where: { registered: false, deletedAt: null },
    }),
    prisma.user.count({
      where: { registered: true, deletedAt: null, gender: "female" },
    }),
    prisma.user.count({
      where: { registered: true, deletedAt: null, gender: "male" },
    }),
    prisma.user.count({
      where: {
        registered: true,
        deletedAt: null,
        OR: [
          { gender: null },
          { gender: { notIn: ["female", "male"] } },
        ],
      },
    }),
  ]);

  const byMonth: { label: string; count: number; female: number; male: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const y = now.getFullYear();
    const m = now.getMonth() - i;
    const from = startOfMonth(y, m);
    const to = startOfMonth(y, m + 1);
    const baseWhere = {
      registered: true,
      deletedAt: null,
      createdAt: { gte: from, lt: to },
    } as const;
    const [count, female, male] = await Promise.all([
      prisma.user.count({ where: baseWhere }),
      prisma.user.count({ where: { ...baseWhere, gender: "female" } }),
      prisma.user.count({ where: { ...baseWhere, gender: "male" } }),
    ]);
    const label = from.toLocaleDateString("fa-IR", {
      year: "numeric",
      month: "long",
    });
    byMonth.push({ label, count, female, male });
  }

  return {
    totalRegistered,
    totalActive,
    registeredToday,
    registeredTodayFemale,
    registeredTodayMale,
    registeredTodayOther,
    registeredThisMonth,
    registeredLast3Months,
    pendingPhotos,
    pendingFaces,
    deletedAccounts,
    incompleteRegs,
    registeredFemale,
    registeredMale,
    registeredOtherGender,
    byMonth,
  };
}

export async function listPendingPhotos(limit = 20) {
  return prisma.user.findMany({
    where: {
      photoStatus: "pending",
      photoPendingFileId: { not: null },
      deletedAt: null,
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
}

export async function listPendingFaces(limit = 20) {
  return prisma.user.findMany({
    where: {
      faceStatus: "pending",
      facePendingFileId: { not: null },
      deletedAt: null,
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
}

async function sumPaid(from?: Date, to?: Date) {
  const where: {
    status: string;
    updatedAt?: { gte?: Date; lt?: Date };
  } = { status: "paid" };
  if (from || to) {
    where.updatedAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lt: to } : {}),
    };
  }
  const agg = await prisma.diamondOrder.aggregate({
    where,
    _sum: { amountToman: true, diamonds: true },
    _count: true,
  });
  return {
    toman: agg._sum.amountToman ?? 0,
    diamonds: agg._sum.diamonds ?? 0,
    orders: agg._count,
  };
}

/** آمار درآمد از سفارش‌های پرداخت‌شده سکه */
export async function getRevenueStats() {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 6);
  const monthStart = startOfMonth(now.getFullYear(), now.getMonth());

  const [today, yesterday, week, month, all, pending] = await Promise.all([
    sumPaid(todayStart),
    sumPaid(yesterdayStart, todayStart),
    sumPaid(weekStart),
    sumPaid(monthStart),
    sumPaid(),
    prisma.diamondOrder.aggregate({
      where: { status: "pending" },
      _sum: { amountToman: true, diamonds: true },
      _count: true,
    }),
  ]);

  const recentPaid = await prisma.diamondOrder.findMany({
    where: { status: "paid" },
    orderBy: { updatedAt: "desc" },
    take: 8,
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          userCode: true,
          username: true,
        },
      },
    },
  });

  return {
    today,
    yesterday,
    week,
    month,
    all,
    pending: {
      toman: pending._sum.amountToman ?? 0,
      diamonds: pending._sum.diamonds ?? 0,
      orders: pending._count,
    },
    recentPaid,
  };
}

/** داشبورد زنده برای لانچ / تبلیغات */

const liveUserBase = {
  deletedAt: null,
  registered: true,
} as const;

/** آمار زنده چت — فقط شمارش (بدون مشاهده گفتگو) */
export async function getLiveChatStats() {
  const [chattingUsers, chattingOrphaned, waitingQueue, partnerWithoutChatting] =
    await Promise.all([
      prisma.user.count({
        where: {
          ...liveUserBase,
          state: "chatting",
          chatPartnerId: { not: null },
        },
      }),
      prisma.user.count({
        where: {
          ...liveUserBase,
          state: "chatting",
          chatPartnerId: null,
        },
      }),
      prisma.user.count({
        where: {
          ...liveUserBase,
          state: "waiting",
        },
      }),
      prisma.user.count({
        where: {
          ...liveUserBase,
          state: { not: "chatting" },
          chatPartnerId: { not: null },
        },
      }),
    ]);
  return {
    chattingUsers,
    activeChatPairs: Math.floor(chattingUsers / 2),
    waitingQueue,
    chattingOrphaned,
    partnerWithoutChatting,
  };
}

export async function getLaunchDashboard() {
  const todayStart = startOfToday();
  const weekStart = startOfWeek();

  const [
    totalUsers,
    registeredToday,
    registeredWeek,
    chattingNow,
    waitingQueue,
    coinsCirculation,
    likesToday,
    threadsToday,
    pendingOrders,
    paidToday,
    dbOk,
  ] = await Promise.all([
    prisma.user.count({ where: { registered: true, deletedAt: null } }),
    prisma.user.count({
      where: {
        registered: true,
        deletedAt: null,
        createdAt: { gte: todayStart },
      },
    }),
    prisma.user.count({
      where: {
        registered: true,
        deletedAt: null,
        createdAt: { gte: weekStart },
      },
    }),
    prisma.user.count({
      where: { state: "chatting", deletedAt: null },
    }),
    prisma.user.count({
      where: { state: "waiting", deletedAt: null },
    }),
    prisma.user.aggregate({
      where: { deletedAt: null },
      _sum: { diamonds: true },
    }),
    prisma.interaction.count({
      where: { type: "like", createdAt: { gte: todayStart } },
    }),
    prisma.interaction.count({
      where: { type: "thread", createdAt: { gte: todayStart } },
    }),
    prisma.diamondOrder.count({
      where: { status: { in: ["pending", "awaiting_review"] } },
    }),
    prisma.diamondOrder.aggregate({
      where: { status: "paid", updatedAt: { gte: todayStart } },
      _sum: { amountToman: true, diamonds: true },
      _count: true,
    }),
    prisma.$queryRaw`SELECT 1`
      .then(() => true)
      .catch(() => false),
  ]);

  // تقریبی: لایک ۱ سکه + نخ ۵ سکه (هزینه فرستنده)
  const spentTodayApprox =
    likesToday * LIKE_GIFT_DIAMONDS + threadsToday * THREAD_GIFT_COST;

  let heartbeatAgeSec: number | null = null;
  let heartbeatReason = "—";
  try {
    if (fs.existsSync(HEARTBEAT_FILE)) {
      const raw = fs.readFileSync(HEARTBEAT_FILE, "utf8").trim();
      const [epoch, , ...rest] = raw.split(/\s+/);
      const ms = Number(epoch);
      if (Number.isFinite(ms) && ms > 1e12) {
        heartbeatAgeSec = Math.round((Date.now() - ms) / 1000);
      }
      heartbeatReason = rest.join(" ") || "ok";
    }
  } catch {
    /* ignore */
  }

  const poll = getPollWatch();
  const memMb = Math.round(process.memoryUsage().rss / 1024 / 1024);

  return {
    totalUsers,
    registeredToday,
    registeredWeek,
    chattingNow,
    waitingQueue,
    coinsCirculation: coinsCirculation._sum.diamonds ?? 0,
    likesToday,
    threadsToday,
    spentTodayApprox,
    pendingOrders,
    paidToday: {
      toman: paidToday._sum.amountToman ?? 0,
      diamonds: paidToday._sum.diamonds ?? 0,
      orders: paidToday._count,
    },
    dbOk,
    uptime: formatUptime(),
    uptimeSec: getUptimeSec(),
    heartbeatAgeSec,
    heartbeatReason,
    pollOk: poll.pollOkCount,
    pollFail: poll.pollFailCount,
    memMb,
    pid: process.pid,
    demoPay: isDemoPayAllowed(),
    forceJoinChannel: channelUsername(),
    forceJoinChatId: String(channelChatId()),
    nodeEnv: process.env.NODE_ENV ?? "—",
    mode: process.env.PATOGH_MODE ?? "—",
    webAppUrl: (process.env.WEB_APP_URL ?? "").trim() || null,
  };
}

/** وضعیت چک عضویت کانال (ربات باید ادمین باشد) */
export async function checkForceJoinHealth(
  api: { getChatMember: (chatId: string | number, userId: number) => Promise<{ status: string }> },
  botId: number,
): Promise<{ ok: boolean; detail: string }> {
  try {
    const m = await api.getChatMember(channelChatId(), botId);
    const admin = m.status === "administrator" || m.status === "creator";
    if (admin) {
      return { ok: true, detail: `ربات ${m.status} کانال است ✅` };
    }
    return {
      ok: false,
      detail: `ربات عضو است (${m.status}) ولی ادمین نیست — چک خودکار کار نمی‌کند`,
    };
  } catch (err) {
    const msg =
      err && typeof err === "object" && "description" in err
        ? String((err as { description: unknown }).description)
        : err instanceof Error
          ? err.message
          : String(err);
    if (/inaccessible|CHAT_ADMIN_REQUIRED|not enough rights/i.test(msg)) {
      return {
        ok: false,
        detail: "ربات ادمین کانال نیست — member list inaccessible",
      };
    }
    return { ok: false, detail: msg.slice(0, 120) };
  }
}


/** گزارش مصرف/جریان سکه به تفکیک بخش (از دفترکل CoinLedger) */
export async function getCoinUsageReport() {
  // تفکیک بر اساس علامتِ هر تراکنش (نه خالصِ هر دلیل) تا هر بخش
  // هم در «دریافت‌شده» هم در «خرج‌شده» کامل دیده شود.
  const [earnRows, spendRows] = await Promise.all([
    prisma.coinLedger.groupBy({
      by: ["reason"],
      where: { delta: { gt: 0 } },
      _sum: { delta: true },
      _count: { _all: true },
    }),
    prisma.coinLedger.groupBy({
      by: ["reason"],
      where: { delta: { lt: 0 } },
      _sum: { delta: true },
      _count: { _all: true },
    }),
  ]);
  const earns = earnRows
    .map((r) => ({ reason: r.reason, net: r._sum.delta ?? 0, count: r._count._all }))
    .filter((x) => x.net > 0)
    .sort((a, b) => b.net - a.net);
  const spends = spendRows
    .map((r) => ({ reason: r.reason, net: r._sum.delta ?? 0, count: r._count._all }))
    .filter((x) => x.net < 0)
    .sort((a, b) => a.net - b.net);
  const totalEarned = earns.reduce((s, x) => s + x.net, 0);
  const totalSpent = spends.reduce((s, x) => s + Math.abs(x.net), 0);
  return { spends, earns, totalSpent, totalEarned };
}

/** کاربران با بیشترین موجودی سکه */
export async function getTopCoinUsers(limit = 15) {
  return prisma.user.findMany({
    where: { deletedAt: null, telegramId: { lt: 9000000000n } },
    orderBy: { diamonds: "desc" },
    take: limit,
    select: {
      id: true,
      displayName: true,
      userCode: true,
      diamonds: true,
      telegramId: true,
    },
  });
}

/** شروع ماه شمسی جاری (نیمه‌شب تهران) با تقویم فارسیِ Intl */
export function tehranJalaliMonthStart(now = new Date()): Date {
  const day = Number(
    new Intl.DateTimeFormat("en-US-u-ca-persian", {
      timeZone: "Asia/Tehran",
      day: "numeric",
    }).format(now),
  );
  const todayStart = tehranTodayStart(now);
  return new Date(todayStart.getTime() - (day - 1) * 86_400_000);
}

/** نام ماه شمسی جاری */
export function jalaliMonthName(now = new Date()): string {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    timeZone: "Asia/Tehran",
    month: "long",
  }).format(now);
}

/** گزارش مدیریتی جامع برای خانه‌ی پنل */
export async function getManagerReport() {
  const now = new Date();
  const todayStart = tehranTodayStart(now);
  const yStart = new Date(todayStart.getTime() - 86_400_000);
  const weekStart = new Date(todayStart.getTime() - 7 * 86_400_000);
  const jMonthStart = tehranJalaliMonthStart(now);
  const reg = { registered: true, deletedAt: null } as const;

  const [
    total,
    active,
    today,
    todayF,
    todayM,
    yesterday,
    week,
    jMonth,
    female,
    male,
    pendingPhotos,
    pendingFaces,
    openSells,
    chatting,
    queue,
    spentTodayAgg,
    purchasedTodayAgg,
    revenueAllAgg,
  ] = await Promise.all([
    prisma.user.count({ where: reg }),
    prisma.user.count({ where: { ...reg, isActive: true } }),
    prisma.user.count({ where: { ...reg, createdAt: { gte: todayStart } } }),
    prisma.user.count({
      where: { ...reg, gender: "female", createdAt: { gte: todayStart } },
    }),
    prisma.user.count({
      where: { ...reg, gender: "male", createdAt: { gte: todayStart } },
    }),
    prisma.user.count({
      where: { ...reg, createdAt: { gte: yStart, lt: todayStart } },
    }),
    prisma.user.count({ where: { ...reg, createdAt: { gte: weekStart } } }),
    prisma.user.count({ where: { ...reg, createdAt: { gte: jMonthStart } } }),
    prisma.user.count({ where: { ...reg, gender: "female" } }),
    prisma.user.count({ where: { ...reg, gender: "male" } }),
    prisma.user.count({ where: { photoStatus: "pending", deletedAt: null } }),
    prisma.user.count({ where: { faceStatus: "pending", deletedAt: null } }),
    prisma.coinSellRequest.count({ where: { status: "open" } }),
    prisma.user.count({
      where: { state: "chatting", chatPartnerId: { not: null }, deletedAt: null },
    }),
    prisma.user.count({ where: { state: "waiting", deletedAt: null } }),
    prisma.coinLedger.aggregate({
      where: { delta: { lt: 0 }, createdAt: { gte: todayStart } },
      _sum: { delta: true },
    }),
    prisma.coinLedger.aggregate({
      where: { reason: "purchase", createdAt: { gte: todayStart } },
      _sum: { delta: true },
    }),
    prisma.diamondOrder.aggregate({
      where: { status: "paid" },
      _sum: { amountToman: true },
    }),
  ]);

  return {
    monthName: jalaliMonthName(now),
    total,
    active,
    today,
    todayF,
    todayM,
    yesterday,
    week,
    jMonth,
    female,
    male,
    pendingPhotos,
    pendingFaces,
    openSells,
    chattingPairs: Math.floor(chatting / 2),
    chatting,
    queue,
    spentToday: Math.abs(spentTodayAgg._sum.delta ?? 0),
    purchasedToday: purchasedTodayAgg._sum.delta ?? 0,
    revenueAllToman: revenueAllAgg._sum.amountToman ?? 0,
  };
}
