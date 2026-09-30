import type { Api, Context } from "grammy";
import type { User } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { ensureUser, patchUser } from "../db/users.js";
import {
  mainKeyboard,
  chattingKeyboard,
  waitingKeyboard,
  searchPanelKeyboard,
  locationKeyboard,
  cancelKeyboard,
  cardReceiptReplyKeyboard,
} from "../keyboards/main.js";
import { langOf, t, tr } from "../i18n/index.js";
import { syncIdleUserMenu, syncChattingUserMenu } from "../botMenu.js";
import { resumeRegistration } from "./register.js";
import {
  cardInstructionsText,
  cardPaymentKeyboard,
  findPackage,
  getPendingCardOrder,
} from "./diamonds.js";

const REGISTRATION_STATES = new Set([
  "force_join",
  "language",
  "country",
  "province",
  "city",
  "gender",
  "age",
  "name",
  "looking",
  "location",
]);

const EXPLORE_STATES = new Set([
  "explore_province",
  "explore_age",
  "explore_new",
  "explore_nochats",
  "explore_popular",
  "explore_all",
]);

/**
 * States that may keep chatPartnerId without state==="chatting"
 * (e.g. composing a direct message from an active chat).
 */
const KEEP_CHAT_PARTNER_STATES = new Set([
  "chatting",
  "await_direct_msg",
]);

/** تعمیر وضعیت‌های گیرکرده برای یک کاربر */
export async function reconcileUserState(
  user: User,
  api?: Api,
): Promise<User> {
  if (user.state === "chatting") {
    if (!user.chatPartnerId) {
      const patched = await patchUser(user.id, {
        state: "idle",
        chatPartnerId: null,
        secureChat: false,
      });
      if (api) {
        void import("./chatEndWatch.js")
          .then(({ notifyChatEndWatchers }) =>
            notifyChatEndWatchers(api, user.id),
          )
          .catch((err) =>
            console.error("chatEndWatch reconcile notify failed", user.id, err),
          );
      }
      return patched;
    }
    const partner = await prisma.user.findUnique({
      where: { id: user.chatPartnerId },
    });
    // Only wipe when truly unlinked. Do NOT require partner.state==="chatting"
    // — connectUsers patches both sides in a transaction, but concurrent
    // touch/reconcile during DM compose or brief races must not bounce
    // the user to idle + main menu mid-chat.
    if (!partner || partner.chatPartnerId !== user.id) {
      const patched = await patchUser(user.id, {
        state: "idle",
        chatPartnerId: null,
        secureChat: false,
      });
      if (api) {
        void import("./chatEndWatch.js")
          .then(({ notifyChatEndWatchers }) =>
            notifyChatEndWatchers(api, user.id),
          )
          .catch((err) =>
            console.error("chatEndWatch reconcile notify failed", user.id, err),
          );
      }
      return patched;
    }
    return user;
  }

  // Keep partner while composing DM from an active chat
  if (KEEP_CHAT_PARTNER_STATES.has(user.state) && user.chatPartnerId != null) {
    return user;
  }

  if (user.chatPartnerId != null) {
    return patchUser(user.id, { chatPartnerId: null, secureChat: false });
  }

  return user;
}

export async function syncUserCommandMenu(api: Api, user: User): Promise<void> {
  if (user.state === "chatting" && user.chatPartnerId != null) {
    await syncChattingUserMenu(api, user.telegramId, user.language);
  } else if (user.registered) {
    await syncIdleUserMenu(api, user.telegramId, user.language);
  }
}

export type RestoreOptions = {
  /** پیام خوش‌آمد/وضعیت به کاربر */
  announce?: boolean;
};

