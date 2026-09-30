import { Composer, InlineKeyboard } from "grammy";
import { ensureUser, findByTelegram, patchUser } from "../db/users.js";
import { prisma } from "../db/prisma.js";
import {
  mainKeyboard,
  REG,
  lookingReplyKeyboard,
  genderReplyKeyboard,
  ageReplyKeyboard,
  ageRangeReplyKeyboard,
  parseAgeRange,
  languageReplyKeyboard,
  countryReplyKeyboard,
  provinceReplyKeyboard,
  cityReplyKeyboard,
  regNameKeyboard,
} from "../keyboards/main.js";
import {
  beginRegistration,
  resumeRegistration,
  goBackRegistration,
  finishRegistration,
} from "../services/register.js";
import { leaveQueueOrChat } from "../services/match.js";
import { checkProfileCompletionRewards } from "../services/profileCompletion.js";
import {
  resolveCountry,
  resolveProvince,
  resolveCity,
  resolveIranRegion,
  iranRegionPrompt,
  regionLabel,
  provinceLabel,
  cityLabel,
} from "../data/locations.js";
import {
  langOf,
  t,
  parseGenderLabel,
  parseLookingLabel,
  isStepBack,
  REG_LABELS,
} from "../i18n/index.js";

function isAgeBack(text: string): boolean {
  return (
    text === REG_LABELS.fa.AGE_BACK || text === REG_LABELS.en.AGE_BACK
  );
}

function isRegionBack(text: string): boolean {
  return (
    text === REG_LABELS.fa.REGION_BACK || text === REG_LABELS.en.REGION_BACK
  );
}

export const startHandler = new Composer();

startHandler.command("start", async (ctx) => {
  const from = ctx.from;
  if (!from) return;

  const payload = ctx.match?.trim() || "";

  if (payload.startsWith("anon_")) {
    const anonCode = payload.slice(5);
    const me = await ensureUser({
      telegramId: from.id,
      ...(from.username ? { username: from.username } : {}),
      ...(from.first_name ? { firstName: from.first_name } : {}),
    });
    const target = await prisma.user.findUnique({ where: { anonCode } });
    if (!target || target.id === me.id) {
      const lang = langOf(me);
      await ctx.reply(
        lang === "en"
          ? "This anonymous link is not valid."
          : "این لینک پیام ناشناس معتبر نیست.",
      );
      return;
    }
    if (!me.registered) {
      const lang = langOf(me);
      await ctx.reply(
        lang === "en"
          ? "Register first to send an anonymous message."
          : "برای ارسال پیام ناشناس اول ثبت‌نام کن.",
      );
      await beginRegistration(ctx, me.id);
      return;
    }
    await patchUser(me.id, {
      state: "await_anon_msg",
      pendingAnonTo: anonCode,
    });
    const lang = langOf(me);
    await ctx.reply(
      lang === "en"
        ? [
            "🕵️‍♂️ Anonymous message",
            "",
            "Write and send your message.",
            "Your name won't be shown.",
            "Cancel: /cancel",
          ].join("\n")
        : [
            "🕵️‍♂️ پیام ناشناس",
            "",
            "متن پیام را بنویس و بفرست.",
            "اسمت نشان داده نمی‌شود.",
            "انصراف: /cancel",
          ].join("\n"),
    );
    return;
  }

  const referralCodeFromStart = payload.startsWith("ref_")
    ? payload.slice(4)
    : undefined;

  const user = await ensureUser({
    telegramId: from.id,
    ...(from.username ? { username: from.username } : {}),
    ...(from.first_name ? { firstName: from.first_name } : {}),
    ...(referralCodeFromStart ? { referralCodeFromStart } : {}),
  });

  if (user.bannedAt || user.state === "banned") {
    const lang = langOf(user);
    await ctx.reply(
      lang === "en"
        ? "🚫 Your account has been blocked by an admin.\nYou cannot use this bot."
        : "🚫 حسابت توسط ادمین مسدود شده است.\nامکان استفاده از ربات وجود ندارد.",
      { reply_markup: { remove_keyboard: true } },
    );
    return;
  }

  if (!user.registered) {
    if (user.state === "force_join") {
      const { gateRegistrationJoin } = await import("../middleware/forceJoin.js");
      await gateRegistrationJoin(ctx, user);
      return;
    }
    // اگر هنوز عضو کانال نشده و تازه شروع کرده
    if (user.state === "language" || !user.state || user.state === "idle") {
      const { gateRegistrationJoin } = await import("../middleware/forceJoin.js");
      const ok = await gateRegistrationJoin(ctx, user);
      if (!ok) return;
    }
    await resumeRegistration(ctx, user);
    return;
  }

  const { restoreUserSession } = await import("../services/sessionRestore.js");
  await restoreUserSession(ctx, user, { announce: true });
});

