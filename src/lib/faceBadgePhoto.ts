import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { InputFile } from "grammy";
import type { Api } from "grammy";
import type { Message } from "grammy/types";
import { defaultAvatarPath } from "./avatars.js";
import { fetchWithTimeout } from "./timeout.js";

/** محدودیت موازی sharp — روی CPU ضعیف مهم است */
sharp.concurrency(3);

export type FaceBadgeKind = "verified" | "unverified" | "pending";

type PhotoUser = {
  gender?: string | null;
  photoFileId?: string | null;
  photoPendingFileId?: string | null;
  photoStatus?: string | null;
  faceVerified?: boolean | null;
  faceStatus?: string | null;
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BADGE_DIR = path.resolve(HERE, "../../assets/badges");

/** پترن رسمی «بدون عکس» برای لیست‌ها */
export function noPhotoPatternPath(): string {
  return path.join(BADGE_DIR, "no-photo.png");
}

const badgeCache = new Map<FaceBadgeKind, Buffer>();
let noPhotoBuf: Buffer | null = null;

/** file_id تلگرام بعد از اولین آپلود — ارسال بعدی بدون پردازش */
const telegramFileIdCache = new Map<string, { fileId: string; at: number }>();
const FILE_ID_TTL_MS = 7 * 24 * 60 * 60_000;

/** بافر خام دانلودشده از تلگرام */
const rawDownloadCache = new Map<string, { buf: Buffer; at: number }>();
const RAW_TTL_MS = 30 * 60_000;
const RAW_MAX = 200;

/** بافر thumbnail پردازش‌شده */
const thumbBufCache = new Map<string, { buf: Buffer; at: number }>();
const THUMB_TTL_MS = 60 * 60_000;
const THUMB_MAX = 400;

async function loadNoPhotoPng(): Promise<Buffer> {
  if (noPhotoBuf) return noPhotoBuf;
  noPhotoBuf = await fs.readFile(noPhotoPatternPath());
  return noPhotoBuf;
}

async function loadBadgePng(kind: FaceBadgeKind): Promise<Buffer> {
  const cached = badgeCache.get(kind);
  if (cached) return cached;
  const file =
    kind === "verified"
      ? "verified.png"
      : kind === "pending"
        ? "pending.png"
        : "unverified.png";
  const buf = await fs.readFile(path.join(BADGE_DIR, file));
  badgeCache.set(kind, buf);
  return buf;
}

function trimMap<V extends { at: number }>(
  map: Map<string, V>,
  max: number,
) {
  if (map.size <= max) return;
  const entries = [...map.entries()].sort((a, b) => a[1].at - b[1].at);
  const drop = map.size - max;
  for (let i = 0; i < drop; i++) map.delete(entries[i]![0]);
}

export function cachedTelegramFileId(key: string): string | null {
  const hit = telegramFileIdCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > FILE_ID_TTL_MS) {
    telegramFileIdCache.delete(key);
    return null;
  }
  return hit.fileId;
}

export function rememberTelegramFileId(key: string, fileId: string) {
  telegramFileIdCache.set(key, { fileId, at: Date.now() });
  trimMap(telegramFileIdCache, 500);
}

/** از پیام sendPhoto، بزرگ‌ترین file_id را کش کن */
export function rememberPhotoFromMessage(
  key: string | null | undefined,
  msg: Message | undefined,
) {
  if (!key || !msg?.photo?.length) return;
  const best = msg.photo[msg.photo.length - 1];
  if (best?.file_id) rememberTelegramFileId(key, best.file_id);
}

export function faceBadgeKind(
  user: {
    faceVerified?: boolean | null;
    faceStatus?: string | null;
  },
  forSelf = false,
): FaceBadgeKind {
  if (user.faceVerified) return "verified";
  if (forSelf && user.faceStatus === "pending") return "pending";
  return "unverified";
}

export function faceBadgeEmoji(kind: FaceBadgeKind): string {
  if (kind === "verified") return "🛡️✅";
  if (kind === "pending") return "🛡️⏳";
  return "🛡️❕";
}

export function faceBadgeLabel(kind: FaceBadgeKind, lang: "fa" | "en" = "fa"): string {
  if (lang === "en") {
    if (kind === "verified") return "Verified";
    if (kind === "pending") return "Pending verification";
    return "Not verified";
  }
  if (kind === "verified") return "احراز هویت شده";
  if (kind === "pending") return "در انتظار احراز";
  return "احراز هویت نشده";
}

/**
 * overlay سریع: اول کوچک می‌کند، بعد یک‌بار badge می‌زند.
 */
