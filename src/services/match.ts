import type { Api, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { prisma } from "../db/prisma.js";
import { ensureUserCode, patchUser } from "../db/users.js";
import { haversineKm } from "../lib/geo.js";
import {
  chattingKeyboard,
  chattingInlineKeyboard,
  mainKeyboard,
  waitingKeyboard,
} from "../keyboards/main.js";
import { langOf, t, tr, normalizeLang, type Lang } from "../i18n/index.js";
import { cityLabel, provinceLabel } from "../data/locations.js";
import { formatNum, QUICK_MATCH_COST, QUICK_MATCH_REFUND_MS } from "../data/packages.js";
import { logPairMessages, logChatMessage } from "./chatLog.js";
import {
  debitQuickMatchPayersInTx,
  notifyQuickMatchCharged,
  quickMatchInsufficientCoinsText,
  settleQuickMatchOnChatEnd,
} from "./quickMatchPay.js";

export type QuickMatchGender = "female" | "male" | "any";

/** ترجیح جنسیت برای همین جلسه چت سریع (موقت در حافظه) */
const quickMatchPrefs = new Map<number, QuickMatchGender>();

export function setQuickMatchPref(userId: number, pref: QuickMatchGender) {
  quickMatchPrefs.set(userId, pref);
}

export function getQuickMatchPref(userId: number): QuickMatchGender | undefined {
  return quickMatchPrefs.get(userId);
}

export function clearQuickMatchPref(userId: number) {
  quickMatchPrefs.delete(userId);
}

export function quickMatchGenderLabel(
  pref: QuickMatchGender,
  lang: Lang | string | null = "fa",
): string {
  const L = normalizeLang(lang);
  if (pref === "female") return tr(L, "👩 دختر", "👩 girls");
  if (pref === "male") return tr(L, "👨 پسر", "👨 boys");
  return tr(L, "👥 هردو", "👥 both");
}

export function quickMatchGenderKeyboard(lang: Lang | string | null = "fa") {
  const L = normalizeLang(lang);
  return new InlineKeyboard()
    .text(tr(L, "👩 دختر", "👩 Girl"), "quick:g:female")
    .success()
    .text(tr(L, "👨 پسر", "👨 Boy"), "quick:g:male")
    .primary()
    .row()
    .text(tr(L, "👥 هردو", "👥 Both"), "quick:g:any")
    .primary()
    .row()
    .text(tr(L, "❌ انصراف", "❌ Cancel"), "quick:cancel")
    .danger();
}

function quickMatchGenderOk(
  me: { gender: string | null },
  peer: { gender: string | null },
  myPref: QuickMatchGender,
  peerPref: QuickMatchGender,
): boolean {
  if (myPref !== "any" && peer.gender !== myPref) return false;
  if (peerPref !== "any" && me.gender !== peerPref) return false;
  return true;
}

/** قبل از ورود به صف — انتخاب دختر / پسر / هردو */
export async function promptQuickMatchGender(ctx: Context, userId: number) {
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) return;
  const lang = langOf(me);
  if (me.state === "chatting") {
    await ctx.reply(
      lang === "en"
        ? "You're in a chat. End it first."
        : "الان در چت هستی. اول قطع کن.",
      { reply_markup: mainKeyboard(lang) },
    );
    return;
  }
  if (me.state === "waiting") {
    await tryQuickMatch(ctx, userId);
    return;
  }
  // پیش‌بررسی سکه — کسر واقعی فقط هنگام وصل موفق
  if (me.diamonds < QUICK_MATCH_COST) {
    await ctx.reply(quickMatchInsufficientCoinsText(lang, me.diamonds), {
      reply_markup: mainKeyboard(lang),
    });
    return;
  }
  const refundSec = Math.round(QUICK_MATCH_REFUND_MS / 1000);
  await ctx.reply(
    tr(
      lang,
      [
        "⚡ چت سریع — به یه ناشناس وصل شو",
        "",
        `💰 هزینه وصل: ${formatNum(QUICK_MATCH_COST)} سکه (فقط وقتی وصل شدید کسر می‌شود).`,
        `♻️ اگر طرف مقابل زیر ${formatNum(refundSec)} ثانیه قطع کند، سکه برمی‌گردد.`,
        "",
        "می‌خوای با کی چت کنی؟",
        "درخواست‌ها فقط برای همین انتخاب ارسال می‌شود.",
      ].join("\n"),
      [
        "⚡ Quick chat — connect to a stranger",
        "",
        `💰 Connect cost: ${QUICK_MATCH_COST} coins (charged only when matched).`,
        `♻️ If the other person leaves within ${refundSec}s, coins are refunded.`,
        "",
        "Who do you want to chat with?",
        "Requests will only go to people matching your choice.",
      ].join("\n"),
    ),
    { reply_markup: quickMatchGenderKeyboard(lang) },
  );
}

async function cancelPendingFromUser(userId: number, exceptId?: number) {
  await prisma.chatRequest.updateMany({
    where: {
      fromUserId: userId,
      status: "pending",
      ...(exceptId != null ? { id: { not: exceptId } } : {}),
    },
    data: { status: "cancelled" },
  });
}

