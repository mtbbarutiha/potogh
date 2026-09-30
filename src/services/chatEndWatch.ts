import type { Api } from "grammy";
import { prisma } from "../db/prisma.js";
import { formatNum } from "../data/packages.js";
import { langOf, tr, normalizeLang, type Lang } from "../i18n/index.js";

export const CHAT_END_WATCH_COST = 1;

export type ActivateChatEndWatchResult =
  | "ok"
  | "self"
  | "not_found"
  | "blocked"
  | "not_in_chat"
  | "already"
  | "insufficient";

function targetInChat(target: {
  state: string;
  chatPartnerId: number | null;
}): boolean {
  if (target.chatPartnerId == null) return false;
  return target.state === "chatting" || target.state === "await_direct_msg";
}

/** آیا کاربر الان در چت است (برای نمایش دکمه / اعتبارسنجی) */
export async function isUserInChat(userId: number): Promise<boolean> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { state: true, chatPartnerId: true, deletedAt: true },
  });
  if (!u || u.deletedAt) return false;
  return targetInChat(u);
}

/**
 * فعال‌سازی اطلاع پایان چت — اتمیک کسر ۱ سکه + ثبت watch.
 * اگر هدف در چت نباشد، سکه کم نمی‌شود.
 */
export async function activateChatEndWatch(
  watcherId: number,
  targetId: number,
): Promise<ActivateChatEndWatchResult> {
  if (watcherId === targetId) return "self";

  const [watcher, target, blockEither] = await Promise.all([
    prisma.user.findUnique({
      where: { id: watcherId },
      select: { id: true, diamonds: true, deletedAt: true },
    }),
    prisma.user.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        state: true,
        chatPartnerId: true,
        deletedAt: true,
        telegramId: true,
      },
    }),
    prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerUserId: watcherId, blockedUserId: targetId },
          { blockerUserId: targetId, blockedUserId: watcherId },
        ],
      },
      select: { id: true },
    }),
  ]);

  if (!watcher || watcher.deletedAt) return "not_found";
  if (!target || target.deletedAt) return "not_found";
  if (blockEither) return "blocked";
  if (!targetInChat(target)) return "not_in_chat";

  const existing = await prisma.chatEndWatch.findFirst({
    where: { watcherId, targetId, consumedAt: null },
    select: { id: true },
  });
  if (existing) return "already";

  try {
    const created = await prisma.$transaction(async (tx) => {
      const again = await tx.chatEndWatch.findFirst({
        where: { watcherId, targetId, consumedAt: null },
        select: { id: true },
      });
      if (again) return "already" as const;

      const stillInChat = await tx.user.findUnique({
        where: { id: targetId },
        select: { state: true, chatPartnerId: true, deletedAt: true },
      });
      if (!stillInChat || stillInChat.deletedAt || !targetInChat(stillInChat)) {
        return "not_in_chat" as const;
      }

      const debited = await tx.user.updateMany({
        where: {
          id: watcherId,
          diamonds: { gte: CHAT_END_WATCH_COST },
          deletedAt: null,
        },
        data: { diamonds: { decrement: CHAT_END_WATCH_COST } },
      });
      if (debited.count !== 1) return "insufficient" as const;

      await tx.chatEndWatch.create({
        data: { watcherId, targetId },
      });
      return "ok" as const;
    });
    return created;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/Unique constraint|unique/i.test(msg)) return "already";
    throw err;
  }
}

function watchNotifyText(
  targetName: string,
  lang: Lang | string | null,
): string {
  const L = normalizeLang(lang);
  return tr(
    L,
    [
      "🔔 اطلاع پایان چت",
      "",
      `چت «${targetName}» تمام شد.`,
      "الان می‌تونی دوباره درخواست چت بدی یا پیام دایرکت بفرستی.",
    ].join("\n"),
    [
      "🔔 Chat ended notice",
      "",
      `«${targetName}»'s chat has ended.`,
      "You can send a chat request or DM again now.",
    ].join("\n"),
  );
}

/**
 * همهٔ ناظران فعال هدف را یک‌بار مطلع کن و watch را مصرف کن.
 * امن برای فراخوانی تکراری (idempotent روی consumedAt).
 */
export async function notifyChatEndWatchers(
  api: Api,
  targetUserId: number,
): Promise<number> {
  const active = await prisma.chatEndWatch.findMany({
    where: { targetId: targetUserId, consumedAt: null },
    include: {
      watcher: {
        select: {
          id: true,
          telegramId: true,
          language: true,
          deletedAt: true,
        },
      },
      target: {
        select: { displayName: true },
      },
    },
  });
  if (active.length === 0) return 0;

  const ids = active.map((w) => w.id);
  const now = new Date();
  await prisma.chatEndWatch.updateMany({
    where: { id: { in: ids }, consumedAt: null },
    data: { consumedAt: now },
  });

  const targetName = active[0]?.target.displayName ?? "کاربر";
  let sent = 0;
  for (const watch of active) {
    const w = watch.watcher;
    if (!w || w.deletedAt) continue;
    if (w.telegramId >= 9000000000n) continue;
    try {
      await api.sendMessage(
        Number(w.telegramId),
        watchNotifyText(targetName, langOf(w)),
      );
      sent++;
    } catch (err) {
      console.error("chatEndWatch notify failed", w.id, err);
    }
  }
  return sent;
}

/** متن تأیید فعال‌سازی */
export function chatEndWatchConfirmText(
  targetName: string,
  balance: number,
  lang: Lang | string | null = "fa",
): string {
  const L = normalizeLang(lang);
  return tr(
    L,
    [
      `🔔 به محض تموم شدن چت «${targetName}» بهت اطلاع می‌دیم.`,
      "",
      `هزینه: ${formatNum(CHAT_END_WATCH_COST)} سکه`,
      `موجودی: ${formatNum(balance)} سکه`,
      "",
      "تأیید می‌کنی؟",
    ].join("\n"),
    [
      `🔔 We'll notify you when «${targetName}»'s chat ends.`,
      "",
      `Cost: ${formatNum(CHAT_END_WATCH_COST)} coin`,
      `Balance: ${formatNum(balance)} coins`,
      "",
      "Confirm?",
    ].join("\n"),
  );
}