export async function overlayFaceBadge(
  image: Buffer,
  kind: FaceBadgeKind,
  maxSide = 1280,
): Promise<Buffer> {
  const base = sharp(image).rotate().resize({
    width: maxSide,
    height: maxSide,
    fit: "inside",
    withoutEnlargement: true,
  });
  const meta = await base.metadata();
  const w = meta.width ?? 512;
  const h = meta.height ?? 512;
  const badgeSize = Math.max(40, Math.round(Math.min(w, h) * 0.2));
  const margin = Math.max(6, Math.round(Math.min(w, h) * 0.02));

  const badge = await sharp(await loadBadgePng(kind))
    .resize(badgeSize, badgeSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  return base
    .composite([
      {
        input: badge,
        top: margin,
        left: Math.max(0, w - badgeSize - margin),
        blend: "over",
      },
    ])
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

const downloadInflight = new Map<string, Promise<Buffer>>();

async function downloadTelegramFile(api: Api, fileId: string): Promise<Buffer> {
  const hit = rawDownloadCache.get(fileId);
  if (hit && Date.now() - hit.at < RAW_TTL_MS) return hit.buf;

  const inflight = downloadInflight.get(fileId);
  if (inflight) return inflight;

  const task = (async () => {
    const file = await api.getFile(fileId);
    if (!file.file_path) throw new Error("file_path missing");
    const url = `https://api.telegram.org/file/bot${api.token}/${file.file_path}`;
    const res = await fetchWithTimeout(url, undefined, 10_000);
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    rawDownloadCache.set(fileId, { buf, at: Date.now() });
    trimMap(rawDownloadCache, RAW_MAX);
    return buf;
  })().finally(() => downloadInflight.delete(fileId));

  downloadInflight.set(fileId, task);
  return task;
}

async function loadUserPhotoBuffer(
  api: Api,
  user: PhotoUser,
  mode: "public" | "own",
): Promise<Buffer> {
  if (user.photoStatus === "approved" && user.photoFileId) {
    return downloadTelegramFile(api, user.photoFileId);
  }
  if (
    mode === "own" &&
    user.photoStatus === "pending" &&
    user.photoPendingFileId
  ) {
    return downloadTelegramFile(api, user.photoPendingFileId);
  }
  return fs.readFile(defaultAvatarPath(user.gender));
}

function defaultCacheKey(gender: string | null | undefined): string {
  if (gender === "female") return "default:female";
  if (gender === "male") return "default:male";
  return "default:anon";
}

function badgePhotoCacheKey(
  sourceId: string,
  kind: FaceBadgeKind,
): string {
  return `badge:${sourceId}:${kind}`;
}

/**
 * عکس پروفایل با بج احراز روی تصویر.
 * نتیجهٔ پردازش‌شده با file_id تلگرام کش می‌شود تا دوباره sharp نزند.
 */
export async function publicPhotoWithBadge(
  api: Api,
  user: PhotoUser,
): Promise<string | InputFile> {
  const kind = faceBadgeKind(user, false);
  const sourceId =
    user.photoStatus === "approved" && user.photoFileId
      ? user.photoFileId
      : defaultCacheKey(user.gender);
  const cacheKey = badgePhotoCacheKey(sourceId, kind);
  const cached = cachedTelegramFileId(cacheKey);
  if (cached) return cached;

  try {
    const raw = await loadUserPhotoBuffer(api, user, "public");
    const out = await overlayFaceBadge(raw, kind);
    return new InputFile(out, "profile.jpg");
  } catch (err) {
    console.error("publicPhotoWithBadge overlay failed", err);
    if (user.photoStatus === "approved" && user.photoFileId) {
      return user.photoFileId;
    }
    const buf = await defaultGenderThumbBuffer(user.gender, 512);
    return new InputFile(buf, "default.jpg");
  }
}

export function publicPhotoCacheKey(user: PhotoUser): string {
  const kind = faceBadgeKind(user, false);
  const sourceId =
    user.photoStatus === "approved" && user.photoFileId
      ? user.photoFileId
      : defaultCacheKey(user.gender);
  return badgePhotoCacheKey(sourceId, kind);
}

export async function ownPhotoWithBadge(
  api: Api,
  user: PhotoUser,
): Promise<string | InputFile> {
  const kind = faceBadgeKind(user, true);
  let sourceId: string;
  if (user.photoStatus === "approved" && user.photoFileId) {
    sourceId = user.photoFileId;
  } else if (user.photoStatus === "pending" && user.photoPendingFileId) {
    sourceId = user.photoPendingFileId;
  } else {
    sourceId = defaultCacheKey(user.gender);
  }
  const cacheKey = badgePhotoCacheKey(sourceId, kind);
  const cached = cachedTelegramFileId(cacheKey);
  if (cached) return cached;

  try {
    const raw = await loadUserPhotoBuffer(api, user, "own");
    const out = await overlayFaceBadge(raw, kind);
    return new InputFile(out, "profile.jpg");
  } catch (err) {
    console.error("ownPhotoWithBadge overlay failed", err);
    if (user.photoStatus === "approved" && user.photoFileId) {
      return user.photoFileId;
    }
    if (user.photoStatus === "pending" && user.photoPendingFileId) {
      return user.photoPendingFileId;
    }
    const buf = await defaultGenderThumbBuffer(user.gender, 512);
    return new InputFile(buf, "default.jpg");
  }
}

export function ownPhotoCacheKey(user: PhotoUser): string {
  const kind = faceBadgeKind(user, true);
  let sourceId: string;
  if (user.photoStatus === "approved" && user.photoFileId) {
    sourceId = user.photoFileId;
  } else if (user.photoStatus === "pending" && user.photoPendingFileId) {
    sourceId = user.photoPendingFileId;
  } else {
    sourceId = defaultCacheKey(user.gender);
  }
  return badgePhotoCacheKey(sourceId, kind);
}

/** تصویر آلبوم با بج + نوار اسم پایین عکس */
export async function albumPhotoWithNameLabel(
  api: Api,
  user: PhotoUser & {
    displayName?: string | null;
    age?: number | null;
  },
  opts: { size?: number; index?: number } = {},
): Promise<InputFile> {
  const size = opts.size ?? 480;
  const kind = faceBadgeKind(user, false);
  const hasPhoto = user.photoStatus === "approved" && Boolean(user.photoFileId);
  const nameRaw = (user.displayName ?? "کاربر").trim().slice(0, 22);
  const agePart = user.age != null ? ` · ${user.age}` : "";
  const label =
    opts.index != null
      ? `${opts.index}. ${nameRaw}${agePart}`
      : `${nameRaw}${agePart}`;

  const cacheKey = `albumlbl:${hasPhoto ? user.photoFileId : defaultCacheKey(user.gender)}:${kind}:${size}:${label}`;
  const hit = thumbBufCache.get(cacheKey);
  if (hit && Date.now() - hit.at < THUMB_TTL_MS) {
    return new InputFile(hit.buf, "album.jpg");
  }

  const raw = hasPhoto
    ? await loadUserPhotoBuffer(api, user, "public")
    : await fs.readFile(defaultAvatarPath(user.gender));

  const badgeSize = Math.max(40, Math.round(size * 0.18));
  const margin = Math.max(8, Math.round(size * 0.025));
  const badge = await sharp(await loadBadgePng(kind))
    .resize(badgeSize, badgeSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const barH = Math.max(48, Math.round(size * 0.14));
  const fontSize = Math.max(22, Math.round(size * 0.055));
  const escaped = label
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const fontCandidates = [
    process.env.ALBUM_NAME_FONT,
    "/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  ].filter(Boolean) as string[];

  let fontFile = "";
  for (const f of fontCandidates) {
    try {
      await fs.access(f);
      fontFile = f;
      break;
    } catch {
      /* try next */
    }
  }

  // librsvg معمولاً فونت سیستم را با اسم خانواده پیدا می‌کند
  const family = fontFile.includes("NotoSansArabic")
    ? "Noto Sans Arabic"
    : fontFile.includes("DejaVu")
      ? "DejaVu Sans"
      : "sans-serif";

  const barSvg = Buffer.from(
    `<svg width="${size}" height="${barH}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="rgba(0,0,0,0.72)"/>
      <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
        fill="#ffffff" font-size="${fontSize}px" font-family="${family}"
        font-weight="700">${escaped}</text>
    </svg>`,
  );

  const buf = await sharp(raw)
    .rotate()
    .resize(size, size, { fit: "cover", position: "centre" })
    .composite([
      {
        input: badge,
        top: margin,
        left: Math.max(0, size - badgeSize - margin),
        blend: "over",
      },
      {
        input: barSvg,
        top: size - barH,
        left: 0,
        blend: "over",
      },
    ])
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();

  thumbBufCache.set(cacheKey, { buf, at: Date.now() });
  trimMap(thumbBufCache, THUMB_MAX);
  return new InputFile(buf, "album.jpg");
}

/** تصویر فشرده برای لیست سرچ / آلبوم — با بج */
export async function listThumbWithBadge(
  api: Api,
  user: PhotoUser,
  size = 360,
): Promise<string | InputFile> {
  const kind = faceBadgeKind(user, false);
  const sourceId =
    user.photoStatus === "approved" && user.photoFileId
      ? user.photoFileId
      : defaultCacheKey(user.gender);
  const cacheKey = `listthumb:${sourceId}:${kind}:${size}`;
  const cached = cachedTelegramFileId(cacheKey);
  if (cached) return cached;

  try {
    const raw = await loadUserPhotoBuffer(api, user, "public");
    const squared = await sharp(raw)
      .rotate()
      .resize(size, size, { fit: "cover", position: "centre" })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    const out = await overlayFaceBadge(squared, kind, size);
    return new InputFile(out, "thumb.jpg");
  } catch (err) {
    console.error("listThumbWithBadge failed", err);
    if (user.photoStatus === "approved" && user.photoFileId) {
      return user.photoFileId;
    }
    const buf = await defaultGenderThumbBuffer(user.gender, size);
    return new InputFile(buf, "nophoto.jpg");
  }
}

/** بافر thumbnail مربعی برای اینلاین — با بج احراز (یک‌پاس sharp) */
export async function listThumbBuffer(
  api: Api,
  user: PhotoUser,
  size = 128,
): Promise<Buffer> {
  const kind = faceBadgeKind(user, false);
  const hasPhoto = user.photoStatus === "approved" && Boolean(user.photoFileId);
  const cacheKey = hasPhoto
    ? `tb:${user.photoFileId}:${kind}:${size}`
    : `tb:${defaultCacheKey(user.gender)}:${kind}:${size}`;
  const hit = thumbBufCache.get(cacheKey);
  if (hit && Date.now() - hit.at < THUMB_TTL_MS) return hit.buf;

  const raw = hasPhoto
    ? await loadUserPhotoBuffer(api, user, "public")
    : await fs.readFile(defaultAvatarPath(user.gender));

  const badgeSize = Math.max(28, Math.round(size * 0.22));
  const margin = Math.max(4, Math.round(size * 0.03));
  const badge = await sharp(await loadBadgePng(kind))
    .resize(badgeSize, badgeSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const buf = await sharp(raw)
    .rotate()
    .resize(size, size, { fit: "cover", position: "centre" })
    .composite([
      {
        input: badge,
        top: margin,
        left: Math.max(0, size - badgeSize - margin),
        blend: "over",
      },
    ])
    .jpeg({ quality: 70, mozjpeg: true })
    .toBuffer();

  thumbBufCache.set(cacheKey, { buf, at: Date.now() });
  trimMap(thumbBufCache, THUMB_MAX);
  return buf;
}

/** thumbnail پیش‌فرض جنسیت برای کش URL عمومی اینلاین */
export async function defaultGenderThumbBuffer(
  gender: string | null | undefined,
  size = 160,
): Promise<Buffer> {
  const key = `gendef:${defaultCacheKey(gender)}:${size}`;
  const hit = thumbBufCache.get(key);
  if (hit && Date.now() - hit.at < THUMB_TTL_MS) return hit.buf;
  let source: Buffer | string = defaultAvatarPath(gender);
  try {
    await fs.access(source);
  } catch {
    // اگر assets/defaults روی سرور نباشد، ربات نباید کرش کند
    console.error("default avatar missing; using solid placeholder", source);
    source = await sharp({
      create: {
        width: Math.max(size, 64),
        height: Math.max(size, 64),
        channels: 3,
        background: { r: 40, g: 44, b: 52 },
      },
    })
      .jpeg({ quality: 70 })
      .toBuffer();
  }
  const buf = await sharp(source)
    .rotate()
    .resize(size, size, { fit: "cover", position: "centre" })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer();
  thumbBufCache.set(key, { buf, at: Date.now() });
  trimMap(thumbBufCache, THUMB_MAX);
  return buf;
}

/** فقط پترن بدون‌عکس (برای کش URL عمومی) */
export async function noPhotoThumbBuffer(size = 160): Promise<Buffer> {
  const key = `nophoto:${size}`;
  const hit = thumbBufCache.get(key);
  if (hit && Date.now() - hit.at < THUMB_TTL_MS) return hit.buf;
  const buf = await sharp(await loadNoPhotoPng())
    .resize(size, size, { fit: "cover", position: "centre" })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer();
  thumbBufCache.set(key, { buf, at: Date.now() });
  return buf;
}

/** اگر هنوز به overlay نیاز بود (ادمین و غیره) */
export async function publicPhotoWithBadgeProcessed(
  api: Api,
  user: PhotoUser,
): Promise<InputFile> {
  const raw = await loadUserPhotoBuffer(api, user, "public");
  const out = await overlayFaceBadge(raw, faceBadgeKind(user, false));
  return new InputFile(out, "profile.jpg");
}