export function chatRequestKeyboard(
  requestId: number,
  lang: Lang | string | null = "fa",
) {
  const L = normalizeLang(lang);
  return new InlineKeyboard()
    .text(tr(L, "✅ قبول چت", "✅ Accept chat"), `chatreq:ok:${requestId}`)
    .success()
    .text(tr(L, "❌ رد", "❌ Decline"), `chatreq:no:${requestId}`)
    .danger();
}

export function wipeChatKeyboard(
  partnerUserId: number,
  lang: Lang | string | null = "fa",
) {
  const L = normalizeLang(lang);
  return new InlineKeyboard()
    .text(
      tr(L, "🗑 پاک کردن کامل گفتگو (هر دو طرف)", "🗑 Wipe entire chat (both sides)"),
      `chat:wipe:${partnerUserId}`,
    )
    .danger();
}

export async function leaveQueueOrChat(
  api: Api,
  user: {
    id: number;
    telegramId: bigint;
    state: string;
    chatPartnerId: number | null;
  },
  notifyPartner = true,
) {
  const partnerId = user.chatPartnerId;
  const wasChatting = user.state === "chatting" && partnerId != null;
  const leftChatPair = wasChatting || partnerId != null;

  if (leftChatPair) {
    const partner = partnerId
      ? await prisma.user.findUnique({ where: { id: partnerId } })
      : null;
    await patchUser(user.id, {
      state: "idle",
      chatPartnerId: null,
      secureChat: false,
    });
    const { syncIdleUserMenu } = await import("../botMenu.js");
    void syncIdleUserMenu(api, user.telegramId);
    let partnerAlsoEnded = false;
    if (partner) {
      const partnerStillLinked =
        partner.chatPartnerId === user.id || partner.state === "chatting";
      if (partnerStillLinked) {
        partnerAlsoEnded = true;
        await patchUser(partner.id, {
          state: "idle",
          chatPartnerId: null,
          secureChat: false,
        });
        void syncIdleUserMenu(api, partner.telegramId);
        if (notifyPartner && wasChatting && partner.telegramId < 9000000000n) {
          try {
            const partnerLang = langOf(partner);
            const endText = [
              t(partnerLang, "chat_ended_partner"),
              "",
              t(partnerLang, "wipe_offer"),
              partnerLang === "en"
                ? "If anything remains: Clear history on this chat."
                : "اگر چیزی باقی ماند: Clear history روی این چت.",
            ].join("\n");
            const m = await api.sendMessage(
              Number(partner.telegramId),
              endText,
              {
                reply_markup: wipeChatKeyboard(user.id, partnerLang),
              },
            );
            await logChatMessage(
              partner.id,
              user.id,
              partner.telegramId,
              m.message_id,
            );
            await api.sendMessage(
              Number(partner.telegramId),
              partnerLang === "en"
                ? "You can connect again from the menu."
                : "از منو دوباره می‌توانی وصل شوی.",
              { reply_markup: mainKeyboard(partnerLang) },
            );
          } catch (err) {
            console.error("notify partner end-chat failed", partner.id, err);
          }
        }
      }
    }
    // بازپرداخت وصل ناشناس اگر طرف مقابل زیر ۲۰ثانیه قطع کرده باشد
    if (partnerId != null) {
      try {
        await settleQuickMatchOnChatEnd(api, user.id, partnerId);
      } catch (err) {
        console.error("quickMatch settle after leave failed", user.id, err);
      }
    }
    // یک‌باره: ناظران پایان چت این کاربر / شریک
    try {
      const { notifyChatEndWatchers } = await import("./chatEndWatch.js");
      await notifyChatEndWatchers(api, user.id);
      if (partnerAlsoEnded && partner) {
        await notifyChatEndWatchers(api, partner.id);
      }
    } catch (err) {
      console.error("chatEndWatch notify after leave failed", user.id, err);
    }
    return;
  }

  if (user.state === "waiting") {
    await patchUser(user.id, {
      state: "idle",
      chatPartnerId: null,
      secureChat: false,
    });
    clearQuickMatchPref(user.id);
    await cancelPendingFromUser(user.id);
  }
}

/** تعمیر وضعیت‌های گیرکرده چت */
export async function repairOrphanChats(api?: Api) {
  const chatting = await prisma.user.findMany({
    where: { state: "chatting" },
  });
  let fixed = 0;
  const endedIds: number[] = [];
  for (const u of chatting) {
    if (!u.chatPartnerId) {
      await patchUser(u.id, {
        state: "idle",
        chatPartnerId: null,
        secureChat: false,
      });
      endedIds.push(u.id);
      fixed++;
      continue;
    }
    const partner = await prisma.user.findUnique({
      where: { id: u.chatPartnerId },
    });
    // Mutual link is enough; partner may be await_direct_msg mid-compose
    if (!partner || partner.chatPartnerId !== u.id) {
      await patchUser(u.id, {
        state: "idle",
        chatPartnerId: null,
        secureChat: false,
      });
      endedIds.push(u.id);
      fixed++;
    }
  }
  // Do NOT clear chatPartnerId for await_direct_msg — that state keeps the
  // active chat partner so restoreAfterDm can return to chatting.
  const stale = await prisma.user.findMany({
    where: {
      state: { notIn: ["chatting", "await_direct_msg"] },
      chatPartnerId: { not: null },
    },
  });
  for (const u of stale) {
    await patchUser(u.id, { chatPartnerId: null, secureChat: false });
    endedIds.push(u.id);
    fixed++;
  }
  if (api && endedIds.length > 0) {
    try {
      const { notifyChatEndWatchers } = await import("./chatEndWatch.js");
      for (const id of endedIds) {
        await notifyChatEndWatchers(api, id);
      }
    } catch (err) {
      console.error("chatEndWatch notify after repair failed", err);
    }
  }
  return fixed;
}

