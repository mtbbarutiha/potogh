import type { Api } from "grammy";
import { prisma } from "../db/prisma.js";
import { langOf, tr, normalizeLang, type Lang } from "../i18n/index.js";
import { isBlockedEither } from "./block.js";
import { logger } from "../lib/logger.js";

/** کول‌داون همان viewer→viewee تا پیام بازدید اسپم نشود */
export const PROFILE_VIEW_NOTIFY_COOLDOWN_MS = 15 * 60 * 1000;

const recent = new Map<string, number>();

setInterval(() => {
  const cutoff = Date.now() - PROFILE_VIEW_NOTIFY_COOLDOWN_MS;
  for (const [k, at] of recent) {
    if (at <= cutoff) recent.delete(k);
  }
}, 60_000).unref?.();

function pairKey(viewerId: number, vieweeId: number): string {
  return `${viewerId}:${vieweeId}`;
}

export function profileViewNotifyText(
  displayName: string,
  userCode: string,
  lang: Lang | string | null = "fa",
): string {
  const L = normalizeLang(lang);
  return tr(
    L,
    `👁 کاربر ${displayName} با آیدی /user_${userCode} پروفایل شما را مشاهده کرد.`,
    `👁 User ${displayName} with ID /user_${userCode} viewed your profile.`,
  );
}

/** نمایش پروفایل نباید به‌خاطر نوتیف بشکند */
export function notifyProfileViewSafe(
  api: Api,
  viewerId: number,
  vieweeId: number,
): void {
  void notifyProfileView(api, viewerId, vieweeId).catch((err) => {
    logger.warn("profileView.notify.fail", {
      viewerId,
      vieweeId,
      err: err instanceof Error ? err.message : String(err),
    });
  });
}

/**
 * اگر کاربر دیگری پروفایل را باز کرد، به صاحب پروفایل خبر بده.
 * رایگان — بدون کسر سکه. کول‌داون حافظه + DB.
 */
export async function notifyProfileView(
  api: Api,
  viewerId: number,
  vieweeId: number,
): Promise<boolean> {
  if (!Number.isFinite(viewerId) || !Number.isFinite(vieweeId)) return false;
  if (viewerId === vieweeId) return false;

  const key = pairKey(viewerId, vieweeId);
  const now = Date.now();
  const lastMem = recent.get(key);
  if (lastMem != null && now - lastMem < PROFILE_VIEW_NOTIFY_COOLDOWN_MS) {
    return false;
  }

  const [viewer, viewee, blocked] = await Promise.all([
    prisma.user.findUnique({
      where: { id: viewerId },
      select: {
        id: true,
        displayName: true,
        userCode: true,
        deletedAt: true,
        telegramId: true,
        registered: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: vieweeId },
      select: {
        id: true,
        telegramId: true,
        language: true,
        deletedAt: true,
        registered: true,
      },
    }),
    isBlockedEither(viewerId, vieweeId),
  ]);

  if (!viewer || viewer.deletedAt || !viewer.registered) return false;
  if (!viewee || viewee.deletedAt || !viewee.registered) return false;
  if (viewer.telegramId >= 9000000000n) return false;
  if (viewee.telegramId >= 9000000000n) return false;
  if (blocked) return false;

  const cutoff = new Date(now - PROFILE_VIEW_NOTIFY_COOLDOWN_MS);
  let claimed = false;
  try {
    const updated = await prisma.profileViewNotify.updateMany({
      where: {
        viewerId,
        vieweeId,
        lastSentAt: { lt: cutoff },
      },
      data: { lastSentAt: new Date() },
    });
    if (updated.count === 1) {
      claimed = true;
    } else {
      await prisma.profileViewNotify.create({
        data: { viewerId, vieweeId },
      });
      claimed = true;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/Unique constraint|unique/i.test(msg)) {
      recent.set(key, now);
      return false;
    }
    throw err;
  }

  if (!claimed) return false;
  recent.set(key, Date.now());

  const { ensureUserCode } = await import("../db/users.js");
  const code = await ensureUserCode(viewer.id, viewer.userCode);
  if (!code) return false;

  const lang = langOf(viewee);
  const name =
    viewer.displayName?.trim() || tr(lang, "یک کاربر", "a user");

  await api.sendMessage(
    Number(viewee.telegramId),
    profileViewNotifyText(name, code, lang),
  );
  return true;
}
