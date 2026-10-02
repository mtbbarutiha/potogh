import "dotenv/config";
import fs from "node:fs";
import { run, type RunnerHandle } from "@grammyjs/runner";
import { createBot } from "./bot.js";
import { setupBotMenu } from "./botMenu.js";
import { prisma, configureDatabase } from "./db/prisma.js";
import {
  getHangSnapshot,
  logHealth,
  logRunner,
  logger,
  noteApiError,
} from "./lib/logger.js";
import { getPollWatch, isPollStalled, touchHeartbeat } from "./lib/pollWatch.js";
import { scheduleSelfRestart } from "./lib/selfRestart.js";

const PID_FILE = "/tmp/patogh-bot.pid";
/** اگر getUpdates بیشتر از این در حال اجرا بماند → گیر کرده
 *  باید از hardTimeout (۲۸ث) بزرگ‌تر باشد تا اول abort نرمال کار کند */
const POLL_MAX_INFLIGHT_MS = 50_000;
/** اگر هیچ getUpdates تمام نشود → polling مرده */
const POLL_MAX_IDLE_MS = 55_000;
/** بعد از چند بار replace ناموفق، کل پروسه را بکش تا watchdog بالا بیاورد */
const MAX_REPLACE_BURST = 3;

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function acquirePidLock() {
  try {
    if (fs.existsSync(PID_FILE)) {
      const old = Number(fs.readFileSync(PID_FILE, "utf8").trim());
      if (old && old !== process.pid && isAlive(old)) {
        logger.warn("pid.lock.kill", { oldPid: old });
        try {
          process.kill(old, "SIGTERM");
        } catch {
          /* ignore */
        }
        for (let i = 0; i < 20; i++) {
          if (!isAlive(old)) break;
          await sleep(250);
        }
        if (isAlive(old)) {
          logger.error("pid.lock.sigkill", { oldPid: old });
          try {
            process.kill(old, "SIGKILL");
          } catch {
            /* ignore */
          }
          await sleep(500);
        }
      }
    }
  } catch {
    /* ignore */
  }
  fs.writeFileSync(PID_FILE, String(process.pid));
  logger.info("pid.lock.acquired", { pid: process.pid });
}

function releasePidLock() {
  try {
    if (fs.existsSync(PID_FILE)) {
      const cur = Number(fs.readFileSync(PID_FILE, "utf8").trim());
      if (cur === process.pid) fs.unlinkSync(PID_FILE);
    }
  } catch {
    /* ignore */
  }
}

function startRunner(bot: ReturnType<typeof createBot>): RunnerHandle {
  return run(bot, {
    runner: {
      // long-poll کوتاه‌تر → با قطع شبکه زودتر برمی‌گردیم
      fetch: { timeout: 15 },
      maxRetryTime: 25_000,
      retryInterval: "exponential",
    },
    sink: {
      concurrency: 20,
      timeout: {
        milliseconds: 15_000,
        handler: (update) => {
          const id =
            update && typeof update === "object" && "update_id" in update
              ? (update as { update_id: number }).update_id
              : "?";
          logger.error("update.sink_timeout", { updateId: id, ms: 15_000 });
        },
      },
    },
  });
}