/** کسی که الان در صف چت سریع منتظر است و با ترجیح جنسیت سازگار است */
async function findWaitingPeer(meId: number) {
  const me = await prisma.user.findUnique({ where: { id: meId } });
  if (!me) return null;
  const myPref = getQuickMatchPref(meId) ?? "any";

  const peers = await prisma.user.findMany({
    where: {
      id: { not: meId },
      state: "waiting",
      registered: true,
      isActive: true,
      deletedAt: null,
      telegramId: { lt: 9000000000n },
    },
    orderBy: { lastActiveAt: "desc" },
    take: 30,
  });

  for (const peer of peers) {
    const peerPref = getQuickMatchPref(peer.id) ?? "any";
    if (!quickMatchGenderOk(me, peer, myPref, peerPref)) continue;
    return peer;
  }
  return null;
}

export async function tryQuickMatch(ctx: Context, userId: number) {
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) return;
  const lang = langOf(me);
  const pref = getQuickMatchPref(me.id);
  if (me.state !== "waiting" && !pref) {
    await promptQuickMatchGender(ctx, userId);
    return;
  }
  const genderPref = pref ?? "any";
  const prefLabel = quickMatchGenderLabel(genderPref, lang);
  if (me.state === "chatting") {
    await ctx.reply(
      lang === "en"
        ? "You're in a chat. End it first."
        : "الان در چت هستی. اول قطع کن.",
      { reply_markup: mainKeyboard(lang) },
    );
    return;
  }

  // پیش‌بررسی سکه — کسر واقعی فقط در connectUsers هنگام وصل
  if (me.diamonds < QUICK_MATCH_COST) {
    await ctx.reply(quickMatchInsufficientCoinsText(lang, me.diamonds), {
      reply_markup: mainKeyboard(lang),
    });
    return;
  }

  // ۱) اگر کسی در صف منتظر است → وصل فوری (مثل پاتوق)
  const peer = await findWaitingPeer(me.id);
  if (peer) {
    await prisma.chatRequest.updateMany({
      where: {
        OR: [{ fromUserId: me.id }, { fromUserId: peer.id }],
        status: "pending",
      },
      data: { status: "cancelled" },
    });
    // هر دو جستجوگر ناشناس‌اند → هر کدام ۲ سکه هنگام وصل
    const result = await connectUsers(ctx.api, me.id, peer.id, {
      quickPayers: [me.id, peer.id],
    });
    if (result === "ok") return;
    if (result === "no_coins") {
      await ctx.reply(quickMatchInsufficientCoinsText(lang, me.diamonds), {
        reply_markup: mainKeyboard(lang),
      });
      // اگر طرف مقابل سکه نداشت از صف بیرونش کن تا گیر نکند
      const peerNow = await prisma.user.findUnique({ where: { id: peer.id } });
      if (peerNow && peerNow.state === "waiting" && peerNow.diamonds < QUICK_MATCH_COST) {
        await leaveQueueOrChat(ctx.api, peerNow, false);
        if (peerNow.telegramId < 9000000000n) {
          try {
            await ctx.api.sendMessage(
              Number(peerNow.telegramId),
              quickMatchInsufficientCoinsText(langOf(peerNow), peerNow.diamonds),
              { reply_markup: mainKeyboard(langOf(peerNow)) },
            );
          } catch (err) {
            console.error("notify peer no_coins failed", peer.id, err);
          }
        }
      }
      return;
    }
    if (result === "busy") {
      await ctx.reply(
        lang === "en"
          ? "They're busy now. Try again."
          : "الان مشغول شد. دوباره امتحان کن.",
        { reply_markup: mainKeyboard(lang) },
      );
      return;
    }
  }

  // ۲) اگر خودت قبلاً در صف هستی، درخواست‌های قبلی را باطل نکن
  //    (باطل کردن باعث می‌شود دکمهٔ قبول طرف مقابل «منقضی» شود)
  if (me.state === "waiting") {
    const pendingCount = await prisma.chatRequest.count({
      where: { fromUserId: me.id, status: "pending" },
    });
    await ctx.reply(
      lang === "en"
        ? [
            "⚡ You're still in the quick-chat queue.",
            pendingCount > 0
              ? `You have ${pendingCount} open request(s) — wait for acceptance.`
              : "No open requests; tap «Cancel search» once and try again.",
            "",
            "When someone joins the queue, you'll connect automatically.",
            "Cancel: «Cancel search»",
          ].join("\n")
        : [
            "⚡ هنوز در صف چت سریع هستی.",
            pendingCount > 0
              ? `${pendingCount} درخواست باز داری — منتظر قبول بمان.`
              : "درخواست بازی نداری؛ یک‌بار «لغو جستجو» بزن و دوباره وصل شو.",
            "",
            "اگر کسی وارد صف شود، خودکار وصل می‌شوید.",
            "لغو: «لغو جستجو»",
          ].join("\n"),
      { reply_markup: waitingKeyboard(lang) },
    );
    return;
  }

  // ۳) ورود به صف + ارسال درخواست به کاربران فعال
  await prisma.chatRequest.updateMany({
    where: { fromUserId: me.id, status: "pending" },
    data: { status: "cancelled" },
  });

  const now = new Date();
  const candidates = await prisma.user.findMany({
    where: {
      id: { not: me.id },
      registered: true,
      isActive: true,
      deletedAt: null,
      state: { not: "chatting" },
      telegramId: { lt: 9000000000n },
      OR: [{ chatSilentUntil: null }, { chatSilentUntil: { lte: now } }],
      ...(genderPref !== "any" ? { gender: genderPref } : {}),
    },
  });

  const scored = candidates
    .map((u) => ({ u, score: quickMatchScore(me, u, genderPref) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.u.lastActiveAt.getTime() - a.u.lastActiveAt.getTime(),
    );

  const MAX = 20;
  const targets = scored.slice(0, MAX).map((x) => x.u);

  await patchUser(me.id, { state: "waiting", chatPartnerId: null });

  if (!targets.length) {
    await ctx.reply(
      lang === "en"
        ? [
            "⚡ Quick chat",
            "",
            "You're in the queue.",
            `Filter: ${prefLabel}`,
            "No active users to request right now — when someone taps connect, you'll match automatically.",
            "Cancel: «Cancel search»",
          ].join("\n")
        : [
            "⚡ چت سریع",
            "",
            "وارد صف شدی.",
            `فیلتر: ${prefLabel}`,
            "فعلاً کاربر فعالی برای درخواست نیست — وقتی کسی «وصلم کن» بزند خودکار وصل می‌شوید.",
            "لغو: «لغو جستجو»",
          ].join("\n"),
      { reply_markup: waitingKeyboard(lang) },
    );
    return;
  }

  await ctx.reply(
    lang === "en"
      ? [
          "⚡ Quick chat",
          "",
          "You're in the queue.",
          `Filter: ${prefLabel}`,
          `Sending requests to up to ${targets.length} active users in the background.`,
          "Priority: online → closer (location/province/city)",
          "",
          "You'll connect when someone accepts — or when the next person joins the queue.",
          "Cancel: «Cancel search»",
        ].join("\n")
        : [
          "⚡ چت سریع",
          "",
          "وارد صف شدی.",
          `فیلتر: ${prefLabel}`,
          `درخواست به حداکثر ${targets.length} کاربر فعال در پس‌زمینه ارسال می‌شود.`,
          "اولویت: آنلاین → نزدیک‌تر (لوکیشن/استان/شهر)",
          "",
          "به‌محض قبول یکی — یا ورود نفر بعدی به صف — وصل می‌شوی.",
          "لغو: «لغو جستجو»",
        ].join("\n"),
    { reply_markup: waitingKeyboard(lang) },
  );

  // ارسال در پس‌زمینه تا ربات برای بقیه کاربران هنگ نکند
  const api = ctx.api;
  const fromId = me.id;
  void (async () => {
    let sent = 0;
    for (const target of targets) {
      try {
        const meNow = await prisma.user.findUnique({ where: { id: fromId } });
        if (!meNow || meNow.state !== "waiting") break;
        const result = await sendChatRequest(api, fromId, target.id, {
          source: "quick",
          silentPending: true,
        });
        if (result === "ok") sent++;
        if (sent > 0 && sent % 10 === 0) await sleep(300);
      } catch (err) {
        console.error("quick match send failed", target.id, err);
      }
    }
    try {
      const meNow = await prisma.user.findUnique({ where: { id: fromId } });
      if (!meNow || meNow.state !== "waiting" || meNow.telegramId >= 9000000000n) {
        return;
      }
      if (sent === 0) {
        await api.sendMessage(
          Number(meNow.telegramId),
          lang === "en"
            ? "Couldn't send request messages. You're still in the queue."
            : "ارسال درخواست ممکن نشد. هنوز در صف هستی.",
          { reply_markup: waitingKeyboard(lang) },
        );
      } else {
        await api.sendMessage(
          Number(meNow.telegramId),
          lang === "en"
            ? `✅ ${sent} request(s) sent. Waiting…`
            : `✅ ${sent} درخواست ارسال شد. منتظر بمون…`,
          { reply_markup: waitingKeyboard(lang) },
        );
      }
    } catch (err) {
      console.error("quick match notify failed", err);
    }
  })();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** امتیاز اولویت: آنلاین، لوکیشن، کشور، استان، شهر */
function quickMatchScore(
  me: {
    country: string | null;
    province: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
  },
  u: {
    gender: string | null;
    country: string | null;
    province: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    lastActiveAt: Date;
    boostUntil: Date | null;
    faceVerified: boolean;
  },
  genderPref: QuickMatchGender,
): number {
  let score = 0;
  const mins = (Date.now() - u.lastActiveAt.getTime()) / 60_000;
  if (mins <= 5) score += 12_000;
  else if (mins <= 15) score += 10_000;
  else if (mins <= 60) score += 7_000;
  else if (mins <= 60 * 24) score += 3_000;
  else score += Math.max(0, 1000 - mins);

  if (u.boostUntil && u.boostUntil.getTime() > Date.now()) score += 800;
  if (u.faceVerified) score += 150;

  if (genderPref !== "any" && u.gender === genderPref) {
    score += 500;
  }

  if (me.country && u.country && me.country === u.country) score += 400;
  if (me.province && u.province && me.province === u.province) score += 700;
  if (me.city && u.city && me.city === u.city) score += 900;

  if (
    me.latitude != null &&
    me.longitude != null &&
    u.latitude != null &&
    u.longitude != null
  ) {
    const km = haversineKm(me.latitude, me.longitude, u.latitude, u.longitude);
    if (km <= 5) score += 2_000;
    else if (km <= 20) score += 1_400;
    else if (km <= 50) score += 900;
    else if (km <= 100) score += 500;
    else score += Math.max(0, 300 - Math.floor(km / 10));
  }

  return score;
}

export type SendChatRequestOptions = {
  source?: "direct" | "quick" | string;
  /** اگر درخواست pending از قبل باشد، بدون اثر جانبی فقط pending برمی‌گرداند */
  silentPending?: boolean;
  /** به فرستنده پیام «ارسال شد / انقضا ۲ دقیقه» بده — پیش‌فرض: فقط برای direct */
  notifySender?: boolean;
};

export const CHAT_REQUEST_TTL_MS = 2 * 60 * 1000;

function isRequestExpired(req: { expiresAt: Date | null; createdAt: Date }) {
  const deadline =
    req.expiresAt?.getTime() ?? req.createdAt.getTime() + CHAT_REQUEST_TTL_MS;
  return Date.now() > deadline;
}

/** ارسال درخواست چت — بدون وصل مستقیم */
export async function sendChatRequest(
  api: Api,
  fromUserId: number,
  toUserId: number,
  options?: SendChatRequestOptions,
): Promise<
  | "ok"
  | "busy"
  | "missing"
  | "demo"
  | "self"
  | "pending"
  | "blocked"
  | "blocked_by"
  | "silent"
> {
  const source = options?.source ?? "direct";
  const notifySender =
    options?.notifySender ?? (source !== "quick" && !options?.silentPending);
  const a = await prisma.user.findUnique({ where: { id: fromUserId } });
  const b = await prisma.user.findUnique({ where: { id: toUserId } });
  if (!a || !b) return "missing";
  if (a.id === b.id) return "self";
  if (b.telegramId >= 9000000000n) return "demo";
  if (a.state === "chatting" || b.state === "chatting") return "busy";

  const { isChatSilent, ensureChatSilentState } = await import("./chatSilent.js");
  if (isChatSilent(b)) {
    // پاک‌سازی اگر منقضی شده
    const st = await ensureChatSilentState(b.id);
    if (st.silent) return "silent";
  }

  const { hasBlocked } = await import("./block.js");
  if (await hasBlocked(a.id, b.id)) return "blocked";
  if (await hasBlocked(b.id, a.id)) return "blocked_by";

  const existing = await prisma.chatRequest.findFirst({
    where: {
      fromUserId: a.id,
      toUserId: b.id,
      status: "pending",
    },
  });
  if (existing) {
    if (isRequestExpired(existing)) {
      await prisma.chatRequest.update({
        where: { id: existing.id },
        data: { status: "expired" },
      });
    } else {
      return "pending";
    }
  }

  const expiresAt = new Date(Date.now() + CHAT_REQUEST_TTL_MS);
  const req = await prisma.chatRequest.create({
    data: {
      fromUserId: a.id,
      toUserId: b.id,
      status: "pending",
      source,
      expiresAt,
    },
  });

  const recipientLang = langOf(b);
  const fromName = a.displayName ?? tr(recipientLang, "یک کاربر", "a user");
  const locFa = [
    cityLabel(a.city, "fa", a.country ?? "IR", a.province),
    provinceLabel(a.province, "fa", a.country ?? "IR"),
  ]
    .filter((x) => x && x !== "—")
    .join(" - ");
  const locEn = [
    cityLabel(a.city, "en", a.country ?? "IR", a.province),
    provinceLabel(a.province, "en", a.country ?? "IR"),
  ]
    .filter((x) => x && x !== "—")
    .join(", ");
  const title =
    source === "quick"
      ? t(recipientLang, "chat_req_quick")
      : t(recipientLang, "chat_req_title");
  const text = tr(
    recipientLang,
    [
      title,
      "",
      `از طرف: ${fromName}${a.age ? ` (${a.age})` : ""}`,
      a.userCode ? `آیدی: /user_${a.userCode}` : null,
      locFa ? `📍 ${locFa}` : null,
      a.faceVerified ? "✅ احرازچهره شده" : "🕶 بدون احراز",
      "",
      "قبول می‌کنی یا رد؟",
      "⏳ این درخواست تا ۲ دقیقه معتبر است.",
    ]
      .filter(Boolean)
      .join("\n"),
    [
      title,
      "",
      `From: ${fromName}${a.age ? ` (${a.age})` : ""}`,
      a.userCode ? `ID: /user_${a.userCode}` : null,
      locEn ? `📍 ${locEn}` : null,
      a.faceVerified ? "✅ Face verified" : "🕶 Not verified",
      "",
      "Accept or decline?",
      "⏳ This request is valid for 2 minutes.",
    ]
      .filter(Boolean)
      .join("\n"),
  );

  try {
    const {
      publicPhotoWithBadge,
      publicPhotoCacheKey,
      rememberPhotoFromMessage,
    } = await import("../lib/faceBadgePhoto.js");
    const photo = await publicPhotoWithBadge(api, a);
    const sent = await api.sendPhoto(Number(b.telegramId), photo, {
      caption: text,
      reply_markup: chatRequestKeyboard(req.id, recipientLang),
    });
    rememberPhotoFromMessage(publicPhotoCacheKey(a), sent);
    await prisma.chatRequest.update({
      where: { id: req.id },
      data: {
        toChatId: BigInt(sent.chat.id),
        toMessageId: sent.message_id,
      },
    });
  } catch (err) {
    console.error("chat request notify failed", err);
    await prisma.chatRequest.update({
      where: { id: req.id },
      data: { status: "cancelled" },
    });
    return "busy";
  }

  if (notifySender && a.telegramId < 9000000000n) {
    const senderLang = langOf(a);
    await api
      .sendMessage(
        Number(a.telegramId),
        t(senderLang, "request_sent"),
        { reply_markup: mainKeyboard(senderLang) },
      )
      .catch(() => undefined);
  }

  return "ok";
}

/** خط آیدی طرف مقابل برای پیام انقضای درخواست چت */
async function counterpartIdLine(
  lang: Lang,
  userId: number,
  currentCode?: string | null,
): Promise<string | null> {
  const code = await ensureUserCode(userId, currentCode);
  if (!code) return null;
  return tr(lang, `آیدی: /user_${code}`, `ID: /user_${code}`);
}

function withCounterpartId(base: string, idLine: string | null): string {
  return idLine ? `${base}\n${idLine}` : base;
}

/** منقضی‌کردن درخواست‌های pending قدیمی + اطلاع به فرستنده */
export async function expireStaleChatRequests(api: Api) {
  const now = new Date();
  const stale = await prisma.chatRequest.findMany({
    where: {
      status: "pending",
      OR: [
        { expiresAt: { lte: now } },
        {
          expiresAt: null,
          createdAt: { lte: new Date(Date.now() - CHAT_REQUEST_TTL_MS) },
        },
      ],
    },
    take: 20,
  });
  let n = 0;
  for (const req of stale) {
    await prisma.chatRequest.update({
      where: { id: req.id },
      data: { status: "expired" },
    });
    n++;
    const from = await prisma.user.findUnique({
      where: { id: req.fromUserId },
    });
    const recipient = await prisma.user.findUnique({
      where: { id: req.toUserId },
    });
    if (req.toChatId != null && req.toMessageId != null) {
      const recipientLang = langOf(recipient);
      // برای گیرنده: آیدی فرستنده (طرف مقابل)
      const fromIdLine = from
        ? await counterpartIdLine(recipientLang, from.id, from.userCode)
        : null;
      await api
        .editMessageReplyMarkup(Number(req.toChatId), req.toMessageId, {
          reply_markup: { inline_keyboard: [] },
        })
        .catch(() => undefined);
      await api
        .editMessageCaption(Number(req.toChatId), req.toMessageId, {
          caption: withCounterpartId(
            tr(
              recipientLang,
              "⏰ این درخواست چت منقضی شد.",
              "⏰ This chat request has expired.",
            ),
            fromIdLine,
          ),
        })
        .catch(() => undefined);
    }
    // برای quick اسپم نده؛ فقط direct
    if (req.source !== "quick") {
      if (from && from.telegramId < 9000000000n) {
        const fromLang = langOf(from);
        // برای فرستنده: آیدی گیرنده (طرف مقابل)
        const toIdLine = recipient
          ? await counterpartIdLine(fromLang, recipient.id, recipient.userCode)
          : null;
        await api
          .sendMessage(
            Number(from.telegramId),
            withCounterpartId(
              fromLang === "en"
                ? "⏰ Chat request expired (2 minutes passed without acceptance)."
                : "⏰ درخواست چت منقضی شد (۲ دقیقه گذشت و قبول نشد).",
              toIdLine,
            ),
            { reply_markup: mainKeyboard(fromLang) },
          )
          .catch(() => undefined);
      }
    }
  }
  return n;
}

export async function respondChatRequest(
  api: Api,
  requestId: number,
  toUserId: number,
  accept: boolean,
): Promise<"ok" | "missing" | "gone" | "busy" | "demo" | "no_coins"> {
  const req = await prisma.chatRequest.findUnique({ where: { id: requestId } });
  if (!req || req.toUserId !== toUserId) return "missing";
  if (req.status !== "pending") return "gone";
  if (isRequestExpired(req)) {
    await prisma.chatRequest.update({
      where: { id: req.id },
      data: { status: "expired" },
    });
    // اگر هنوز کپشن درخواست روی پیام گیرنده است، با آیدی فرستنده به‌روز کن
    if (req.toChatId != null && req.toMessageId != null) {
      const recipient = await prisma.user.findUnique({
        where: { id: req.toUserId },
      });
      const from = await prisma.user.findUnique({
        where: { id: req.fromUserId },
      });
      const recipientLang = langOf(recipient);
      const fromIdLine = from
        ? await counterpartIdLine(recipientLang, from.id, from.userCode)
        : null;
      await api
        .editMessageReplyMarkup(Number(req.toChatId), req.toMessageId, {
          reply_markup: { inline_keyboard: [] },
        })
        .catch(() => undefined);
      await api
        .editMessageCaption(Number(req.toChatId), req.toMessageId, {
          caption: withCounterpartId(
            tr(
              recipientLang,
              "⏰ این درخواست چت منقضی شد.",
              "⏰ This chat request has expired.",
            ),
            fromIdLine,
          ),
        })
        .catch(() => undefined);
    }
    return "gone";
  }

  if (!accept) {
    await prisma.chatRequest.update({
      where: { id: req.id },
      data: { status: "rejected" },
    });
    // برای چت سریع به ازای هر رد نوتیف نده (اسپم)
    if (req.source !== "quick") {
      const from = await prisma.user.findUnique({
        where: { id: req.fromUserId },
      });
      if (from && from.telegramId < 9000000000n) {
        const fromLang = langOf(from);
        await api
          .sendMessage(
            Number(from.telegramId),
            fromLang === "en"
              ? "❌ Your chat request was declined."
              : "❌ درخواست چت‌ات رد شد.",
            { reply_markup: mainKeyboard(fromLang) },
          )
          .catch(() => undefined);
      }
    }
    return "ok";
  }

  await prisma.chatRequest.update({
    where: { id: req.id },
    data: { status: "accepted" },
  });
  // بقیه درخواست‌های باز همین فرستنده لغو شود
  await cancelPendingFromUser(req.fromUserId, req.id);
  const result =
    req.source === "quick"
      ? await connectUsers(api, req.fromUserId, req.toUserId, {
          quickPayers: [req.fromUserId],
        })
      : await connectUsers(api, req.fromUserId, req.toUserId);
  if (result === "no_coins" && req.source === "quick") {
    // جستجوگر سکه نداشت — به گیرنده بگو وصل نشد
    const to = await prisma.user.findUnique({ where: { id: req.toUserId } });
    if (to && to.telegramId < 9000000000n) {
      const toLang = langOf(to);
      await api
        .sendMessage(
          Number(to.telegramId),
          toLang === "en"
            ? "Couldn't connect — the other person doesn't have enough coins."
            : "وصل نشد — طرف مقابل سکه کافی ندارد.",
          { reply_markup: mainKeyboard(toLang) },
        )
        .catch(() => undefined);
    }
    const from = await prisma.user.findUnique({ where: { id: req.fromUserId } });
    if (from && from.telegramId < 9000000000n) {
      await api
        .sendMessage(
          Number(from.telegramId),
          quickMatchInsufficientCoinsText(langOf(from), from.diamonds),
          { reply_markup: mainKeyboard(langOf(from)) },
        )
        .catch(() => undefined);
      if (from.state === "waiting") {
        await leaveQueueOrChat(api, from, false);
      }
    }
  }
  return result;
}

export async function connectUsers(
  api: Api,
  aId: number,
  bId: number,
  options?: { quickPayers?: number[] },
): Promise<"ok" | "busy" | "missing" | "demo" | "no_coins"> {
  const a = await prisma.user.findUnique({ where: { id: aId } });
  const b = await prisma.user.findUnique({ where: { id: bId } });
  if (!a || !b) return "missing";
  if (b.telegramId >= 9000000000n || a.telegramId >= 9000000000n) return "demo";
  if (a.state === "chatting" || b.state === "chatting") return "busy";
  if (aId === bId) return "busy";

  const quickPayers = [
    ...new Set((options?.quickPayers ?? []).filter((id) => id === aId || id === bId)),
  ];

  // Soft pre-check — hard atomic debit happens inside the claim transaction
  if (quickPayers.length) {
    for (const payerId of quickPayers) {
      const u = payerId === aId ? a : b;
      if (u.diamonds < QUICK_MATCH_COST) return "no_coins";
    }
  }

  await leaveQueueOrChat(api, a, true);
  await leaveQueueOrChat(api, b, true);

  // Atomic pair claim — both sides must still be free after leaveQueue.
  // Prevents A↔B and A↔C races from leaving mismatched partners.
  // Quick-match coin debit + QuickMatchCharge rows live in the same txn.
  let linked = false;
  try {
    linked = await prisma.$transaction(async (tx) => {
      const claimA = await tx.user.updateMany({
        where: {
          id: a.id,
          state: { not: "chatting" },
          OR: [{ chatPartnerId: null }, { chatPartnerId: b.id }],
        },
        data: {
          state: "chatting",
          chatPartnerId: b.id,
          chatsCount: { increment: 1 },
          secureChat: false,
        },
      });
      if (claimA.count !== 1) return false;
      const claimB = await tx.user.updateMany({
        where: {
          id: b.id,
          state: { not: "chatting" },
          OR: [{ chatPartnerId: null }, { chatPartnerId: a.id }],
        },
        data: {
          state: "chatting",
          chatPartnerId: a.id,
          chatsCount: { increment: 1 },
          secureChat: false,
        },
      });
      if (claimB.count !== 1) {
        await tx.user.update({
          where: { id: a.id },
          data: {
            state: "idle",
            chatPartnerId: null,
            secureChat: false,
            chatsCount: { decrement: 1 },
          },
        });
        return false;
      }

      if (quickPayers.length) {
        const paid = await debitQuickMatchPayersInTx(
          tx,
          quickPayers,
          a.id,
          b.id,
          QUICK_MATCH_COST,
        );
        if (!paid) {
          // rollback claims by throwing — transaction aborts
          throw new Error("QUICK_MATCH_NO_COINS");
        }
      }
      return true;
    });
  } catch (err) {
    if (err instanceof Error && err.message === "QUICK_MATCH_NO_COINS") {
      return "no_coins";
    }
    throw err;
  }
  if (!linked) return "busy";

  // لغو درخواست‌های pending باقی‌مانده از هر دو طرف
  await cancelPendingFromUser(a.id);
  await cancelPendingFromUser(b.id);
  clearQuickMatchPref(a.id);
  clearQuickMatchPref(b.id);

  const langA = langOf(a);
  const langB = langOf(b);
  // ReplyKeyboard MUST land on connect — otherwise users keep the main menu and
  // can't tap end-chat. Telegram can't mix Reply+Inline on one message, so:
  // 1) continue_chat + chattingKeyboard (retried), 2) chat_connected + inline.
  const inlineA = chattingInlineKeyboard(false, langA);
  const inlineB = chattingInlineKeyboard(false, langB);
  const replyA = chattingKeyboard(false, langA);
  const replyB = chattingKeyboard(false, langB);

  async function sendChatReplyKeyboard(
    chatId: number,
    lang: Lang,
    kb: ReturnType<typeof chattingKeyboard>,
  ): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await api.sendMessage(chatId, t(lang, "continue_chat"), {
          reply_markup: kb,
        });
        return;
      } catch (err) {
        console.error("connectUsers reply keyboard failed", {
          chatId,
          attempt,
          err,
        });
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      }
    }
  }

  await sendChatReplyKeyboard(Number(a.telegramId), langA, replyA);
  await sendChatReplyKeyboard(Number(b.telegramId), langB, replyB);

  const ma = await api.sendMessage(
    Number(a.telegramId),
    t(langA, "chat_connected"),
    { reply_markup: inlineA },
  );
  const mb = await api.sendMessage(
    Number(b.telegramId),
    t(langB, "chat_connected"),
    { reply_markup: inlineB },
  );

  await logPairMessages({
    aUserId: a.id,
    bUserId: b.id,
    aChatId: a.telegramId,
    bChatId: b.telegramId,
    aMessageId: ma.message_id,
    bMessageId: mb.message_id,
  });
  const { syncChattingUserMenu } = await import("../botMenu.js");
  void syncChattingUserMenu(api, a.telegramId);
  void syncChattingUserMenu(api, b.telegramId);

  if (quickPayers.length) {
    void notifyQuickMatchCharged(api, quickPayers).catch((err) =>
      console.error("quickMatch charge notify batch failed", err),
    );
  }
  return "ok";
}