startHandler.command("cancel", async (ctx) => {
  const from = ctx.from;
  if (!from) return;
  const user = await findByTelegram(from.id);
  if (!user) return;
  const lang = langOf(user);
  if (
    user.state === "admin_give_code" ||
    user.state === "admin_give_amount" ||
    user.state === "admin_give_confirm" ||
    user.state === "admin_gift_all_amount" ||
    user.state === "admin_clear_photo_code" ||
    user.state === "admin_ban_code" ||
    user.state === "admin_unban_code"
  ) {
    await patchUser(user.id, { state: "idle", pendingAnonTo: null });
    await ctx.reply(t(lang, "cancelled"), {
      reply_markup: new InlineKeyboard().text("↩️ پنل ادمین", "adm:home"),
    });
    return;
  }
  if (user.state === "await_direct_msg" || user.pendingDirectTo) {
    const { chattingKeyboard } = await import("../keyboards/main.js");
    const { cancelDirectCompose } = await import("../services/directMsg.js");
    await cancelDirectCompose(user.id);
    const nextState = user.chatPartnerId ? "chatting" : "idle";
    await patchUser(user.id, { state: nextState, pendingDirectTo: null });
    await ctx.reply(
      lang === "en"
        ? "Direct message cancelled."
        : "ارسال پیام دایرکت لغو شد.",
      {
        reply_markup:
          nextState === "chatting"
            ? chattingKeyboard(user.secureChat, lang)
            : mainKeyboard(lang),
      },
    );
    return;
  }
  if (!user.registered) {
    await beginRegistration(ctx, user.id);
    return;
  }
  await leaveQueueOrChat(ctx.api, user, true);
  await patchUser(user.id, {
    state: "idle",
    pendingAnonTo: null,
    pendingDirectTo: null,
    pendingSellCard: null,
    pendingReportOther: null,
    chatPartnerId: null,
  });
  await ctx.reply(t(lang, "cancelled"), { reply_markup: mainKeyboard(lang) });
});

startHandler.command("end", async (ctx) => {
  const from = ctx.from;
  if (!from) return;
  const user = await findByTelegram(from.id);
  if (!user) return;
  const lang = langOf(user);
  if (user.state !== "chatting" && !user.chatPartnerId) {
    await ctx.reply(t(lang, "not_chatting"), {
      reply_markup: mainKeyboard(lang),
    });
    return;
  }
  const partnerId = user.chatPartnerId;
  await leaveQueueOrChat(ctx.api, user, true);
  await ctx.reply(t(lang, "chat_ended"), { reply_markup: mainKeyboard(lang) });
  if (partnerId) {
    const { offerWipeAfterEnd } = await import("../services/match.js");
    await offerWipeAfterEnd(ctx.api, user.id, partnerId);
  }
});

export const registerHandler = new Composer();

