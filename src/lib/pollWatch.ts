import fs from "node:fs";
import { logger } from "./logger.js";

/** آخرین بار که getUpdates تمام شد (موفق یا ناموفق) */
let lastPollEndAt = Date.now();
/** اگر getUpdates در حال اجراست، از چه زمانی */
let pollInFlightSince: number | null = null;
let pollOkCount = 0;
let pollFailCount = 0;
let hardTimeoutCount = 0;

export const HEARTBEAT_FILE = "/tmp/patogh-heartbeat";

/** نوشتن همگام — حتی اگر event loop بعداً قفل شود، watchdog فایل را می‌بیند */
export function touchHeartbeat(reason: string): void {
  try {
    fs.writeFileSync(
      HEARTBEAT_FILE,
      `${Date.now()} ${process.pid} ${reason}\n`,
      "utf8",
    );
  } catch {
    /* ignore */
  }
}

export function markPollStart(): void {
  pollInFlightSince = Date.now();
  touchHeartbeat("poll.start");
}

export function markPollEnd(ok: boolean, meta: Record<string, unknown> = {}): void {
  pollInFlightSince = null;
  lastPollEndAt = Date.now();
  if (ok) pollOkCount++;
  else pollFailCount++;
  touchHeartbeat(ok ? "poll.ok" : "poll.fail");
  logger.debug("poll.end", { ok, ...meta });
}

export function markPollHardTimeout(): void {
  hardTimeoutCount++;
  pollInFlightSince = null;
  lastPollEndAt = Date.now();
  pollFailCount++;
  touchHeartbeat("poll.hard_timeout");
  logger.error("poll.hard_timeout", { hardTimeoutCount });
}

export function getPollWatch() {
  const now = Date.now();
  return {
    lastPollEndAt,
    pollInFlightSince,
    inFlightMs: pollInFlightSince != null ? now - pollInFlightSince : 0,
    sinceLastEndMs: now - lastPollEndAt,
    pollOkCount,
    pollFailCount,
    hardTimeoutCount,
  };
}

/** آیا polling گیر کرده؟ (سوکت مرده که timeout کلاینت هم آزادش نکرده) */
export function isPollStalled(maxInFlightMs: number, maxSinceEndMs: number): string | null {
  const w = getPollWatch();
  if (w.pollInFlightSince != null && w.inFlightMs >= maxInFlightMs) {
    return `getUpdates in-flight ${w.inFlightMs}ms`;
  }
  if (w.sinceLastEndMs >= maxSinceEndMs) {
    return `no getUpdates finish for ${w.sinceLastEndMs}ms`;
  }
  return null;
}

// اولین ضربان هنگام لود ماژول
touchHeartbeat("pollWatch.init");