export async function setSecureChat(
  api: Api,
  userId: number,
  enabled: boolean,
): Promise<boolean> {
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me || me.state !== "chatting" || !me.chatPartnerId) return false;
  const partner = await prisma.user.findUnique({
    where: { id: me.chatPartnerId },
  });
  if (!partner || partner.chatPartnerId !== me.id) return false;

  await patchUser(me.id, { secureChat: enabled });
  await patchUser(partner.id, { secureChat: enabled });

  const meLang = langOf(me);
  const partnerLang = langOf(partner);
  const text = enabled
    ? meLang === "en"
      ? "🔒 Secure chat enabled.\nFuture photos can't be saved/forwarded."
      : "🔒 چت امن فعال شد.\nعکس‌های بعدی قابل ذخیره/فوروارد نیستند."
    : meLang === "en"
      ? "🔓 Secure chat turned off."
      : "🔓 چت امن خاموش شد.";

  const partnerText = enabled
    ? partnerLang === "en"
      ? "🔒 Secure chat enabled.\nFuture photos can't be saved/forwarded."
      : "🔒 چت امن فعال شد.\nعکس‌های بعدی قابل ذخیره/فوروارد نیستند."
    : partnerLang === "en"
      ? "🔓 Secure chat turned off."
      : "🔓 چت امن خاموش شد.";

  const ma = await api.sendMessage(Number(me.telegramId), text, {
    reply_markup: chattingKeyboard(enabled, meLang),
  });
  const mb = await api.sendMessage(Number(partner.telegramId), partnerText, {
    reply_markup: chattingKeyboard(enabled, partnerLang),
  });
  await logPairMessages({
    aUserId: me.id,
    bUserId: partner.id,
    aChatId: me.telegramId,
    bChatId: partner.telegramId,
    aMessageId: ma.message_id,
    bMessageId: mb.message_id,
  });
  return true;
}

/** پیشنهاد پاک‌سازی برای کسی که خودش قطع کرده */
export async function offerWipeAfterEnd(
  api: Api,
  userId: number,
  partnerUserId: number,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.telegramId >= 9000000000n) return;
  const lang = langOf(user);
  const text = [
    t(lang, "chat_ended"),
    "",
    t(lang, "wipe_offer"),
    lang === "en"
      ? "If anything remains: Clear history on this chat."
      : "اگر چیزی باقی ماند: Clear history روی این چت.",
  ].join("\n");
  const m = await api.sendMessage(Number(user.telegramId), text, {
    reply_markup: wipeChatKeyboard(partnerUserId, lang),
  });
  await logChatMessage(user.id, partnerUserId, user.telegramId, m.message_id);
}
