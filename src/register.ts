import type { Context } from "grammy";
import { ensureUser, findByTelegram, patchUser } from "../db/users.js";
import { prisma } from "../db/prisma.js";
import {
  mainKeyboard,
  languageReplyKeyboard,
  countryReplyKeyboard,
  provinceReplyKeyboard,
  cityReplyKeyboard,
  genderReplyKeyboard,
  ageRangeReplyKeyboard,
  lookingReplyKeyboard,
  regNameKeyboard,
} from "../keyboards/main.js";
import { WELCOME_DIAMONDS } from "../data/packages.js";
import {
  iranRegionPrompt,
  cityLabel,
  provinceLabel,
} from "../data/locations.js";
import { langOf, t, welcomeSlogan, fullGuide } from "../i18n/index.js";
import { gateRegistrationJoin } from "../middleware/forceJoin.js";
import { checkProfileCompletionRewards } from "./profileCompletion.js";

const PREV_STEP: Record<string, string> = {
  language: "force_join",
  country: "language",
  province: "country",
  city: "province",
  gender: "city",
  age: "gender",
  name: "age",
  looking: "name",
};

export async function beginRegistration(ctx: Context, userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const canContinue = await gateRegistrationJoin(ctx, user);
  if (!canContinue) return;

  await patchUser(userId, { state: "language", registered: false });
  await ctx.reply(t("fa", "reg_welcome"), {
    reply_markup: languageReplyKeyboard(),
  });
}

/** نمایش UI مرحله فعلی ثبت‌نام */
export async function resumeRegistration(
  ctx: Context,
  user: {
    id: number;
    state: string;
    country: string | null;
    province: string | null;
    language?: string | null;
  },
) {
  const lang = langOf(user);
  switch (user.state) {
    case "force_join": {
      const { forceJoinPrompt, joinKeyboard, gateRegistrationJoin } =
        await import("../middleware/forceJoin.js");
      const full = await prisma.user.findUnique({ where: { id: user.id } });
      if (full) {
        await gateRegistrationJoin(ctx, full);
      } else {
        await ctx.reply(forceJoinPrompt(lang, true), {
          reply_markup: joinKeyboard(lang),
        });
      }
      break;
    }
    case "language":
      await ctx.reply(t(lang, "reg_lang"), {
        reply_markup: languageReplyKeyboard(),
      });
      break;
    case "country":
      await ctx.reply(t(lang, "reg_country"), {
        reply_markup: countryReplyKeyboard(true, lang),
      });
      break;
    case "province":
      await ctx.reply(
        (user.country ?? "IR") === "IR"
          ? iranRegionPrompt(lang)
          : t(lang, "reg_province"),
        {
          reply_markup: provinceReplyKeyboard(
            user.country ?? "IR",
            undefined,
            true,
            lang,
          ),
        },
      );
      break;
    case "city":
      if (!user.country || !user.province) {
        await beginRegistration(ctx, user.id);
        break;
      }
      await ctx.reply(t(lang, "reg_city"), {
        reply_markup: cityReplyKeyboard(user.country, user.province, true, lang),
      });
      break;
    case "gender":
      await ctx.reply(t(lang, "reg_gender"), {
        reply_markup: genderReplyKeyboard(true, lang),
      });
      break;
    case "age":
      await ctx.reply(t(lang, "reg_age"), {
        reply_markup: ageRangeReplyKeyboard(true, lang),
      });
      break;
    case "name":
      await ctx.reply(t(lang, "reg_name"), {
        reply_markup: regNameKeyboard(lang),
      });
      break;
    case "looking":
      await ctx.reply(t(lang, "reg_looking"), {
        reply_markup: lookingReplyKeyboard(true, lang),
      });
      break;
    case "location": {
      // مرحله قدیمی — لوکیشن دیگر در ثبت‌نام نیست
      const full = await prisma.user.findUnique({ where: { id: user.id } });
      if (full?.lookingFor) {
        await finishRegistration(ctx, user.id);
      } else {
        await patchUser(user.id, { state: "looking" });
        const fresh = await prisma.user.findUnique({ where: { id: user.id } });
        if (fresh) await resumeRegistration(ctx, fresh);
      }
      break;
    }
    default:
      await beginRegistration(ctx, user.id);
  }
}

