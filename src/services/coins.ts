import { prisma } from "../db/prisma.js";

/**
 * Atomic debit — never goes negative even under concurrent clicks.
 * @returns true if coins were deducted
 */
export async function debitCoins(
  userId: number,
  amount: number,
): Promise<boolean> {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const result = await prisma.user.updateMany({
    where: { id: userId, diamonds: { gte: amount }, deletedAt: null },
    data: { diamonds: { decrement: amount } },
  });
  return result.count === 1;
}

/** Credit coins (admin gifts, rewards, transfers in) */
export async function creditCoins(
  userId: number,
  amount: number,
): Promise<boolean> {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const result = await prisma.user.updateMany({
    where: { id: userId, deletedAt: null },
    data: { diamonds: { increment: amount } },
  });
  return result.count === 1;
}

/**
 * Transfer coins A→B atomically (debit then credit; rollback credit on debit fail is N/A —
 * uses a transaction so either both succeed or neither).
 */
export async function transferCoins(
  fromUserId: number,
  toUserId: number,
  amount: number,
): Promise<boolean> {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  if (fromUserId === toUserId) return false;

  return prisma.$transaction(async (tx) => {
    const debited = await tx.user.updateMany({
      where: {
        id: fromUserId,
        diamonds: { gte: amount },
        deletedAt: null,
      },
      data: { diamonds: { decrement: amount } },
    });
    if (debited.count !== 1) return false;
    await tx.user.update({
      where: { id: toUserId },
      data: { diamonds: { increment: amount } },
    });
    return true;
  });
}
