import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { InputFile } from "grammy";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULTS_DIR = path.resolve(__dirname, "../../assets/defaults");

/** مسیر فایل پیش‌فرض؛ اگر فایل اصلی نباشد، اولین جایگزین موجود برمی‌گردد. */
export function defaultAvatarPath(gender: string | null | undefined): string {
  const preferred =
    gender === "female"
      ? "female.jpg"
      : gender === "male"
        ? "male.jpg"
        : "anon.jpg";
  const candidates = [preferred, "anon.jpg", "male.jpg", "female.jpg"];
  for (const name of candidates) {
    const p = path.join(DEFAULTS_DIR, name);
    if (fs.existsSync(p)) return p;
  }
  return path.join(DEFAULTS_DIR, preferred);
}

type PhotoUser = {
  gender?: string | null;
  photoFileId?: string | null;
  photoPendingFileId?: string | null;
  photoStatus?: string | null;
};

/** عکس عمومی: فقط تأییدشده؛ وگرنه پیش‌فرض */
export function publicPhotoInput(user: PhotoUser): string | InputFile {
  if (user.photoStatus === "approved" && user.photoFileId) {
    return user.photoFileId;
  }
  return new InputFile(defaultAvatarPath(user.gender));
}

/**
 * عکس پروفایل خود کاربر:
 * تأییدشده → همان | در انتظار → عکس pending | وگرنه پیش‌فرض
 */
export function ownPhotoInput(user: PhotoUser): string | InputFile {
  if (user.photoStatus === "approved" && user.photoFileId) {
    return user.photoFileId;
  }
  if (user.photoStatus === "pending" && user.photoPendingFileId) {
    return user.photoPendingFileId;
  }
  return new InputFile(defaultAvatarPath(user.gender));
}

export function photoStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "pending":
      return "⏳ در انتظار تأیید ادمین";
    case "approved":
      return "✅ تأیید شده";
    case "rejected":
      return "❌ رد شده — دوباره بفرست";
    default:
      return "🖼️ عکس پیش‌فرض";
  }
}
