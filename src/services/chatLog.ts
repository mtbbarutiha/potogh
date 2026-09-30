import type { Api } from "grammy";
import { prisma } from "../db/prisma.js";
import { wipeRelayStatuses } from "./messageStatus.js";

/** ثبت message_id برای پاک‌سازی بعدی گفتگو */
export async function logChatMessage(
  ownerUserId: number,
  partnerUserId: number,
  telegramChatId: number | bigint,
  messageId: number,
) {
  try {
    await prisma.chatMsgLog.create({
      data: {
        ownerUserId,
        partnerUserId,
        telegramChatId: BigInt(telegramChatId),
        messageId,
      },
    });
  } catch (err) {
    console.error("logChatMessage failed", err);
  }
}

export async function logPairMessages(opts: {
  aUserId: number;
  bUserId: number;
  aChatId: number | bigint;
  bChatId: number | bigint;
  aMessageId: number;
  bMessageId: number;
}) {
  await prisma.chatMsgLog.createMany({
    data: [
      {
        ownerUserId: opts.aUserId,
        partnerUserId: opts.bUserId,
        telegramChatId: BigInt(opts.aChatId),
        messageId: opts.aMessageId,
      },
      {
        ownerUserId: opts.bUserId,
        partnerUserId: opts.aUserId,
        telegramChatId: BigInt(opts.bChatId),
        messageId: opts.bMessageId,
      },
    ],
  });
}

async function deleteLoggedRows(
  api: Api,
  rows: { telegramChatId: bigint; messageId: number }[],
): Promise<number> {
  let deleted = 0;
  // دسته‌ای تا ۱۰۰تایی
  const byChat = new Map<string, number[]>();
  for (const row of rows) {
    const key = String(row.telegramChatId);
    const list = byChat.get(key) ?? [];
    list.push(row.messageId);
    byChat.set(key, list);
  }
  for (const [chatId, ids] of byChat) {
    const unique = [...new Set(ids)];
    for (let i = 0; i < unique.length; i += 100) {
      const chunk = unique.slice(i, i + 100);
      try {
        await api.deleteMessages(Number(chatId), chunk);
        deleted += chunk.length;
      } catch {
        for (const mid of chunk) {
          try {
            await api.deleteMessage(Number(chatId), mid);
            deleted++;
          } catch {
            /* too old / already gone / user message in private */
          }
        }
      }
    }
  }
  return deleted;
}

/** حذف پیام‌های ثبت‌شده یک طرف با یک پارتنر */
export async function wipeChatWithPartner(
  api: Api,
  userId: number,
  partnerUserId: number,
): Promise<number> {
  const rows = await prisma.chatMsgLog.findMany({
    where: { ownerUserId: userId, partnerUserId },
    orderBy: { id: "asc" },
    take: 2000,
  });
  const deleted = await deleteLoggedRows(api, rows);
  await wipeRelayStatuses(userId, partnerUserId);
  await prisma.chatMsgLog.deleteMany({
    where: { ownerUserId: userId, partnerUserId },
  });
  return deleted;
}

/**
 * پاک‌سازی کامل گفتگو برای هر دو طرف
 * (پیام‌های ربات + تلاش برای پیام‌های کاربر؛ در چت خصوصی تلگرام
 *  بعضی پیام‌های خود کاربر ممکن است حذف نشوند)
 */
export async function wipeChatBothSides(
  api: Api,
  userAId: number,
  userBId: number,
): Promise<{ a: number; b: number }> {
  const [a, b] = await Promise.all([
    wipeChatWithPartner(api, userAId, userBId),
    wipeChatWithPartner(api, userBId, userAId),
  ]);
  return { a, b };
}
