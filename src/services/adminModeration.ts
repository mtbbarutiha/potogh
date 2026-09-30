import { InlineKeyboard } from "grammy";
import type { Api } from "grammy";
import type { User } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { describeTarget } from "./adminCoins.js";

export function adminModerationCancelKeyboard(kind: "clearphoto" | "ban" | "unban") {
  return new InlineKeyboard()
    .text("❌ انصراف", `adm:${kind}:cancel`)
    .danger()
    .row()
    .text("↩️ پنل ادمین", "adm:home")
    .primary();
}

export function clearPhotoConfirmKeyboard(targetId: number) {
  return new InlineKeyboard()
    .text("🗑 بله، عکس پاک شود", `adm:clearphoto:ok:${targetId}`)
    .danger()
    .row()
    .text("❌ انصراف", "adm:clearphoto:cancel")
    .row()
    .text("↩️ پنل ادمین", "adm:home");
}

export function banConfirmKeyboard(targetId: number) {
  return new InlineKeyboard()
    .text("🚫 بله، مسدود شود", `adm:ban:ok:${targetId}`)
    .danger()
    .row()
    .text("❌ انصراف", "adm:ban:cancel")
    .row()
    .text("↩️ پنل ادمین", "adm:home");
}

export function unbanConfirmKeyboard(targetId: number) {
  return new InlineKeyboard()
    .text("✅ بله، رفع مسدودیت", `adm:unban:ok:${targetId}`)
    .success()
    .row()
    .text("❌ انصراف", "adm:unban:cancel")
    .row()
    .text("↩️ پنل ادمین", "adm:home");
}

/** پاک کردن عکس پروفایل (+ ریست احراز چهره چون به عکس وابسته است) */
export async function clearUserPhotoByAdmin(targetId: number) {
  return prisma.user.update({
    where: { id: targetId },
    data: {
      photoFileId: null,
      photoPendingFileId: null,
      photoStatus: "none",
      faceVerified: false,
      facePendingFileId: null,
      facePendingKind: null,
      faceStatus: "none",
      faceVerifyScore: null,
      faceVerifyMethod: null,
      faceVerifiedAt: null,
    },
  });
}

export async function banUserByAdmin(targetId: number) {
  return prisma.user.update({
    where: { id: targetId },
    data: {
      bannedAt: new Date(),
      isActive: false,
      state: "banned",
      chatPartnerId: null,
      pendingAnonTo: null,
      pendingDirectTo: null,
      pendingSellCard: null,
      pendingReportOther: null,
    },
  });
}

export async function unbanUserByAdmin(targetId: number) {
  return prisma.user.update({
    where: { id: targetId },
    data: {
      bannedAt: null,
      isActive: true,
      state: "idle",
    },
  });
}

export async function notifyTargetSafe(
  api: Api,
  target: User,
  text: string,
) {
  if (target.telegramId >= 9000000000n) return;
  try {
    await api.sendMessage(Number(target.telegramId), text);
  } catch {
    /* blocked / deactivated */
  }
}

export async function confirmClearPhotoText(target: User) {
  return [
    "⚠️ تأیید حذف عکس کاربر",
    "",
    await describeTarget(target),
    "",
    `وضعیت عکس: ${target.photoStatus}`,
    target.photoFileId ? "عکس تأییدشده: دارد" : "عکس تأییدشده: ندارد",
    target.photoPendingFileId ? "عکس pending: دارد" : "عکس pending: ندارد",
    target.faceVerified ? "احراز چهره: ✅ (هم پاک می‌شود)" : "احراز چهره: ندارد",
    "",
    "با تأیید، عکس و احراز چهره پاک می‌شود و کاربر با عکس پیش‌فرض دیده می‌شود.",
  ].join("\n");
}

export async function confirmBanText(target: User) {
  return [
    "⚠️ تأیید مسدود کردن کاربر از ربات",
    "",
    await describeTarget(target),
    "",
    target.bannedAt
      ? `⚠️ این کاربر از قبل مسدود است (${target.bannedAt.toLocaleString("fa-IR")})`
      : "این کاربر الان مسدود نیست.",
    "",
    "بعد از مسدود شدن دیگر نمی‌تواند از ربات استفاده کند.",
  ].join("\n");
}

export async function confirmUnbanText(target: User) {
  return [
    "⚠️ تأیید رفع مسدودیت کاربر",
    "",
    await describeTarget(target),
    "",
    target.bannedAt
      ? `مسدود از: ${target.bannedAt.toLocaleString("fa-IR")}`
      : "این کاربر مسدود نیست.",
  ].join("\n");
}
