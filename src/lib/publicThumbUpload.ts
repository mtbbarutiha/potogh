import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fetchWithTimeout } from "./timeout.js";

const THUMB_DIR =
  process.env.THUMB_DIR ??
  path.resolve(process.cwd(), "data/public-thumbs");

const INDEX_FILE =
  process.env.THUMB_INDEX_PATH ??
  path.resolve(process.cwd(), "data/thumb-index.json");

/** پایهٔ URL عمومی — روی VPS با nginx سرو می‌شود */
const BASE_URL = (process.env.PUBLIC_THUMB_BASE_URL ?? "").replace(/\/+$/, "");

export type ThumbIndexEntry = {
  /** URL محلی/nginx — برای دیباگ */
  url?: string;
  /** URL CDN — تلگرام inline Article از این لود می‌کند */
  cdnUrl?: string;
  tgFileId?: string;
  at: number;
};

const memUrl = new Map<string, ThumbIndexEntry>();
const missingUntil = new Map<string, number>();
const URL_TTL_MS = 7 * 24 * 60 * 60_000;
const MISSING_TTL_MS = 45_000;
let indexLoaded = false;
let indexWriteChain: Promise<void> = Promise.resolve();

function safeName(cacheKey: string): string {
  return createHash("sha1").update(cacheKey).digest("hex") + ".jpg";
}

async function ensureDir() {
  await fs.mkdir(THUMB_DIR, { recursive: true });
}

function localUrl(fileName: string): string | null {
  if (!BASE_URL) return null;
  return `${BASE_URL}/${fileName}`;
}

async function loadIndexOnce() {
  if (indexLoaded) return;
  indexLoaded = true;
  try {
    const raw = await fs.readFile(INDEX_FILE, "utf8");
    const obj = JSON.parse(raw) as Record<string, ThumbIndexEntry>;
    const now = Date.now();
    for (const [k, v] of Object.entries(obj)) {
      if (v?.at && now - v.at < URL_TTL_MS) memUrl.set(k, v);
    }
  } catch {
    /* first run */
  }
}

async function persistIndexEntry(key: string, patch: Partial<ThumbIndexEntry>) {
  const prev = memUrl.get(key) ?? { at: Date.now() };
  const next: ThumbIndexEntry = { ...prev, ...patch, at: Date.now() };
  memUrl.set(key, next);
  missingUntil.delete(key);

  indexWriteChain = indexWriteChain.then(async () => {
    try {
      await ensureDir();
      let obj: Record<string, ThumbIndexEntry> = {};
      try {
        obj = JSON.parse(await fs.readFile(INDEX_FILE, "utf8")) as Record<
          string,
          ThumbIndexEntry
        >;
      } catch {
        /* new file */
      }
      obj[key] = { ...obj[key], ...next, at: Date.now() };
      await fs.writeFile(INDEX_FILE, JSON.stringify(obj));
    } catch {
      /* ignore disk errors */
    }
  });
  await indexWriteChain;
}

/** بارگذاری index دیسک به RAM — در startup */
export async function warmPublicThumbCache(): Promise<number> {
  await loadIndexOnce();
  return memUrl.size;
}

/** اگر فایل روی دیسک باشد → URL فوری */
export async function getCachedPublicThumbUrl(
  key: string,
): Promise<string | null> {
  await loadIndexOnce();

  const miss = missingUntil.get(key);
  if (miss != null && Date.now() < miss) return null;

  const hit = memUrl.get(key);
  if (hit?.url && Date.now() - hit.at < URL_TTL_MS) return hit.url;

  const name = safeName(key);
  try {
    await fs.access(path.join(THUMB_DIR, name));
    const url = localUrl(name);
    if (url) {
      await persistIndexEntry(key, { url });
      return url;
    }
  } catch {
    missingUntil.set(key, Date.now() + MISSING_TTL_MS);
  }
  return null;
}

