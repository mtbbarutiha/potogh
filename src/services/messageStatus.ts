import { prisma } from "../db/prisma.js";

/** پاک‌سازی ردیف‌های وضعیت هنگام wipe چت */
export async function wipeRelayStatuses(
  userId: number,
  partnerUserId: number,
): Promise<void> {
  await prisma.chatRelayStatus.deleteMany({
    where: {
      OR: [
        { senderUserId: userId, partnerUserId },
        { senderUserId: partnerUserId, partnerUserId: userId },
      ],
    },
  });
}
