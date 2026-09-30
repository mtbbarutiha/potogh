import { prisma } from "../db/prisma.js";
import { normalizeLang, tr, type Lang } from "../i18n/index.js";
import { formatNum } from "../data/packages.js";
import { InlineKeyboard } from "grammy";
import type { Context } from "grammy";

/** تاریخ خیلی دور = سایلنت دائم */
export const CHAT_SILENT_PERMANENT_UNTIL = new Date("9999-12-31T23:59:59.000Z");

export const CHAT_SILENT_DURATIONS = {
  "1h": 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
} as const;

export type ChatSilentDurationKey = keyof typeof CHAT_SILENT_DURATIONS | "forever";

export function isPermanentSilentUntil(until: Date | null | undefined): boolean {
  if (!until) return false;
  // بیش از ۱۰ سال آینده = دائم
  return until.getTime() - Date.now() > 10 * 365 * 24 * 60 * 60 * 1000;
}

export function isChatSilent(
  user: { chatSilentUntil?: Date | null } | null | undefined,
  now = new Date(),
): boolean {
  if (!user?.chatSilentUntil) return false;
  return user.chatSilentUntil.getTime() > now.getTime();
}

/** اگر منقضی شده، فیلد را پاک می‌کند و false برمی‌گرداند */
export async function ensureChatSilentState(userId: number): Promise<{
  silent: boolean;
  until: Date | null;
  permanent: boolean;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { chatSilentUntil: true },
  });
  if (!user?.chatSilentUntil) {
    return { silent: false, until: null, permanent: false };
  }
  if (user.chatSilentUntil.getTime() <= Date.now()) {
    await prisma.user.update({
      where: { id: userId },
      data: { chatSilentUntil: null },
    });
    return { silent: false, until: null, permanent: false };
  }
  return {
    silent: true,
    until: user.chatSilentUntil,
    permanent: isPermanentSilentUntil(user.chatSilentUntil),
  };
}

export async function setChatSilent(
  userId: number,
  key: ChatSilentDurationKey,
): Promise<Date> {
  const until =
    key === "forever"
      ? CHAT_SILENT_PERMANENT_UNTIL
      : new Date(Date.now() + CHAT_SILENT_DURATIONS[key]);
  await prisma.user.update({
    where: { id: userId },
    data: { chatSilentUntil: until },
  });
  return until;
}

export async function clearChatSilent(userId: number) {
  await prisma.user.update({
    where: { id: userId },
    data: { chatSilentUntil: null },
  });
}

export function formatSilentRemaining(
  until: Date,
  lang: Lang | string | null = "fa",
): string {
  const L = normalizeLang(lang);
  if (isPermanentSilentUntil(until)) {
    return tr(L, "دائم (تا وقتی خودت خاموش کنی)", "Permanent (until you turn it off)");
  }
  const ms = Math.max(0, until.getTime() - Date.now());
  const totalMin = Math.ceil(ms / 60_000);
  if (totalMin < 60) {
    return tr(
      L,
      `${formatNum(totalMin)} دقیقه`,
      `${formatNum(totalMin)} min`,
    );
  }
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours < 48) {
    if (mins === 0) {
      return tr(L, `${formatNum(hours)} ساعت`, `${formatNum(hours)} h`);
    }
    return tr(
      L,
      `${formatNum(hours)} ساعت و ${formatNum(mins)} دقیقه`,
      `${formatNum(hours)} h ${formatNum(mins)} min`,
    );
  }
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  if (remH === 0) {
    return tr(L, `${formatNum(days)} روز`, `${formatNum(days)} day(s)`);
  }
  return tr(
    L,
    `${formatNum(days)} روز و ${formatNum(remH)} ساعت`,
    `${formatNum(days)} d ${formatNum(remH)} h`,
  );
}

export function formatSilentUntilClock(
  until: Date,
  lang: Lang | string | null = "fa",
): string {
  const L = normalizeLang(lang);
  if (isPermanentSilentUntil(until)) {
    return tr(L, "∞ دائم", "∞ Permanent");
  }
  return until.toLocaleString(L === "en" ? "en-GB" : "fa-IR", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  });
}

export function chatSilentKeyboard(
  silent: boolean,
  lang: Lang | string | null = "fa",
) {
  const L = normalizeLang(lang);
  const kb = new InlineKeyboard()
    .text(
      tr(L, "🔇 ۱ ساعت سایلنت", "🔇 Silent for 1 hour"),
      "silent:1h",
    )
    .primary()
    .row()
    .text(
      tr(L, "🔇 ۱ روز سایلنت", "🔇 Silent for 1 day"),
      "silent:1d",
    )
    .primary()
    .row()
    .text(
      tr(L, "🔇 سایلنت دائم", "🔇 Silent forever"),
      "silent:forever",
    )
    .primary()
    .row();
  if (silent) {
    kb.text(
      tr(L, "🔔 بازگشت به حالت عادی", "🔔 Back to normal"),
      "silent:off",
    )
      .success()
      .row();
  }
  kb.text(tr(L, "↩️ بازگشت به پروفایل", "↩️ Back to profile"), "prof:back")
    .primary();
  return kb;
}

