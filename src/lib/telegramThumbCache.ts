import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { GrammyError, InputFile, type Api } from "grammy";
import { fetchWithTimeout } from "./timeout.js";

const THUMB_DIR =
  process.env.THUMB_DIR ??
  path.resolve(process.cwd(), "data/public-thumbs");

const INDEX_FILE =
  process.env.THUMB_INDEX_PATH ??
  path.resolve(process.cwd(), "data/thumb-index.json");

type IndexEntry = {
  url?: string;
  tgFileId?: string;
  at: number;
};

const mem = new Map<string, IndexEntry>();
let indexLoaded = false;
const uploadInflight = new Map<string, Promise<string | null>>();
let indexWriteChain: Promise<void> = Promise.resolve();

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function sendPhotoWithRetry(
  api: Api,
  adminId: number,
  buf: Buffer,
  attempts = 5,
): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const sent = await api.sendPhoto(
        adminId,
        new InputFile(buf, "inline-thumb.jpg"),
        { disable_notification: true },
      );
      const fileId = sent.photo?.at(-1)?.file_id;
      if (!fileId) return null;
      await api.deleteMessage(adminId, sent.message_id).catch(() => undefined);
      return fileId;
    } catch (err) {
      if (
        err instanceof GrammyError &&
        err.error_code === 429 &&
        i < attempts - 1
      ) {
        const wait =
          (err.parameters?.retry_after ?? 3) * 1000 + 500 + i * 400;
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
  return null;
}

function storageAdminId(): number | null {
  const raw = process.env.THUMB_STORAGE_ADMIN_ID ?? process.env.ADMIN_IDS ?? "";
  const id = Number(raw.split(",")[0]?.trim());
  return Number.isFinite(id) && id > 0 ? id : null;
}

function safeName(cacheKey: string): string {
  return createHash("sha1").update(cacheKey).digest("hex") + ".jpg";
}

async function loadIndexOnce() {
  if (indexLoaded) return;
  indexLoaded = true;
  try {
    const raw = await fs.readFile(INDEX_FILE, "utf8");
    const obj = JSON.parse(raw) as Record<string, IndexEntry>;
    for (const [k, v] of Object.entries(obj)) {
      if (v?.at) mem.set(k, v);
    }
  } catch {
    /* first run */
  }
}

async function persistEntry(key: string, patch: Partial<IndexEntry>) {
  await loadIndexOnce();
  const prev = mem.get(key) ?? { at: Date.now() };
  const next: IndexEntry = {
    ...prev,
    ...patch,
    at: Date.now(),
  };
  mem.set(key, next);

  indexWriteChain = indexWriteChain.then(async () => {
    let obj: Record<string, IndexEntry> = {};
    try {
      obj = JSON.parse(await fs.readFile(INDEX_FILE, "utf8")) as Record<
        string,
        IndexEntry
      >;
    } catch {
      /* new file */
    }
    obj[key] = { ...obj[key], ...next, at: Date.now() };
    await fs.mkdir(path.dirname(INDEX_FILE), { recursive: true });
    await fs.writeFile(INDEX_FILE, JSON.stringify(obj));
  });
  await indexWriteChain;
}

/** file_id کش‌شده — از CDN تلگرام سرو می‌شود (مطمئن‌ترین برای inline) */
export async function getCachedTelegramThumbFileId(
  key: string,
): Promise<string | null> {
  await loadIndexOnce();
  return mem.get(key)?.tgFileId ?? null;
}

async function readThumbBuffer(cacheKey: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(path.join(THUMB_DIR, safeName(cacheKey)));
  } catch {
    return null;
  }
}

/** آپلود یک‌بار به تلگرام → file_id (پیام بلافاصله پاک می‌شود) */
export async function ensureTelegramThumbFileId(
  api: Api,
  cacheKey: string,
  buf?: Buffer,
): Promise<string | null> {
  const cached = await getCachedTelegramThumbFileId(cacheKey);
  if (cached) return cached;

  const inflight = uploadInflight.get(cacheKey);
  if (inflight) return inflight;

  const adminId = storageAdminId();
  if (!adminId) return null;

  const task = (async () => {
    const data = buf ?? (await readThumbBuffer(cacheKey));
    if (!data?.length) return null;

    try {
      const fileId = await sendPhotoWithRetry(api, adminId, data);
      if (!fileId) return null;
      await persistEntry(cacheKey, { tgFileId: fileId });
      return fileId;
    } catch (err) {
      console.error("[telegramThumb] upload failed", cacheKey.slice(0, 40), err);
      return null;
    }
  })().finally(() => uploadInflight.delete(cacheKey));

  uploadInflight.set(cacheKey, task);
  return task;
}

/** تست دسترسی URL خارجی (برای تشخیص sslip.io) */
export async function probePublicThumbUrl(url: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(url, { method: "HEAD" }, 4_000);
    return res.ok;
  } catch {
    return false;
  }
}
