import fs from "node:fs";
import path from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

const LOG_DIR = path.resolve(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "bot.jsonl");
const MAX_FILE_BYTES = 8 * 1024 * 1024; // ~8MB
const RING_SIZE = 120;
const SLOW_MS = 2_000;
const VERY_SLOW_MS = 6_000;

const startedAt = Date.now();
let seq = 0;
let writeQueue: Promise<void> = Promise.resolve();
let rotatedOnce = false;

const ring: string[] = [];

const counters = {
  updates: 0,
  updatesOk: 0,
  updatesFail: 0,
  slow: 0,
  verySlow: 0,
  handlerTimeout: 0,
  conflict409: 0,
  etimedout: 0,
  runnerReplace: 0,
  healthWarn: 0,
  apiError: 0,
};

/** آپدیت‌های در حال اجرا — برای دیدن قفل/هنگ زنده */
const inflight = new Map<
  string,
  { t0: number; kind: string; from: string; hint: string }
>();

function ensureDir() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
}

function rotateIfNeeded() {
  try {
    if (!fs.existsSync(LOG_FILE)) return;
    const st = fs.statSync(LOG_FILE);
    if (st.size < MAX_FILE_BYTES) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dest = path.join(LOG_DIR, `bot-${stamp}.jsonl`);
    fs.renameSync(LOG_FILE, dest);
    rotatedOnce = true;
    // فقط ۳ فایل آرشیو نگه دار
    const archives = fs
      .readdirSync(LOG_DIR)
      .filter((f) => f.startsWith("bot-") && f.endsWith(".jsonl"))
      .map((f) => ({ f, m: fs.statSync(path.join(LOG_DIR, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m);
    for (const old of archives.slice(3)) {
      try {
        fs.unlinkSync(path.join(LOG_DIR, old.f));
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

function appendLine(line: string) {
  writeQueue = writeQueue.then(() => {
    ensureDir();
    rotateIfNeeded();
    return new Promise<void>((resolve) => {
      fs.appendFile(LOG_FILE, line + "\n", () => resolve());
    });
  });
}

function classifyError(msg: string): void {
  if (msg.includes("409") || /Conflict.*getUpdates/i.test(msg)) {
    counters.conflict409++;
  }
  if (/ETIMEDOUT|GETUPDATES_HARD_TIMEOUT/i.test(msg)) counters.etimedout++;
  // handlerTimeout فقط از outcome=timeout در logUpdateEnd شمرده می‌شود
}

function formatConsole(
  level: LogLevel,
  event: string,
  fields: LogFields,
): string {
  const parts = Object.entries(fields)
    .filter(([k]) => k !== "stack")
    .map(([k, v]) => {
      if (v == null) return `${k}=-`;
      if (typeof v === "string") return `${k}=${v}`;
      return `${k}=${JSON.stringify(v)}`;
    });
  return `[${level}] ${event}${parts.length ? " " + parts.join(" ") : ""}`;
}

export function log(
  level: LogLevel,
  event: string,
  fields: LogFields = {},
): void {
  const ts = new Date().toISOString();
  const id = ++seq;
  const row = { ts, id, level, event, uptimeMs: Date.now() - startedAt, ...fields };
  const line = JSON.stringify(row);
  ring.push(line);
  if (ring.length > RING_SIZE) ring.shift();

  appendLine(line);

  const consoleLine = formatConsole(level, event, fields);
  if (level === "error") console.error(consoleLine);
  else if (level === "warn") console.warn(consoleLine);
  else if (level === "debug") {
    if (process.env.LOG_DEBUG === "1") console.log(consoleLine);
  } else console.log(consoleLine);

  if (level === "error" || level === "warn") {
    // noteApiError خودش classify می‌کند؛ اینجا دوباره نشمار
    if (event === "api.error") return;
    const msg = String(fields.err ?? fields.reason ?? fields.message ?? event);
    classifyError(msg);
  }
}

export const logger = {
  debug: (event: string, fields?: LogFields) => log("debug", event, fields),
  info: (event: string, fields?: LogFields) => log("info", event, fields),
  warn: (event: string, fields?: LogFields) => log("warn", event, fields),
  error: (event: string, fields?: LogFields) => log("error", event, fields),
};

export function logUpdateStart(meta: {
  updateId?: number;
  kind: string;
  from: string;
  chat?: string;
  sessionKey?: string;
  hint?: string;
}): string {
  counters.updates++;
  const key = `${meta.updateId ?? seq}:${meta.from}:${Date.now()}`;
  inflight.set(key, {
    t0: Date.now(),
    kind: meta.kind,
    from: meta.from,
    hint: meta.hint ?? "",
  });
  logger.debug("update.start", {
    key,
    updateId: meta.updateId,
    kind: meta.kind,
    from: meta.from,
    chat: meta.chat,
    session: meta.sessionKey,
    hint: meta.hint,
    inflight: inflight.size,
  });
  return key;
}

export function logUpdateEnd(
  key: string,
  outcome: "ok" | "fail" | "timeout",
  extra: LogFields = {},
): void {
  const started = inflight.get(key);
  inflight.delete(key);
  const ms = started ? Date.now() - started.t0 : Number(extra.ms) || 0;
  if (outcome === "ok") counters.updatesOk++;
  else counters.updatesFail++;
  if (outcome === "timeout") counters.handlerTimeout++;
  if (ms >= VERY_SLOW_MS) counters.verySlow++;
  else if (ms >= SLOW_MS) counters.slow++;

  const level: LogLevel =
    outcome === "timeout" || outcome === "fail"
      ? "error"
      : ms >= VERY_SLOW_MS
        ? "warn"
        : ms >= SLOW_MS
          ? "warn"
          : "debug";

  log(level, outcome === "ok" ? "update.done" : "update.fail", {
    key,
    outcome,
    ms,
    slow: ms >= SLOW_MS,
    kind: started?.kind,
    from: started?.from,
    hint: started?.hint,
    inflight: inflight.size,
    ...extra,
  });
}

export function logRunner(event: string, fields: LogFields = {}): void {
  if (event.includes("replace") || event.includes("restart")) {
    counters.runnerReplace++;
  }
  const level: LogLevel = /error|fail|409|stuck|timeout/i.test(event)
    ? "error"
    : /warn|pending|stall/i.test(event)
      ? "warn"
      : "info";
  if (level === "warn") counters.healthWarn++;
  log(level, `runner.${event}`, fields);
}

export function logHealth(fields: LogFields): void {
  const pending = Number(fields.pending ?? 0);
  const level: LogLevel =
    pending >= 2 || fields.stuck === true ? "warn" : "info";
  if (level === "warn") counters.healthWarn++;
  log(level, "health.tick", {
    ...fields,
    inflightHandlers: inflight.size,
    memMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
  });
}

export function noteApiError(err: unknown): void {
  counters.apiError++;
  const msg = err instanceof Error ? err.message : String(err);
  classifyError(msg);
  // event=api.error تا log() دوباره classify نکند
  log("error", "api.error", {
    err: msg,
    stack: err instanceof Error ? err.stack?.split("\n").slice(0, 6).join(" | ") : undefined,
  });
}

export function getHangSnapshot(): {
  uptimeSec: number;
  startedAt: number;
  counters: typeof counters;
  inflight: Array<{ key: string; ageMs: number; kind: string; from: string; hint: string }>;
  logFile: string;
  rotated: boolean;
  recent: string[];
} {
  const now = Date.now();
  return {
    uptimeSec: Math.round((now - startedAt) / 1000),
    startedAt,
    counters: { ...counters },
    inflight: [...inflight.entries()].map(([key, v]) => ({
      key,
      ageMs: now - v.t0,
      kind: v.kind,
      from: v.from,
      hint: v.hint,
    })),
    logFile: LOG_FILE,
    rotated: rotatedOnce,
    recent: ring.slice(-25),
  };
}

/** نمایش خوانا مثل 2س 15د 08ث */
export function formatUptime(sec?: number): string {
  const total = Math.max(0, Math.floor(sec ?? (Date.now() - startedAt) / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}ر`);
  if (h > 0 || d > 0) parts.push(`${h}س`);
  parts.push(`${m}د`);
  parts.push(`${String(s).padStart(2, "0")}ث`);
  return parts.join(" ");
}

export function getUptimeSec(): number {
  return Math.round((Date.now() - startedAt) / 1000);
}

export function formatHangReportForAdmin(): string {
  const s = getHangSnapshot();
  const c = s.counters;
  const lines = [
    "📋 گزارش تشخیص هنگ",
    `⏱ آپ‌تایم: ${formatUptime(s.uptimeSec)} (${s.uptimeSec}s)`,
    `📁 log: ${s.logFile}`,
    "",
    "—— شمارنده‌ها ——",
    `updates: ${c.updates} (ok=${c.updatesOk} fail=${c.updatesFail})`,
    `slow≥2s: ${c.slow} | verySlow≥6s: ${c.verySlow}`,
    `handlerTimeout: ${c.handlerTimeout}`,
    `conflict409: ${c.conflict409}`,
    `ETIMEDOUT: ${c.etimedout}`,
    `runnerReplace: ${c.runnerReplace}`,
    `healthWarn: ${c.healthWarn}`,
    `apiError: ${c.apiError}`,
    "",
    `—— inflight الان (${s.inflight.length}) ——`,
  ];
  if (s.inflight.length === 0) {
    lines.push("(خالی — هیچ آپدیتی گیر نکرده)");
  } else {
    for (const item of s.inflight.slice(0, 8)) {
      lines.push(
        `• ${item.ageMs}ms ${item.kind} from=${item.from} ${item.hint}`.trim(),
      );
    }
  }
  lines.push("", "—— آخرین رویدادها ——");
  for (const raw of s.recent.slice(-8)) {
    try {
      const j = JSON.parse(raw) as { event?: string; ms?: number; err?: string; reason?: string; level?: string };
      const extra = j.err ?? j.reason ?? (j.ms != null ? `${j.ms}ms` : "");
      lines.push(`• [${j.level}] ${j.event}${extra ? " — " + String(extra).slice(0, 80) : ""}`);
    } catch {
      lines.push(`• ${raw.slice(0, 100)}`);
    }
  }
  return lines.join("\n");
}

export function getLogFilePath(): string {
  return LOG_FILE;
}

export function readRecentLogLines(n = 40): string[] {
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    const text = fs.readFileSync(LOG_FILE, "utf8");
    const lines = text.trimEnd().split("\n");
    return lines.slice(-n);
  } catch {
    return ring.slice(-n);
  }
}

// init early so first lines land on disk
ensureDir();
logger.info("logger.ready", { file: LOG_FILE, pid: process.pid });
