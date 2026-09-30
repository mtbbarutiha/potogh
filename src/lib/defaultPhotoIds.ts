import { InputFile } from "grammy";
import type { Api } from "grammy";
import { defaultAvatarPath } from "./avatars.js";

const cache = new Map<string, string>();

function genderKey(gender: string | null | undefined): string {
  if (gender === "female") return "female";
  if (gender === "male") return "male";
  return "anon";
}

/** file_id پیش‌فرض دختر/پسر برای اینلاین — یک‌بار آپلود، بعد از کش */
export async function defaultPhotoFileId(
  api: Api,
  gender: string | null | undefined,
): Promise<string> {
  const key = genderKey(gender);
  const hit = cache.get(key);
  if (hit) return hit;

  const adminRaw = process.env.ADMIN_IDS ?? "";
  const adminId = Number(adminRaw.split(",")[0]?.trim());
  if (!Number.isFinite(adminId) || adminId <= 0) {
    throw new Error("ADMIN_IDS required for default photo upload");
  }

  const sent = await api.sendPhoto(
    adminId,
    new InputFile(defaultAvatarPath(gender), `${key}.jpg`),
  );
  const fileId = sent.photo?.at(-1)?.file_id;
  if (!fileId) throw new Error("default photo upload failed");
  await api.deleteMessage(adminId, sent.message_id).catch(() => undefined);
  cache.set(key, fileId);
  return fileId;
}