/** بازگشت یک مرحله در ثبت‌نام */
export async function goBackRegistration(
  ctx: Context,
  user: {
    id: number;
    state: string;
    country: string | null;
    province: string | null;
    language?: string | null;
  },
) {
  const lang = langOf(user);
  if (user.state === "language" || textIsFirst(user.state)) {
    await ctx.reply(t(lang, "reg_lang"), {
      reply_markup: languageReplyKeyboard(),
    });
    return;
  }
  const prev = PREV_STEP[user.state];
  if (!prev) {
    await resumeRegistration(ctx, user);
    return;
  }

  const data: Record<string, unknown> = { state: prev };
  if (prev === "force_join") {
    data.language = null;
    data.country = null;
    data.province = null;
    data.city = null;
  } else if (prev === "language") {
    data.language = null;
    data.country = null;
    data.province = null;
    data.city = null;
  } else if (prev === "country") {
    data.country = null;
    data.province = null;
    data.city = null;
  } else if (prev === "province") {
    data.province = null;
    data.city = null;
  } else if (prev === "city") {
    data.city = null;
  } else if (prev === "gender") {
    data.gender = null;
  } else if (prev === "age") {
    data.age = null;
  } else if (prev === "name") {
    data.displayName = null;
  } else if (prev === "looking") {
    data.lookingFor = null;
  }

  await patchUser(user.id, data);
  const fresh = await prisma.user.findUnique({ where: { id: user.id } });
  if (!fresh) return;
  await ctx.reply(
    lang === "en"
      ? "↩️ Back to previous step — choose again:"
      : "↩️ برگشتی به مرحله قبل — دوباره انتخاب کن:",
    { reply_markup: { remove_keyboard: true } },
  );
  await resumeRegistration(ctx, fresh);
}

function textIsFirst(state: string) {
  return !PREV_STEP[state];
}

export async function requireRegistered(ctx: Context) {
  const from = ctx.from;
  if (!from) return null;
  let user = await findByTelegram(from.id);
  if (!user) {
    user = await ensureUser({
      telegramId: from.id,
      ...(from.username ? { username: from.username } : {}),
      ...(from.first_name ? { firstName: from.first_name } : {}),
    });
  }
  if (!user.registered) {
    const lang = langOf(user);
    await ctx.reply(
      lang === "en"
        ? "Please complete registration first.\nContinue from here:"
        : "اول باید ثبت‌نام را کامل کنی.\nاز همین‌جا ادامه بده:",
    );
    await resumeRegistration(ctx, user);
    return null;
  }

  if (user.deletedAt) {
    const lang = langOf(user);
    await ctx.reply(
      lang === "en"
        ? "This account was deleted. Send /start to create a new one."
        : "این حساب حذف شده. برای ساخت حساب جدید /start بزن.",
    );
    return null;
  }

  return user;
}

export async function finishRegistration(ctx: Context, userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  // Claim اتمی — جلوگیری از double welcome / double referral در race
  const claimed = await prisma.user.updateMany({
    where: { id: userId, registered: false },
    data: { state: "idle", registered: true, lastActiveAt: new Date() },
  });
  if (claimed.count !== 1) {
    return;
  }

  const { grantReferralBonusIfEligible } = await import("./referral.js");
  await grantReferralBonusIfEligible(userId);

  const lang = langOf(user);

  await ctx.reply(
    welcomeSlogan(lang, {
      displayName: user?.displayName ?? null,
      city: cityLabel(
        user?.city,
        lang,
        user?.country ?? "IR",
        user?.province,
      ),
      province: provinceLabel(
        user?.province,
        lang,
        user?.country ?? "IR",
      ),
      diamonds: WELCOME_DIAMONDS,
    }),
    { reply_markup: mainKeyboard(lang) },
  );

  await ctx.reply(fullGuide(lang), {
    reply_markup: mainKeyboard(lang),
  });

  if (ctx.from?.id) {
    const { syncIdleUserMenu } = await import("../botMenu.js");
    void syncIdleUserMenu(ctx.api, ctx.from.id);
  }

  const fresh = await prisma.user.findUnique({ where: { id: userId } });
  if (fresh) {
    await checkProfileCompletionRewards(userId, {
      api: ctx.api,
      telegramId: fresh.telegramId,
    });
  }
}
