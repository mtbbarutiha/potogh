/**
 * CHANNEL PUBLISH GATEWAY — single allowed path for @Patoghchatbot posts.
 *
 * Always use channelPublish (or `npx tsx scripts/channel-publish.ts`).
 * Never call raw bot.api.sendPhoto / sendVideo / sendMessage to the channel.
 *
 * Dedupes by normalized caption + media hash before any Telegram send.
 * Log: data/channel-publish-log.json (on VPS: /opt/patogh-bot/data/...)
 *
 * See CHANNEL_PUBLISH.md
 */
import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Bot, InlineKeyboard, InputFile, type Api } from "grammy";

export const DEFAULT_CHANNEL =
  process.env.FORCE_JOIN_CHAT_ID ||
  process.env.FORCE_JOIN_CHANNEL ||
  "@Patoghchatbot";

export type PublishKind = "photo" | "video" | "text";

export interface ChannelPublishRequest {
  kind: PublishKind;
  /** Caption for photo/video, or message body for text */
  caption?: string;
  /** Alias for text kind body */
  text?: string;
  /** Local path to photo/video file */
  mediaPath?: string;
  replyMarkup?: InlineKeyboard;
  duration?: number;
  width?: number;
  height?: number;
  thumbnailPath?: string;
  supportsStreaming?: boolean;
  chatId?: string | number;
  /** If true, run dedupe + validate but do not call Telegram send APIs */
  dryRun?: boolean;
  /**
   * Also refuse if captionNorm alone matches any prior entry (default true).
   * Prevents near-duplicate earn/referral posts with slightly different media.
   */
  blockSameCaption?: boolean;
  /**
   * Also refuse if mediaHash alone matches (default true).
   */
  blockSameMedia?: boolean;
  /** Optional label stored in the log (script name, campaign, …) */
  label?: string;
}

export interface PublishLogEntry {
  message_id: number | null;
  fingerprint: string;
  captionNorm: string;
  mediaHash: string | null;
  mediaName: string | null;
  kind: PublishKind;
  createdAt: string;
  chatId: string;
  label?: string;
  dryRun?: boolean;
}

export interface PublishLogFile {
  version: 1;
  channel: string;
  updatedAt: string;
  entries: PublishLogEntry[];
}

export type ChannelPublishOk = {
  ok: true;
  messageId: number | null;
  fingerprint: string;
  dryRun: boolean;
  entry: PublishLogEntry;
};

export type ChannelPublishBlocked = {
  ok: false;
  code: "DUPLICATE" | "VALIDATION" | "SEND_FAILED";
  reason: string;
  reasonFa: string;
  fingerprint?: string;
  duplicateOf?: PublishLogEntry;
};

export type ChannelPublishResult = ChannelPublishOk | ChannelPublishBlocked;

const ROOT = process.cwd();
const DEFAULT_LOG = path.resolve(ROOT, "data/channel-publish-log.json");

