import { logger } from "./logger.js";

let restartScheduled = false;

/** برنامه‌ریزی خروج پروسه — watchdog ظرف چند ثانیه دوباره بالا می‌آورد */
export function scheduleSelfRestart(reason: string, delayMs = 800): boolean {
  if (restartScheduled) return false;
  restartScheduled = true;
  logger.error("bot.self_restart", { reason, delayMs, pid: process.pid });
  // عمداً heartbeat را تازه نکن — بگذار watchdog کهنگی را ببیند
  const exitNow = () => {
    try {
      // SIGKILL خودی اگر exit گیر کرد
      setTimeout(() => {
        try {
          process.kill(process.pid, "SIGKILL");
        } catch {
          /* ignore */
        }
      }, 2500).unref?.();
      process.exit(42);
    } catch {
      try {
        process.kill(process.pid, "SIGKILL");
      } catch {
        /* ignore */
      }
    }
  };
  if (delayMs <= 0) {
    exitNow();
    return true;
  }
  setTimeout(exitNow, delayMs).unref?.();
  return true;
}

export function isRestartScheduled(): boolean {
  return restartScheduled;
}