/** کیبورد و منوی تلگرام را مطابق state فعلی برمی‌گرداند */
export async function restoreUserSession(
  ctx: Context,
  user: User,
  opts: RestoreOptions = {},
): Promise<User> {
  const fresh = await reconcileUserState(user, ctx.api);
  await syncUserCommandMenu(ctx.api, fresh);

  if (!opts.announce) return fresh;

  const lang = langOf(fresh);

  if (!fresh.registered) {
    if (REGISTRATION_STATES.has(fresh.state)) {
      await resumeRegistration(ctx, fresh);
    } else {
      const { beginRegistration } = await import("./register.js");
      await beginRegistration(ctx, fresh.id);
    }
    return fresh;
  }

  if (fresh.state === "chatting" && fresh.chatPartnerId != null) {
    if (fresh.pendingDirectTo) {
      await ctx.reply(
        tr(
          lang,
          "✉️ در حال نوشتن پیام دایرکت هستی (چت ناشناس باز است).\nمتن بنویس یا ویس بفرست 🎤 — یا بازگشت / /cancel",
          "✉️ Composing a direct message (anonymous chat still open).\nSend text or voice 🎤 — or Back / /cancel",
        ),
        { reply_markup: cancelKeyboard(lang) },
      );
      return fresh;
    }
    await ctx.reply(t(lang, "welcome_back_chat"), {
      reply_markup: chattingKeyboard(fresh.secureChat, lang),
    });
    return fresh;
  }

  if (fresh.state === "waiting") {
    await ctx.reply(t(lang, "welcome_back_waiting"), {
      reply_markup: waitingKeyboard(lang),
    });
    return fresh;
  }

  if (fresh.state === "await_anon_msg") {
    await ctx.reply(
      tr(
        lang,
        "🕵️‍♂️ در حال نوشتن پیام ناشناس هستی.\nمتن را بفرست یا /cancel",
        "🕵️‍♂️ Composing an anonymous message.\nSend text or /cancel",
      ),
      { reply_markup: cancelKeyboard(lang) },
    );
    return fresh;
  }

  if (fresh.state === "await_direct_msg" || fresh.pendingDirectTo) {
    await ctx.reply(
      tr(
        lang,
        "✉️ در حال نوشتن پیام دایرکت هستی.\nمتن بنویس یا ویس بفرست 🎤 — یا /cancel",
        "✉️ Composing a direct message.\nSend text or voice 🎤 — or /cancel",
      ),
      { reply_markup: cancelKeyboard(lang) },
    );
    return fresh;
  }

  if (fresh.state === "await_location" || fresh.state === "edit_location") {
    await ctx.reply(t(lang, "search_pick"), {
      reply_markup: locationKeyboard(lang),
    });
    return fresh;
  }

  if (EXPLORE_STATES.has(fresh.state)) {
    await ctx.reply(t(lang, "search_pick"), {
      reply_markup: searchPanelKeyboard(lang),
    });
    return fresh;
  }

  if (fresh.state === "await_card_receipt") {
    const pending = await getPendingCardOrder(fresh.id);
    const pkg = pending ? findPackage(pending.packageId) : null;
    await ctx.reply(
      pending
        ? cardInstructionsText(
            pending,
            pkg?.label ?? pending.packageId,
            lang,
          )
        : tr(
            lang,
            "رسید کارت‌به‌کارت را بفرست یا از منو دوباره بسته را انتخاب کن.",
            "Send your card receipt or pick a package again from the menu.",
          ),
      {
        reply_markup: pending
          ? cardPaymentKeyboard(pending.id, lang)
          : mainKeyboard(lang),
      },
    );
    if (pending) {
      await ctx.reply(tr(lang, "👇 برای ارسال رسید:", "👇 To send receipt:"), {
        reply_markup: cardReceiptReplyKeyboard(lang),
      });
    }
    return fresh;
  }

  if (fresh.state === "await_voucher_code") {
    await ctx.reply(
      tr(
        lang,
        "🎟 کد هدیه / ووچر را بفرست:",
        "🎟 Send your gift code / voucher:",
      ),
    );
    return fresh;
  }

  await ctx.reply(t(lang, "welcome_back"), {
    reply_markup: mainKeyboard(lang),
  });
  return fresh;
}

/** touch کاربر در هر آپدیت — lastActiveAt و پروفایل تلگرام */
export async function touchUserFromContext(ctx: Context): Promise<User | null> {
  const from = ctx.from;
  if (!from) return null;

  // مهم: middleware قبل از /start اجرا می‌شود. اگر deep-link معرف را اینجا
  // به ensureUser ندهیم، کاربر بدون referredById ساخته می‌شود و attribution از دست می‌رود.
  let referralCodeFromStart: string | undefined;
  const text =
    ctx.message && "text" in ctx.message && typeof ctx.message.text === "string"
      ? ctx.message.text
      : undefined;
  if (text) {
    const m = text.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/);
    const payload = m?.[1]?.trim();
    if (payload?.startsWith("ref_")) {
      const code = payload.slice(4).trim();
      if (code) referralCodeFromStart = code;
    }
  }

  const user = await ensureUser({
    telegramId: from.id,
    ...(from.username ? { username: from.username } : {}),
    ...(from.first_name ? { firstName: from.first_name } : {}),
    ...(referralCodeFromStart ? { referralCodeFromStart } : {}),
  });

  const before = `${user.state}:${user.chatPartnerId}:${user.registered}`;
  const reconciled = await reconcileUserState(user, ctx.api);
  const after = `${reconciled.state}:${reconciled.chatPartnerId}:${reconciled.registered}`;

  if (before !== after) {
    await syncUserCommandMenu(ctx.api, reconciled);
  }

  return reconciled;
}