async function safeStop(handle: RunnerHandle) {
  try {
    if (typeof handle.stop !== "function") {
      logger.warn("runner.stop_missing");
      return;
    }
    const maybe = handle.stop() as unknown;
    if (maybe != null && typeof (maybe as Promise<void>).then === "function") {
      await (maybe as Promise<void>);
    }
  } catch (err) {
    logger.warn("runner.stop_error", {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function isConflict409(err: unknown): boolean {
  const msg = errMessage(err);
  return msg.includes("409") || /Conflict.*getUpdates/i.test(msg);
}

async function main() {
  const token = process.env.BOT_TOKEN;
  if (!token || token === "your_telegram_bot_token_here") {
    console.error(
      "BOT_TOKEN را در فایل .env تنظیم کن (از @BotFather بگیر).",
    );
    process.exit(1);
  }

  await acquirePidLock();
  // صبر تا getUpdates نمونه قبلی روی سرور تلگرام آزاد شود
  await sleep(2500);

  await prisma.$connect();
  await configureDatabase();
  logger.info("db.connected", {
    provider: (process.env.DATABASE_URL ?? "").startsWith("postgres")
      ? "postgresql"
      : "sqlite",
  });
  const { backfillMissingUserCodes } = await import("./db/users.js");
  const filled = await backfillMissingUserCodes();
  if (filled) logger.info("db.backfill_codes", { count: filled });

  const { expireStaleChatRequests } = await import("./services/match.js");
  const { cleanupExpiredStories } = await import("./services/story.js");

  const { initInlineThumbCache } = await import("./services/inlineList.js");
  await initInlineThumbCache();

  const bot = createBot(token);

  const { repairOrphanChats } = await import("./services/match.js");
  const repaired = await repairOrphanChats(bot.api);
  if (repaired) logger.info("chat.orphans_repaired", { count: repaired });

  const { isDemoPayAllowed } = await import("./services/diamonds.js");
  if (isDemoPayAllowed()) {
    logger.warn("payments.demo_pay_enabled", {
      msg: "ALLOW_DEMO_PAY is ON — users can top up without real payment",
    });
  }

  // فقط webhook را بردار — پیام‌های در صف را دور نریز (deploy/409 کوتاه نباید آپدیت کاربر را ببلعد)
  await bot.api.deleteWebhook({ drop_pending_updates: false });
  await setupBotMenu(bot);
  logger.info("bot.menu_ready");

  let expireRunning = false;
  const expireTimer = setInterval(() => {
    if (expireRunning) return;
    expireRunning = true;
    Promise.allSettled([
      expireStaleChatRequests(bot.api),
      cleanupExpiredStories(),
    ])
      .catch((err) =>
        logger.error("expire.failed", { err: errMessage(err) }),
      )
      .finally(() => {
        expireRunning = false;
      });
  }, 25_000);
  expireTimer.unref?.();

  /** نسل runner — اگر health عوض کند، لوپ بیرونی دوباره start نمی‌کند */
  let runnerGen = 0;
  let handle = startRunner(bot);
  let myGen = ++runnerGen;
  let restarting = false;
  let shuttingDown = false;
  let stuckPendingRounds = 0;
  let replaceBurst = 0;
  let replaceBurstWindowStart = Date.now();

  const replaceRunner = async (reason: string, dropPending: boolean) => {
    if (restarting || shuttingDown) return;
    restarting = true;
    logRunner("replace", { reason, dropPending, fromGen: myGen });
    try {
      await safeStop(handle);
      // تلگرام getUpdates قبلی را باید آزاد کند وگرنه 409 می‌آید
      const waitMs = /409|Conflict/i.test(reason) ? 6000 : 2000;
      await sleep(waitMs);
      if (shuttingDown) return;
      // فقط وقتی واقعاً گیر کرده (pending stall و مشابه) صف را خالی کن —
      // روی 409 عادی drop نکن تا پیام کاربر در deploy از بین نرود
      if (dropPending) {
        await bot.api
          .deleteWebhook({ drop_pending_updates: true })
          .catch((err) => noteApiError(err));
      } else {
        await bot.api
          .deleteWebhook({ drop_pending_updates: false })
          .catch((err) => noteApiError(err));
      }
      handle = startRunner(bot);
      myGen = ++runnerGen;
      stuckPendingRounds = 0;
      logRunner("started", { gen: myGen, reason });

      const now = Date.now();
      if (now - replaceBurstWindowStart > 120_000) {
        replaceBurst = 0;
        replaceBurstWindowStart = now;
      }
      replaceBurst++;
      if (replaceBurst >= MAX_REPLACE_BURST) {
        scheduleSelfRestart(
          `too many runner replaces (${replaceBurst}) — ${reason}`,
          1500,
        );
      }
    } finally {
      restarting = false;
    }
  };

  const me = await bot.api.getMe();
  logger.info("bot.running", {
    username: me.username,
    mode: "concurrent-runner",
    gen: myGen,
  });

  // اگر آپدیت‌ها در تلگرام جمع شوند ولی sink خالی باشد → polling مرده است
  // هر ۵ث یکبار — سریع‌تر از قبل تا هنگ کوتاه‌تر حس شود
  let healthTick = 0;
  const healthTimer = setInterval(() => {
    void (async () => {
      try {
        if (restarting || shuttingDown) return;

        // اول وضعیت poll را ببین — اگر گیر کرده، heartbeat را تازه نکن
        // وگرنه watchdog فکر می‌کند همه چیز سالم است
        const poll = getPollWatch();
        const pollStall = isPollStalled(POLL_MAX_INFLIGHT_MS, POLL_MAX_IDLE_MS);
        if (pollStall) {
          logger.error("health.poll_stalled", { reason: pollStall, ...poll });
          // خروج کامل پروسه — replaceRunner روی سوکت مرده ممکن است باز معطل شود
          scheduleSelfRestart(`poll stall: ${pollStall}`, 200);
          return;
        }

        touchHeartbeat("health");

        if (!handle.isRunning()) {
          await replaceRunner("health: not running", true);
          return;
        }

        const info = await bot.api.getWebhookInfo();
        const pending = info.pending_update_count ?? 0;
        const inflight = handle.size();
        const snap = getHangSnapshot();
        healthTick++;

        const unhealthy =
          pending > 0 ||
          snap.inflight.some((x) => x.ageMs > 8_000) ||
          !handle.isRunning();

        const stuckHandlers = snap.inflight.filter((x) => x.ageMs > 8_000);
        if (stuckHandlers.length > 0) {
          logger.warn("health.handler_stuck", {
            count: stuckHandlers.length,
            items: stuckHandlers.slice(0, 5).map((x) => ({
              ageMs: x.ageMs,
              kind: x.kind,
              from: x.from,
              hint: x.hint.slice(0, 40),
            })),
          });
        }

        if (unhealthy || healthTick % 6 === 0) {
          logHealth({
            pending,
            sinkInflight: inflight,
            running: handle.isRunning(),
            gen: myGen,
            handlerInflight: snap.inflight.length,
            oldestHandlerMs: snap.inflight.reduce(
              (m, x) => Math.max(m, x.ageMs),
              0,
            ),
            pollInFlightMs: poll.inFlightMs,
            pollSinceEndMs: poll.sinceLastEndMs,
            pollOk: poll.pollOkCount,
            pollFail: poll.pollFailCount,
            pollHardTimeout: poll.hardTimeoutCount,
            c409: snap.counters.conflict409,
            cTimeout: snap.counters.handlerTimeout,
            cSlow: snap.counters.slow,
            cEtimedout: snap.counters.etimedout,
            cReplace: snap.counters.runnerReplace,
          });
        }

        // pending مانده + هیچ کاری در حال انجام نیست = getUpdates گیر کرده
        if (pending >= 2 && inflight === 0) {
          stuckPendingRounds++;
          logger.warn("health.pending_stall", {
            pending,
            rounds: stuckPendingRounds,
          });
        } else {
          stuckPendingRounds = 0;
        }
        if (stuckPendingRounds >= 2) {
          await replaceRunner("health: pending stall", true);
        }
      } catch (err) {
        noteApiError(err);
        // قطعی گذرای شبکه در health-check باعث ری‌استارت نمی‌شود → warn، نه error
        logger.warn("health.check_failed", { err: errMessage(err) });
      }
    })();
  }, 5_000);
  healthTimer.unref?.();

  const stop = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("bot.stopping");
    clearInterval(expireTimer);
    clearInterval(healthTimer);
    try {
      await safeStop(handle);
    } catch {
      /* ignore */
    }
    releasePidLock();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());

  // task() ممکن است با ری‌استارت health عوض شود — لوپ نگه می‌داریم
  // مهم: خطای 409/ETIMEDOUT نباید کل پروسه را بکشد
  for (;;) {
    if (shuttingDown) {
      await sleep(500);
      continue;
    }
    const watchedGen = myGen;
    const task = handle.task();
    if (!task) {
      await sleep(1000);
      if (
        !shuttingDown &&
        !restarting &&
        !handle.isRunning() &&
        watchedGen === myGen
      ) {
        await replaceRunner("outer: no task / not running", true);
      }
      continue;
    }

    let endedWithError: unknown = null;
    try {
      await task;
    } catch (err) {
      endedWithError = err;
      noteApiError(err);
      logger.error("runner.task_error", {
        err: errMessage(err),
        conflict409: isConflict409(err),
        gen: watchedGen,
      });
    }

    if (shuttingDown) break;

    // health از قبل runner جدید ساخته — دوباره نساز
    if (watchedGen !== myGen || restarting) {
      logger.info("runner.outer_skip_replaced", {
        watchedGen,
        myGen,
        restarting,
      });
      await sleep(200);
      continue;
    }

    const conflict = isConflict409(endedWithError);
    await replaceRunner(
      conflict
        ? "409 Conflict (duplicate getUpdates)"
        : endedWithError
          ? `task failed: ${errMessage(endedWithError)}`
          : "task ended unexpectedly",
      // 409 = رقیب موقت؛ صف را نگه دار. بقیه شکست‌های ناشناخته → drop برای آن‌لاک
      conflict ? false : true,
    );
  }
}

main().catch(async (err) => {
  logger.error("main.crash", {
    err: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  console.error(err);
  releasePidLock();
  await prisma.$disconnect();
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error("process.unhandledRejection", {
    err: reason instanceof Error ? reason.message : String(reason),
    stack:
      reason instanceof Error
        ? reason.stack?.split("\n").slice(0, 8).join(" | ")
        : undefined,
  });
});

process.on("uncaughtException", (err) => {
  logger.error("process.uncaughtException", {
    err: err.message,
    stack: err.stack?.split("\n").slice(0, 8).join(" | "),
  });
});
