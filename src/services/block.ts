import { prisma } from "../db/prisma.js";

/** آیا viewer این کاربر را بلاک کرده؟ */
export async function hasBlocked(
  blockerUserId: number,
  blockedUserId: number,
): Promise<boolean> {
  if (blockerUserId === blockedUserId) return false;
  const row = await prisma.userBlock.findUnique({
    where: {
      blockerUserId_blockedUserId: { blockerUserId, blockedUserId },
    },
  });
  return !!row;
}

/** بلاک دوطرفه برای تعامل (چت/دایرکت/نمایش) */
export async function isBlockedEither(
  aUserId: number,
  bUserId: number,
): Promise<boolean> {
  if (aUserId === bUserId) return false;
  const row = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerUserId: aUserId, blockedUserId: bUserId },
        { blockerUserId: bUserId, blockedUserId: aUserId },
      ],
    },
  });
  return !!row;
}

/** آیدی‌هایی که نباید در لیست viewer بیایند (بلاک‌شده‌ها + کسانی که او را بلاک کرده‌اند) */
export async function excludedUserIds(viewerId: number): Promise<number[]> {
  const rows = await prisma.userBlock.findMany({
    where: {
      OR: [{ blockerUserId: viewerId }, { blockedUserId: viewerId }],
    },
    select: { blockerUserId: true, blockedUserId: true },
  });
  const ids = new Set<number>();
  for (const r of rows) {
    if (r.blockerUserId !== viewerId) ids.add(r.blockerUserId);
    if (r.blockedUserId !== viewerId) ids.add(r.blockedUserId);
  }
  return [...ids];
}

export async function blockUser(
  blockerUserId: number,
  blockedUserId: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (blockerUserId === blockedUserId) {
    return { ok: false, reason: "self" };
  }
  const target = await prisma.user.findUnique({ where: { id: blockedUserId } });
  if (!target || target.deletedAt) {
    return { ok: false, reason: "missing" };
  }

  await prisma.userBlock.upsert({
    where: {
      blockerUserId_blockedUserId: { blockerUserId, blockedUserId },
    },
    create: { blockerUserId, blockedUserId },
    update: {},
  });

  // از مخاطبین دو طرف حذف شود
  await prisma.contact.deleteMany({
    where: {
      OR: [
        { ownerUserId: blockerUserId, contactUserId: blockedUserId },
        { ownerUserId: blockedUserId, contactUserId: blockerUserId },
      ],
    },
  });

  // درخواست چت pending بین این دو لغو شود
  await prisma.chatRequest.updateMany({
    where: {
      status: "pending",
      OR: [
        { fromUserId: blockerUserId, toUserId: blockedUserId },
        { fromUserId: blockedUserId, toUserId: blockerUserId },
      ],
    },
    data: { status: "cancelled" },
  });

  return { ok: true };
}

export async function unblockUser(
  blockerUserId: number,
  blockedUserId: number,
): Promise<boolean> {
  const res = await prisma.userBlock.deleteMany({
    where: { blockerUserId, blockedUserId },
  });
  return res.count > 0;
}

export async function listBlockedUsers(blockerUserId: number) {
  return prisma.userBlock.findMany({
    where: { blockerUserId },
    orderBy: { createdAt: "desc" },
    include: {
      blocked: {
        select: {
          id: true,
          userCode: true,
          displayName: true,
          age: true,
          gender: true,
          deletedAt: true,
        },
      },
    },
    take: 50,
  });
}