registerHandler.on("message:text", async (ctx, next) => {
  const from = ctx.from;
  if (!from) return next();
  const text = ctx.message.text.trim();
  if (text.startsWith("/")) return next();

  const user = await findByTelegram(from.id);
  if (!user) return next();

  const lang = langOf(user);

  if (!user.registered) {
    if (isStepBack(text)) {
      await goBackRegistration(ctx, user);
      return;
    }

    if (user.state === "language") {
      const language =
        text === REG.LANG_FA ? "fa" : text === REG.LANG_EN ? "en" : null;
      if (!language) {
        await ctx.reply(t("fa", "pick_from_buttons"), {
          reply_markup: languageReplyKeyboard(),
        });
        return;
      }
      await patchUser(user.id, { language, state: "country" });
      const nextLang = language === "en" ? "en" : "fa";
      await ctx.reply(
        nextLang === "en"
          ? `${t(nextLang, "reg_country")}\n(To go back: ↩️ Go back)`
          : `${t(nextLang, "reg_country")}\n(برای اصلاح: ↩️ بازگشت به قبل)`,
        { reply_markup: countryReplyKeyboard(true, nextLang) },
      );
      return;
    }

    if (user.state === "country") {
      const found = resolveCountry(text);
      if (!found) {
        await ctx.reply(t(lang, "pick_from_buttons"), {
          reply_markup: countryReplyKeyboard(true, lang),
        });
        return;
      }
      await patchUser(user.id, {
        country: found.id,
        province: null,
        city: null,
        state: "province",
      });
      await ctx.reply(
        found.id === "IR"
          ? iranRegionPrompt(lang)
          : t(lang, "reg_province"),
        {
          reply_markup: provinceReplyKeyboard(found.id, undefined, true, lang),
        },
      );
      return;
    }

    if (user.state === "province") {
      if (!user.country) {
        await resumeRegistration(ctx, user);
        return;
      }
      if (isRegionBack(text)) {
        await ctx.reply(
          user.country === "IR"
            ? iranRegionPrompt(lang)
            : lang === "en"
              ? "Choose a region:"
              : "منطقه را انتخاب کن:",
          {
            reply_markup: provinceReplyKeyboard(user.country, undefined, true, lang),
          },
        );
        return;
      }
      if (user.country === "IR") {
        const regionId = resolveIranRegion(text);
        if (regionId) {
          const rName = regionLabel(regionId, lang);
          await ctx.reply(
            lang === "en"
              ? [
                  `Provinces in region «${rName}»`,
                  "",
                  "Choose your province from the buttons:",
                ].join("\n")
              : [
                  `استان‌های منطقه «${rName}»`,
                  "",
                  "استان خودت را از دکمه‌ها انتخاب کن:",
                ].join("\n"),
            {
              reply_markup: provinceReplyKeyboard(
                user.country,
                regionId,
                true,
                lang,
              ),
            },
          );
          return;
        }
      }
      const provinceFa = resolveProvince(user.country, text);
      if (!provinceFa) {
        await ctx.reply(
          user.country === "IR"
            ? lang === "en"
              ? [
                  "First pick a region from the buttons.",
                  "Each button shows sample provinces.",
                  "",
                  iranRegionPrompt(lang),
                ].join("\n")
              : [
                  "اول منطقه را از دکمه‌ها بزن.",
                  "روی هر دکمه نمونه استان‌ها نوشته شده.",
                  "",
                  iranRegionPrompt(lang),
                ].join("\n")
            : t(lang, "pick_from_buttons"),
          {
            reply_markup: provinceReplyKeyboard(user.country, undefined, true, lang),
          },
        );
        return;
      }
      await patchUser(user.id, {
        province: provinceFa,
        city: null,
        state: "city",
      });
      const provShown = provinceLabel(provinceFa, lang, user.country);
      await ctx.reply(
        lang === "en"
          ? `4/8 — Choose your city in «${provShown}»:`
          : `۴/۸ — شهر را در «${provShown}» انتخاب کن:`,
        {
          reply_markup: cityReplyKeyboard(
            user.country,
            provinceFa,
            true,
            lang,
          ),
        },
      );
      return;
    }

    if (user.state === "city") {
      if (!user.country || !user.province) {
        await resumeRegistration(ctx, user);
        return;
      }
      const cityFa = resolveCity(user.country, user.province, text);
      if (!cityFa) {
        await ctx.reply(t(lang, "pick_from_buttons"), {
          reply_markup: cityReplyKeyboard(
            user.country,
            user.province,
            true,
            lang,
          ),
        });
        return;
      }
      await patchUser(user.id, { city: cityFa, state: "gender" });
      await ctx.reply(t(lang, "reg_gender"), {
        reply_markup: genderReplyKeyboard(true, lang),
      });
      return;
    }

    if (user.state === "gender") {
      const gender = parseGenderLabel(text);
      if (!gender) {
        await ctx.reply(t(lang, "pick_from_buttons"), {
          reply_markup: genderReplyKeyboard(true, lang),
        });
        return;
      }
      await patchUser(user.id, { gender, state: "age" });
      await ctx.reply(t(lang, "reg_age"), {
        reply_markup: ageRangeReplyKeyboard(true, lang),
      });
      return;
    }

    if (user.state === "age") {
      if (isAgeBack(text)) {
        await ctx.reply(t(lang, "reg_age"), {
          reply_markup: ageRangeReplyKeyboard(true, lang),
        });
        return;
      }
      const range = parseAgeRange(text);
      if (range) {
        await ctx.reply(
          lang === "en"
            ? `How old are you? (${range.label})`
            : `سنت چند سال است؟ (${range.label})`,
          { reply_markup: ageReplyKeyboard(range.from, range.to, true, lang) },
        );
        return;
      }
      const age = Number(text);
      if (!Number.isFinite(age) || age < 18 || age > 60) {
        await ctx.reply(t(lang, "pick_from_buttons"), {
          reply_markup: ageRangeReplyKeyboard(true, lang),
        });
        return;
      }
      await patchUser(user.id, { age, state: "name" });
      await ctx.reply(
        lang === "en"
          ? [
              `Age ${age} saved ✅`,
              "",
              t(lang, "reg_name"),
              "If the age is wrong, tap «↩️ Go back».",
            ].join("\n")
          : [
              `سن ${age} ثبت شد ✅`,
              "",
              "۷/۸ — یک نام نمایشی بنویس (مثلاً سارا یا آرمین):",
              "اگر سن اشتباه بود «↩️ بازگشت به قبل» را بزن.",
            ].join("\n"),
        { reply_markup: regNameKeyboard(lang) },
      );
      return;
    }

    if (user.state === "name") {
      if (text.length < 2 || text.length > 24) {
        await ctx.reply(
          lang === "en"
            ? "Name must be 2–24 characters."
            : "نام باید بین ۲ تا ۲۴ حرف باشد.",
          { reply_markup: regNameKeyboard(lang) },
        );
        return;
      }
      const { rejectForbiddenContact } = await import(
        "../services/contactGuard.js"
      );
      if (await rejectForbiddenContact(ctx, text, lang, ctx.message.entities)) {
        return;
      }
      await patchUser(user.id, { displayName: text, state: "looking" });
      await ctx.reply(t(lang, "reg_looking"), {
        reply_markup: lookingReplyKeyboard(true, lang),
      });
      return;
    }

    if (user.state === "looking") {
      const lookingFor = parseLookingLabel(text);
      if (!lookingFor) {
        await ctx.reply(t(lang, "pick_from_buttons"), {
          reply_markup: lookingReplyKeyboard(true, lang),
        });
        return;
      }
      await patchUser(user.id, { lookingFor });
      await finishRegistration(ctx, user.id);
      return;
    }

    if (user.state === "location") {
      if (user.lookingFor) {
        await finishRegistration(ctx, user.id);
      } else {
        await patchUser(user.id, { state: "looking" });
        await ctx.reply(t(lang, "reg_looking"), {
          reply_markup: lookingReplyKeyboard(true, lang),
        });
      }
      return;
    }

    await resumeRegistration(ctx, user);
    return;
  }

  if (user.state === "edit_age") {
    if (isAgeBack(text)) {
      await ctx.reply(t(lang, "reg_age"), {
        reply_markup: ageRangeReplyKeyboard(false, lang),
      });
      return;
    }
    const range = parseAgeRange(text);
    if (range) {
      await ctx.reply(
        lang === "en"
          ? `Exact age (${range.label}):`
          : `سن دقیق (${range.label}):`,
        { reply_markup: ageReplyKeyboard(range.from, range.to, false, lang) },
      );
      return;
    }
    const age = Number(text);
    if (!Number.isFinite(age) || age < 18 || age > 60) {
      await ctx.reply(t(lang, "pick_from_buttons"), {
        reply_markup: ageRangeReplyKeyboard(false, lang),
      });
      return;
    }
    await patchUser(user.id, { age, state: "idle" });
    await checkProfileCompletionRewards(user.id, {
      api: ctx.api,
      telegramId: user.telegramId,
    });
    await ctx.reply(
      lang === "en"
        ? `Age updated to ${age} ✅`
        : `سن روی ${age} به‌روز شد ✅`,
      { reply_markup: mainKeyboard(lang) },
    );
    return;
  }

  if (user.state === "edit_looking") {
    const lookingFor = parseLookingLabel(text);
    if (!lookingFor) {
      await ctx.reply(t(lang, "pick_from_buttons"), {
        reply_markup: lookingReplyKeyboard(false, lang),
      });
      return;
    }
    await patchUser(user.id, { lookingFor, state: "idle" });
    await checkProfileCompletionRewards(user.id, {
      api: ctx.api,
      telegramId: user.telegramId,
    });
    await ctx.reply(
      lang === "en" ? "Preference updated." : "علاقه به‌روز شد.",
      { reply_markup: mainKeyboard(lang) },
    );
    return;
  }

  if (user.state === "edit_gender") {
    const gender = parseGenderLabel(text);
    if (!gender) {
      await ctx.reply(t(lang, "pick_from_buttons"), {
        reply_markup: genderReplyKeyboard(false, lang),
      });
      return;
    }
    await patchUser(user.id, { gender, state: "idle" });
    await checkProfileCompletionRewards(user.id, {
      api: ctx.api,
      telegramId: user.telegramId,
    });
    await ctx.reply(
      gender === "female"
        ? lang === "en"
          ? "Gender: Female ✅"
          : "جنسیت: خانم ✅"
        : lang === "en"
          ? "Gender: Male ✅"
          : "جنسیت: آقا ✅",
      { reply_markup: mainKeyboard(lang) },
    );
    return;
  }

  return next();
});