/** Strip emoji / variation selectors / ZWJ noise for stable caption compare */
export function normalizeCaption(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF\uFE0E\uFE0F]/g, "")
    // eslint-disable-next-line no-misleading-character-class -- intentional emoji-ish strip
    .replace(
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}\u{2934}\u{2935}]/gu,
      "",
    )
    .replace(/[✨🎵👇💵📷🎬]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function hashFile(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export function buildFingerprint(
  captionNorm: string,
  mediaHash: string | null,
  kind: PublishKind,
): string {
  const payload = `${kind}|${captionNorm}|${mediaHash ?? "nomedia"}`;
  return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
}

export function logPath(): string {
  return process.env.CHANNEL_PUBLISH_LOG || DEFAULT_LOG;
}

export function loadLog(file = logPath()): PublishLogFile {
  if (!fs.existsSync(file)) {
    return {
      version: 1,
      channel: String(DEFAULT_CHANNEL),
      updatedAt: new Date().toISOString(),
      entries: [],
    };
  }
  const raw = fs.readFileSync(file, "utf8");
  const parsed = JSON.parse(raw) as PublishLogFile;
  if (!parsed.entries || !Array.isArray(parsed.entries)) {
    throw new Error(`invalid publish log: ${file}`);
  }
  return parsed;
}

function saveLog(log: PublishLogFile, file = logPath()): void {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  log.updatedAt = new Date().toISOString();
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(log, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file);
}

export function appendLogEntry(
  entry: PublishLogEntry,
  file = logPath(),
): void {
  const log = loadLog(file);
  log.entries.push(entry);
  log.channel = entry.chatId;
  saveLog(log, file);
}

function findDuplicate(
  log: PublishLogFile,
  opts: {
    fingerprint: string;
    captionNorm: string;
    mediaHash: string | null;
    blockSameCaption: boolean;
    blockSameMedia: boolean;
  },
): PublishLogEntry | undefined {
  // Ignore dry-run-only ghost entries for blocking real sends? Keep them —
  // a successful dry-run still means "would publish this fingerprint".
  for (let i = log.entries.length - 1; i >= 0; i--) {
    const e = log.entries[i]!;
    if (e.fingerprint === opts.fingerprint) return e;
    if (
      opts.blockSameCaption &&
      opts.captionNorm.length > 0 &&
      e.captionNorm === opts.captionNorm
    ) {
      return e;
    }
    if (
      opts.blockSameMedia &&
      opts.mediaHash &&
      e.mediaHash &&
      e.mediaHash === opts.mediaHash
    ) {
      return e;
    }
  }
  return undefined;
}

/**
 * Optional: probe recent message ids already recorded (no Telegram getChatHistory —
 * Bot API cannot list channel history). Callers can pass known ids into the log via seed.
 */
export function knownMessageIds(file = logPath()): number[] {
  return loadLog(file)
    .entries.map((e) => e.message_id)
    .filter((id): id is number => typeof id === "number" && id > 0);
}

export async function channelPublish(
  req: ChannelPublishRequest,
): Promise<ChannelPublishResult> {
  const chatId = String(req.chatId ?? DEFAULT_CHANNEL);
  const kind = req.kind;
  const body =
    kind === "text"
      ? (req.text ?? req.caption ?? "")
      : (req.caption ?? "");

  if (kind !== "text" && !req.mediaPath) {
    return {
      ok: false,
      code: "VALIDATION",
      reason: "mediaPath required for photo/video",
      reasonFa: "برای عکس/ویدیو مسیر فایل (mediaPath) لازم است",
    };
  }
  if (kind === "text" && !body.trim()) {
    return {
      ok: false,
      code: "VALIDATION",
      reason: "text/caption required",
      reasonFa: "متن پست خالی است",
    };
  }
  if (req.mediaPath && !fs.existsSync(req.mediaPath)) {
    return {
      ok: false,
      code: "VALIDATION",
      reason: `media file missing: ${req.mediaPath}`,
      reasonFa: `فایل رسانه پیدا نشد: ${req.mediaPath}`,
    };
  }
  if (
    !chatId.includes("Patoghchatbot") &&
    !chatId.startsWith("-100") &&
    chatId !== "@Patoghchatbot"
  ) {
    return {
      ok: false,
      code: "VALIDATION",
      reason: `refusing non-channel chat: ${chatId}`,
      reasonFa: `چت غیرکانال مجاز نیست: ${chatId}`,
    };
  }

  const captionNorm = normalizeCaption(body);
  const mediaHash = req.mediaPath ? hashFile(req.mediaPath) : null;
  const mediaName = req.mediaPath ? path.basename(req.mediaPath) : null;
  const fingerprint = buildFingerprint(captionNorm, mediaHash, kind);

  const blockSameCaption = req.blockSameCaption !== false;
  const blockSameMedia = req.blockSameMedia !== false;
  const log = loadLog();
  const dup = findDuplicate(log, {
    fingerprint,
    captionNorm,
    mediaHash,
    blockSameCaption,
    blockSameMedia,
  });

  if (dup) {
    const mid = dup.message_id != null ? String(dup.message_id) : "dry-run";
    return {
      ok: false,
      code: "DUPLICATE",
      reason: `Duplicate channel post blocked (matches message_id=${mid}, fingerprint=${dup.fingerprint.slice(0, 12)}…)`,
      reasonFa: `پست تکراری مسدود شد (مشابه message_id=${mid}). از انتشار دوباره خودداری کنید.`,
      fingerprint,
      duplicateOf: dup,
    };
  }

  const createdAt = new Date().toISOString();
  const dryRun = Boolean(req.dryRun);

  if (dryRun) {
    const entry: PublishLogEntry = {
      message_id: null,
      fingerprint,
      captionNorm,
      mediaHash,
      mediaName,
      kind,
      createdAt,
      chatId,
      dryRun: true,
      ...(req.label ? { label: req.label } : {}),
    };
    // Do NOT append dry-run to the durable log — smoke tests must not poison
    // the real dedupe store. Callers that want to seed must use seedPublishLog.
    return { ok: true, messageId: null, fingerprint, dryRun: true, entry };
  }

  const token = process.env.BOT_TOKEN;
  if (!token) {
    return {
      ok: false,
      code: "VALIDATION",
      reason: "BOT_TOKEN missing",
      reasonFa: "BOT_TOKEN تنظیم نشده",
    };
  }

  const bot = new Bot(token);
  let messageId: number;

  try {
    messageId = await sendViaApi(bot.api, chatId, req, body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      code: "SEND_FAILED",
      reason: `Telegram send failed: ${msg}`,
      reasonFa: `ارسال به تلگرام ناموفق: ${msg}`,
      fingerprint,
    };
  }

  const entry: PublishLogEntry = {
    message_id: messageId,
    fingerprint,
    captionNorm,
    mediaHash,
    mediaName,
    kind,
    createdAt,
    chatId,
    ...(req.label ? { label: req.label } : {}),
  };
  appendLogEntry(entry);

  return { ok: true, messageId, fingerprint, dryRun: false, entry };
}

async function sendViaApi(
  api: Api,
  chatId: string,
  req: ChannelPublishRequest,
  body: string,
): Promise<number> {
  if (req.kind === "text") {
    const sent = await api.sendMessage(chatId, body, {
      ...(req.replyMarkup ? { reply_markup: req.replyMarkup } : {}),
    });
    return sent.message_id;
  }

  const media = new InputFile(req.mediaPath!);
  const base: Record<string, unknown> = {
    caption: body,
  };
  if (req.replyMarkup) base.reply_markup = req.replyMarkup;
  if (req.thumbnailPath && fs.existsSync(req.thumbnailPath)) {
    base.thumbnail = new InputFile(req.thumbnailPath);
  }

  if (req.kind === "photo") {
    const sent = await api.sendPhoto(chatId, media, base as never);
    return sent.message_id;
  }

  // video
  if (req.supportsStreaming !== false) base.supports_streaming = true;
  if (req.duration != null) base.duration = req.duration;
  if (req.width != null) base.width = req.width;
  if (req.height != null) base.height = req.height;
  const sent = await api.sendVideo(chatId, media, base as never);
  return sent.message_id;
}

/** Seed / register an already-live post so it cannot be republished. */
export function seedPublishLog(
  partial: Omit<PublishLogEntry, "createdAt"> & { createdAt?: string },
  file = logPath(),
): PublishLogEntry {
  const entry: PublishLogEntry = {
    ...partial,
    createdAt: partial.createdAt ?? new Date().toISOString(),
  };
  const log = loadLog(file);
  const exists = log.entries.some(
    (e) =>
      e.fingerprint === entry.fingerprint ||
      (entry.message_id != null && e.message_id === entry.message_id),
  );
  if (!exists) {
    log.entries.push(entry);
    log.channel = entry.chatId;
    saveLog(log, file);
  }
  return entry;
}

export function formatResult(result: ChannelPublishResult): string {
  if (result.ok) {
    if (result.dryRun) {
      return `[dryRun] would publish fingerprint=${result.fingerprint.slice(0, 16)}… (not sent, not logged)`;
    }
    return `published message_id=${result.messageId} fingerprint=${result.fingerprint.slice(0, 16)}…`;
  }
  return `BLOCKED [${result.code}]: ${result.reason}\nFA: ${result.reasonFa}`;
}