async function uploadLitterbox(buf: Buffer): Promise<string | null> {
  const fd = new FormData();
  fd.append("reqtype", "fileupload");
  fd.append("time", process.env.INLINE_THUMB_CDN_TTL ?? "72h");
  fd.append(
    "fileToUpload",
    new Blob([new Uint8Array(buf)], { type: "image/jpeg" }),
    "t.jpg",
  );
  const up = await fetchWithTimeout(
    "https://litterbox.catbox.moe/resources/internals/api.php",
    { method: "POST", body: fd },
    12_000,
  );
  const text = (await up.text()).trim();
  if (up.ok && text.startsWith("http")) return text;
  return null;
}

async function uploadCatbox(buf: Buffer): Promise<string | null> {
  const fd = new FormData();
  fd.append("reqtype", "fileupload");
  fd.append("time", "12h");
  fd.append(
    "fileToUpload",
    new Blob([new Uint8Array(buf)], { type: "image/jpeg" }),
    "t.jpg",
  );
  const up = await fetchWithTimeout(
    "https://litterbox.catbox.moe/resources/internals/api.php",
    { method: "POST", body: fd },
    8_000,
  );
  const text = (await up.text()).trim();
  if (up.ok && text.startsWith("http")) return text;
  return null;
}

/**
 * ذخیرهٔ محلی JPEG و برگرداندن URL عمومی.
 * اگر PUBLIC_THUMB_BASE_URL ست باشد → بدون آپلود خارجی (سریع).
 * وگرنه fallback به catbox.
 */
export async function uploadPublicThumb(
  buf: Buffer,
  cacheKey?: string,
): Promise<string | null> {
  if (cacheKey) {
    const hit = await getCachedPublicThumbUrl(cacheKey);
    if (hit) return hit;
  }

  await ensureDir();
  const name = cacheKey ? safeName(cacheKey) : `tmp-${Date.now()}.jpg`;
  const filePath = path.join(THUMB_DIR, name);

  try {
    await fs.writeFile(filePath, buf);
  } catch {
    /* continue to remote fallback */
  }

  const local = localUrl(name);
  if (local) {
    if (cacheKey) await persistIndexEntry(cacheKey, { url: local });
    return local;
  }

  if (!BASE_URL) {
    try {
      const url = await uploadCatbox(buf);
      if (url && cacheKey) await persistIndexEntry(cacheKey, { url });
      return url;
    } catch {
      return null;
    }
  }
  return null;
}

/** URL برای thumbnail_url در InlineQueryResultArticle — CDN اولویت دارد */
export async function getInlineArticleThumbUrl(
  key: string,
): Promise<string | null> {
  await loadIndexOnce();

  const hit = memUrl.get(key);
  if (hit?.cdnUrl && Date.now() - hit.at < URL_TTL_MS) return hit.cdnUrl;

  const name = safeName(key);
  let buf: Buffer | null = null;
  try {
    buf = await fs.readFile(path.join(THUMB_DIR, name));
  } catch {
    return hit?.cdnUrl ?? hit?.url ?? null;
  }

  const cdn = await uploadLitterbox(buf);
  if (cdn) {
    await persistIndexEntry(key, { cdnUrl: cdn });
    return cdn;
  }
  return hit?.cdnUrl ?? hit?.url ?? null;
}

export async function getCachedCdnThumbUrl(
  key: string,
): Promise<string | null> {
  await loadIndexOnce();
  const hit = memUrl.get(key);
  if (hit?.cdnUrl && Date.now() - hit.at < URL_TTL_MS) return hit.cdnUrl;
  return null;
}

/**
 * آپلود buf به CDN و ذخیره cdnUrl
 */
export async function ensureCdnThumbUrl(
  buf: Buffer,
  cacheKey: string,
): Promise<string | null> {
  const cached = await getCachedCdnThumbUrl(cacheKey);
  if (cached) return cached;

  const cdn = await uploadLitterbox(buf);
  if (cdn) await persistIndexEntry(cacheKey, { cdnUrl: cdn });
  return cdn;
}

export function publicThumbBaseConfigured(): boolean {
  return Boolean(BASE_URL);
}