export function silentPanelText(
  silent: boolean,
  until: Date | null,
  lang: Lang | string | null = "fa",
): string {
  const L = normalizeLang(lang);
  if (silent && until) {
    const permanent = isPermanentSilentUntil(until);
    return tr(
      L,
      [
        "🔇 حالت سایلنت درخواست چت",
        "",
        permanent
          ? "الان سایلنت دائم فعال است — درخواست چت برایت نمی‌آید."
          : "الان درخواست چت برایت نمی‌آید.",
        `⏱ ${permanent ? "مدت" : "باقی‌مانده"}: ${formatSilentRemaining(until, L)}`,
        permanent ? null : `📅 تا: ${formatSilentUntilClock(until, L)}`,
        "",
        permanent
          ? "تا وقتی خودت خاموش نکنی، همین‌طور می‌ماند."
          : "بعد از این زمان خودکار عادی می‌شود.",
        "هر وقت خواستی می‌توانی زودتر خاموش کنی.",
      ]
        .filter(Boolean)
        .join("\n"),
      [
        "🔇 Chat-request silent mode",
        "",
        permanent
          ? "Permanent silent is on — you won't receive chat requests."
          : "You won't receive chat requests right now.",
        `⏱ ${permanent ? "Duration" : "Remaining"}: ${formatSilentRemaining(until, L)}`,
        permanent ? null : `📅 Until: ${formatSilentUntilClock(until, L)}`,
        "",
        permanent
          ? "It stays on until you turn it off yourself."
          : "It turns off automatically after this time.",
        "You can also turn it off anytime.",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return tr(
    L,
    [
      "🔇 حالت سایلنت درخواست چت",
      "",
      "اگر سایلنت کنی، درخواست چت برایت نمی‌آید.",
      "می‌تونی ۱ ساعت، ۱ روز، یا دائم انتخاب کنی.",
      "درخواست‌کننده‌ها می‌توانند به‌جاش پیام دایرکت بفرستند.",
      "",
      "الان: 🔔 عادی (درخواست‌ها می‌آیند)",
    ].join("\n"),
    [
      "🔇 Chat-request silent mode",
      "",
      "While silent, you won't receive chat requests.",
      "Choose 1 hour, 1 day, or permanent.",
      "Others can still send you a direct message instead.",
      "",
      "Now: 🔔 Normal (requests arrive)",
    ].join("\n"),
  );
}

/** پیام به کسی که درخواست چت زده ولی طرف سایلنت است + دکمه دایرکت */
export function silentRejectMessage(
  targetName: string,
  lang: Lang | string | null = "fa",
): string {
  const L = normalizeLang(lang);
  return tr(
    L,
    [
      "🔇 این کاربر حالت سایلنت دارد.",
      "",
      `«${targetName}» الان درخواست چت قبول نمی‌کند.`,
      "ولی می‌تونی بهش پیام دایرکت بفرستی ✉️",
      "(سایلنت فقط درخواست‌چت را قطع می‌کند، نه دایرکت.)",
    ].join("\n"),
    [
      "🔇 This user is in silent mode.",
      "",
      `«${targetName}» is not accepting chat requests right now.`,
      "You can still send them a direct message ✉️",
      "(Silent mode only blocks chat requests, not DMs.)",
    ].join("\n"),
  );
}

export function silentRejectKeyboard(
  targetId: number,
  lang: Lang | string | null = "fa",
) {
  const L = normalizeLang(lang);
  return new InlineKeyboard()
    .text(
      tr(L, "✉️ پیام دایرکت", "✉️ Direct message"),
      `dm:start:${targetId}`,
    )
    .primary();
}

/** پاسخ استاندارد وقتی طرف سایلنت است */
export async function replySilentReject(
  ctx: Context,
  targetId: number,
  lang: Lang | string | null,
  opts?: { asAlert?: boolean },
) {
  const L = normalizeLang(lang);
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { displayName: true },
  });
  const name = target?.displayName ?? tr(L, "کاربر", "user");
  const text = silentRejectMessage(name, L);
  const kb = silentRejectKeyboard(targetId, L);

  if (opts?.asAlert && ctx.callbackQuery) {
    await ctx.answerCallbackQuery({
      text: tr(
        L,
        "کاربر سایلنت است — می‌تونی دایرکت بدی",
        "User is silent — you can DM",
      ),
      show_alert: true,
    });
  }

  await ctx.reply(text, { reply_markup: kb });
}
