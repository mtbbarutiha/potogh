import { randomBytes } from "node:crypto";
import { prisma } from "../db/prisma.js";

const VOUCHER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type VoucherDraft = {
  coinAmount?: number;
  maxUses?: number;
  /** ISO string or null = بدون انقضا */
  expiresAt?: string | null;
  code?: string;
  note?: string;
};

export function normalizeVoucherCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function generateVoucherCode(len = 8): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += VOUCHER_ALPHABET[bytes[i]! % VOUCHER_ALPHABET.length];
  }
  return out;
}

export function parseVoucherDraft(raw: string | null | undefined): VoucherDraft {
  if (!raw || !raw.startsWith("vd:")) return {};
  try {
    return JSON.parse(raw.slice(3)) as VoucherDraft;
  } catch {
    return {};
  }
}

export function serializeVoucherDraft(draft: VoucherDraft): string {
  return `vd:${JSON.stringify(draft)}`;
}

export function isVoucherExpired(
  expiresAt: Date | null | undefined,
  now = new Date(),
): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() <= now.getTime();
}

export function voucherRemainingUses(v: {
  maxUses: number;
  currentUses: number;
}): number {
  return Math.max(0, v.maxUses - v.currentUses);
}

export async function createVoucher(input: {
  code: string;
  coinAmount: number;
  maxUses: number;
  expiresAt?: Date | null;
  note?: string | null;
  createdById?: number | null;
}) {
  const code = normalizeVoucherCode(input.code);
  if (code.length < 4 || code.length > 32) {
    throw new Error("invalid_code_length");
  }
  if (input.coinAmount <= 0 || input.coinAmount > 1_000_000) {
    throw new Error("invalid_coin_amount");
  }
  if (input.maxUses <= 0 || input.maxUses > 1_000_000) {
    throw new Error("invalid_max_uses");
  }
  return prisma.voucherCode.create({
    data: {
      code,
      coinAmount: input.coinAmount,
      maxUses: input.maxUses,
      expiresAt: input.expiresAt ?? null,
      note: input.note ?? null,
      createdById: input.createdById ?? null,
    },
  });
}

export async function listVouchers(limit = 20) {
  return prisma.voucherCode.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function deactivateVoucher(id: number) {
  return prisma.voucherCode.update({
    where: { id },
    data: { isActive: false },
  });
}

export type RedeemVoucherResult =
  | { ok: true; amount: number; balance: number; code: string }
  | {
      ok: false;
      reason:
        | "invalid"
        | "not_found"
        | "inactive"
        | "expired"
        | "exhausted"
        | "already_used"
        | "no_user";
    };

export async function redeemVoucher(
  userId: number,
  rawCode: string,
): Promise<RedeemVoucherResult> {
  const code = normalizeVoucherCode(rawCode);
  if (!code || code.length < 4) return { ok: false, reason: "invalid" };

  return prisma.$transaction(async (tx) => {
    const voucher = await tx.voucherCode.findUnique({ where: { code } });
    if (!voucher) return { ok: false, reason: "not_found" };
    if (!voucher.isActive) return { ok: false, reason: "inactive" };
    if (isVoucherExpired(voucher.expiresAt)) {
      return { ok: false, reason: "expired" };
    }
    if (voucher.currentUses >= voucher.maxUses) {
      return { ok: false, reason: "exhausted" };
    }

    const bumped = await tx.voucherCode.updateMany({
      where: {
        id: voucher.id,
        isActive: true,
        currentUses: { lt: voucher.maxUses },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      data: { currentUses: { increment: 1 } },
    });
    if (bumped.count !== 1) {
      const fresh = await tx.voucherCode.findUnique({ where: { id: voucher.id } });
      if (!fresh) return { ok: false, reason: "not_found" };
      if (!fresh.isActive) return { ok: false, reason: "inactive" };
      if (isVoucherExpired(fresh.expiresAt)) return { ok: false, reason: "expired" };
      return { ok: false, reason: "exhausted" };
    }

    try {
      await tx.voucherRedemption.create({
        data: { voucherId: voucher.id, userId },
      });
    } catch {
      return { ok: false, reason: "already_used" };
    }

    const updated = await tx.user.updateMany({
      where: { id: userId, deletedAt: null },
      data: { diamonds: { increment: voucher.coinAmount } },
    });
    if (updated.count !== 1) return { ok: false, reason: "no_user" };

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { diamonds: true },
    });
    return {
      ok: true,
      amount: voucher.coinAmount,
      balance: user?.diamonds ?? 0,
      code: voucher.code,
    };
  });
}
