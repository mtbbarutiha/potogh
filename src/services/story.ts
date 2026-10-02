import { prisma } from "../db/prisma.js";
import { STORY_TTL_HOURS, STORY_BOOST_COST } from "../data/packages.js";
import { debitCoins } from "./coins.js";

export type StoryKind = "photo" | "text";

function expiryFrom(now = new Date()): Date {
  return new Date(now.getTime() + STORY_TTL_HOURS * 3_600_000);
}

/**
 * ساخت استوری.
 * - متن‌تنها: مستقیم approved
 * - عکس‌دار: pending تا تأیید ادمین
 * هر کاربر فقط یک استوری فعال (غیرمنقضی و غیر rejected) دارد.
 */
export async function createStory(input: {
  userId: number;
  kind: StoryKind;
  text?: string | null;
  photoFileId?: string | null;
}): Promise<{ ok: true; id: number; pending: boolean } | { ok: false; reason: "active_exists" }> {
  const now = new Date();
  const active = await prisma.story.count({
    where: {
      userId: input.userId,
      status: { in: ["pending", "approved"] },
      expiresAt: { gt: now },
    },
  });
  if (active > 0) return { ok: false, reason: "active_exists" };

  const pending = input.kind === "photo";
  const row = await prisma.story.create({
    data: {
      userId: input.userId,
      kind: input.kind,
      text: input.text?.trim() || null,
      photoFileId: input.photoFileId ?? null,
      status: pending ? "pending" : "approved",
      expiresAt: expiryFrom(now),
    },
  });
  return { ok: true, id: row.id, pending };
}

export async function getStoryById(id: number) {
  return prisma.story.findUnique({ where: { id } });
}

export async function approveStory(id: number): Promise<boolean> {
  // فقط اگر هنوز pending است — تمدید انقضا از لحظه‌ی تأیید
  const res = await prisma.story.updateMany({
    where: { id, status: "pending" },
    data: { status: "approved", reviewedAt: new Date(), expiresAt: expiryFrom() },
  });
  return res.count === 1;
}

export async function rejectStory(id: number): Promise<boolean> {
  const res = await prisma.story.updateMany({
    where: { id, status: "pending" },
    data: { status: "rejected", reviewedAt: new Date() },
  });
  return res.count === 1;
}

export async function countPendingStories(): Promise<number> {
  return prisma.story.count({ where: { status: "pending" } });
}

export async function listPendingStories(limit = 20) {
  return prisma.story.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

/** استوری‌های فعال برای نمایش به یک بیننده (به‌جز خودش)، بوست‌شده‌ها اول */
export async function listActiveStories(
  viewerUserId: number,
  excludeIds: number[] = [],
  limit = 30,
) {
  const now = new Date();
  return prisma.story.findMany({
    where: {
      status: "approved",
      expiresAt: { gt: now },
      userId: { not: viewerUserId },
      ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
    },
    orderBy: [{ boosted: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
}

export async function incrementStoryView(id: number): Promise<void> {
  await prisma.story
    .update({ where: { id }, data: { viewCount: { increment: 1 } } })
    .catch(() => undefined);
}

/** استوری فعال فعلی کاربر (برای بوست/نمایش وضعیت) */
export async function getMyActiveStory(userId: number) {
  const now = new Date();
  return prisma.story.findFirst({
    where: {
      userId,
      status: { in: ["pending", "approved"] },
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** بوست استوری — کسر سکه، فقط روی استوری approvedِ فعالِ خود کاربر */
export async function boostMyStory(
  userId: number,
): Promise<"ok" | "no_story" | "already" | "balance" | "not_approved"> {
  const story = await getMyActiveStory(userId);
  if (!story) return "no_story";
  if (story.status !== "approved") return "not_approved";
  if (story.boosted) return "already";
  const paid = await debitCoins(userId, STORY_BOOST_COST, "boost");
  if (!paid) return "balance";
  await prisma.story.update({ where: { id: story.id }, data: { boosted: true } });
  return "ok";
}

/** پاک‌سازی استوری‌های منقضی (برای تایمر دوره‌ای) */
export async function cleanupExpiredStories(): Promise<number> {
  const now = new Date();
  const res = await prisma.story.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: now } },
        { status: "rejected", reviewedAt: { lt: new Date(now.getTime() - 86_400_000) } },
      ],
    },
  });
  return res.count;
}
