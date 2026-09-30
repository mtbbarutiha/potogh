import { Composer, InlineKeyboard } from "grammy";
import { findByTelegram, patchUser } from "../db/users.js";
import { requireRegistered } from "../services/register.js";
import { prisma } from "../db/prisma.js";
import {
  mainKeyboard,
  lookingReplyKeyboard,
  ageRangeReplyKeyboard,
  cancelKeyboard,
  locationKeyboard,
  editLocationKeyboard,
  giftDiamondsKeyboard,
} from "../keyboards/main.js";
import { formatNum, REFERRAL_BONUS, LIKE_GIFT_DIAMONDS, GIFT_AMOUNTS } from "../data/packages.js";
import { langOf } from "../i18n/index.js";
import {
  nextExploreProfile,
  exploreOptsFromState,
  sendSearchList,
  sendViewAllList,
  exploreOptsFromKey,
  promptSearchGender,
  runSearchWithGender,
} from "../services/explore.js";
import { sendChatRequest, respondChatRequest, setQuickMatchPref, tryQuickMatch } from "../services/match.js";
import { saveLocation } from "../services/nearby.js";
import { publicPhotoWithBadge } from "../lib/faceBadgePhoto.js";
import {
  cityLabel,
  provinceLabel,
  regionLabel,
} from "../data/locations.js";
import { earnHandler } from "../features/earn.js";
import { reportHandler } from "../features/report.js";

export const featuresHandler = new Composer();

// earn/report must stay mounted (before chatHandler in bot.ts).
// A prior rebuild dropped the features/index re-export and left these dead.
featuresHandler.use(earnHandler);
featuresHandler.use(reportHandler);

featuresHandler.callbackQuery(/^quick:g:(female|male|any)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const lang = langOf(user);
  if (user.state === "chatting") {
    await ctx.answerCallbackQuery({
      text: lang === "en" ? "You're in a chat" : "الان در چت هستی",
    });
    return;
  }
  const pref = ctx.match![1] as "female" | "male" | "any";
  setQuickMatchPref(user.id, pref);
  await ctx.answerCallbackQuery();
  await ctx
    .editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } })
    .catch(() => undefined);
  await tryQuickMatch(ctx, user.id);
});

featuresHandler.callbackQuery("quick:cancel", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const lang = langOf(user);
  await ctx.answerCallbackQuery({ text: lang === "en" ? "Cancelled" : "انصراف" });
  await ctx
    .editMessageText(
      lang === "en" ? "Quick chat cancelled." : "چت سریع لغو شد.",
    )
    .catch(async () => {
      await ctx.reply(
        lang === "en" ? "Quick chat cancelled." : "چت سریع لغو شد.",
        { reply_markup: mainKeyboard(lang) },
      );
    });
});

featuresHandler.callbackQuery(/^open:(.+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const code = ctx.match[1]!;
  await ctx.answerCallbackQuery();
  const { showProfileByUserCode } = await import("../services/explore.js");
  await showProfileByUserCode(ctx, user.id, code);
});

/** صفحه‌بندی لیست فشرده: upage:c|n|s:key|a:key:page */
featuresHandler.callbackQuery(/^upage:(.+):(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const scope = ctx.match[1]!;
  const page = Number(ctx.match[2]);
  await ctx.answerCallbackQuery();

  if (scope === "c") {
    const { sendContactsList } = await import("../services/contacts.js");
    await sendContactsList(ctx, user.id, page, true);
    return;
  }
  if (scope === "n") {
    const { askNearbyRadius } = await import("../services/nearbyUi.js");
    await askNearbyRadius(ctx, user.language);
    return;
  }
  if (scope.startsWith("s:")) {
    const key = scope.slice(2);
    await sendSearchList(ctx, user.id, exploreOptsFromKey(key), 100, page, true);
    return;
  }
  if (scope.startsWith("a:")) {
    const key = scope.slice(2);
    await sendViewAllList(
      ctx,
      user.id,
      { ...exploreOptsFromKey(key), ignoreLookingFor: true },
      100,
      page,
      true,
    );
  }
});

featuresHandler.callbackQuery("search:province", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  await promptSearchGender(ctx, user.id, "province");
});

featuresHandler.callbackQuery("search:all", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  await promptSearchGender(ctx, user.id, "all");
});

featuresHandler.callbackQuery(/^search:viewall:(.+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const key = ctx.match[1]!;
  await ctx.answerCallbackQuery();
  await sendViewAllList(ctx, user.id, {
    ...exploreOptsFromKey(key, user.id),
    ignoreLookingFor: true,
  });
});

featuresHandler.callbackQuery(/^search:(next|skip):(.+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const key = ctx.match[2]!;
  await ctx.answerCallbackQuery();
  await nextExploreProfile(ctx, user.id, exploreOptsFromKey(key, user.id));
});

featuresHandler.callbackQuery("search:age", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  await promptSearchGender(ctx, user.id, "age");
});

featuresHandler.callbackQuery("search:new", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  await promptSearchGender(ctx, user.id, "new");
});

featuresHandler.callbackQuery("search:nochats", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  await promptSearchGender(ctx, user.id, "nochats");
});

featuresHandler.callbackQuery(/^search:g:(female|male|any)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const gender = ctx.match![1] as "female" | "male" | "any";
  await ctx.answerCallbackQuery();
  await ctx
    .editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } })
    .catch(() => undefined);
  await runSearchWithGender(ctx, user.id, gender);
});

featuresHandler.callbackQuery("search:g:cancel", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const lang = langOf(user);
  await ctx.answerCallbackQuery({ text: lang === "en" ? "Cancelled" : "انصراف" });
  await ctx
    .editMessageText(lang === "en" ? "Search cancelled." : "جستجو لغو شد.")
    .catch(async () => {
      await ctx.reply(lang === "en" ? "Search cancelled." : "جستجو لغو شد.", {
        reply_markup: mainKeyboard(lang),
      });
    });
});

featuresHandler.callbackQuery("search:popular", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  await sendSearchList(ctx, user.id, { popular: true });
});

featuresHandler.callbackQuery("search:gps", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  await patchUser(user.id, { state: "await_location" });
  await ctx.reply(
    "📍 موقعیتت را بفرست تا افراد نزدیک را ببینی.",
    { reply_markup: locationKeyboard() },
  );
});

featuresHandler.callbackQuery("search:special", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await patchUser(user.id, { state: "await_special" });
  await ctx.answerCallbackQuery();
  await ctx.reply(
    [
      "💌 وصل به مخاطب خاص",
      "",
      "لینک ناشناس یا کد ناشناس مخاطبت را بفرست.",
      "مثال: https://t.me/Patoghchatbot?start=anon_xxxx",
      "یا فقط کد: xxxx",
    ].join("\n"),
    { reply_markup: cancelKeyboard() },
  );
});

featuresHandler.callbackQuery("search:advanced", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const lang = user.language === "en" ? "en" : "fa";
  const {
    clearAdvDraft,
    advGenderKeyboard,
  } = await import("../services/advancedSearch.js");
  clearAdvDraft(user.id);
  await ctx.answerCallbackQuery();
  await ctx.reply(
    lang === "en"
      ? "🔍 Advanced search\n\nStep 1/4 — Who should I show you?"
      : "🔍 جستجوی پیشرفته\n\nمرحله ۱ از ۴ — چه کسانی را نشونت بدم؟",
    { reply_markup: advGenderKeyboard(lang) },
  );
});

featuresHandler.callbackQuery("adv:cancel", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const { clearAdvDraft } = await import("../services/advancedSearch.js");
  clearAdvDraft(user.id);
  await ctx.answerCallbackQuery({ text: "لغو شد" });
  const lang = user.language === "en" ? "en" : "fa";
  await ctx
    .editMessageText(
      lang === "en" ? "Advanced search cancelled." : "جستجوی پیشرفته لغو شد.",
    )
    .catch(() => undefined);
  await ctx.reply(
    lang === "en" ? "Back to main menu." : "برگشتی به منوی اصلی.",
    { reply_markup: mainKeyboard(lang) },
  );
});

featuresHandler.callbackQuery(/^adv:g:(female|male|any)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const lang = user.language === "en" ? "en" : "fa";
  const gender = ctx.match![1] as "female" | "male" | "any";
  const {
    setAdvDraft,
    advLocationKeyboard,
  } = await import("../services/advancedSearch.js");
  setAdvDraft(user.id, { gender });
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    lang === "en"
      ? "🔍 Advanced search\n\nStep 2/4 — Province & city?"
      : "🔍 جستجوی پیشرفته\n\nمرحله ۲ از ۴ — استان و شهرش چی باشه؟",
    { reply_markup: advLocationKeyboard(user.province, lang) },
  ).catch(async () => {
    await ctx.reply(
      lang === "en"
        ? "Step 2/4 — Province & city?"
        : "مرحله ۲ از ۴ — استان و شهرش چی باشه؟",
      { reply_markup: advLocationKeyboard(user.province, lang) },
    );
  });
});

featuresHandler.callbackQuery("adv:back:gender", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const lang = user.language === "en" ? "en" : "fa";
  const { advGenderKeyboard } = await import("../services/advancedSearch.js");
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    lang === "en"
      ? "Step 1/4 — Who should I show you?"
      : "مرحله ۱ از ۴ — چه کسانی را نشونت بدم؟",
    { reply_markup: advGenderKeyboard(lang) },
  ).catch(() => undefined);
});

featuresHandler.callbackQuery("adv:back:loc", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const lang = user.language === "en" ? "en" : "fa";
  const { advLocationKeyboard } = await import("../services/advancedSearch.js");
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    lang === "en"
      ? "Step 2/4 — Province & city?"
      : "مرحله ۲ از ۴ — استان و شهرش چی باشه؟",
    { reply_markup: advLocationKeyboard(user.province, lang) },
  ).catch(() => undefined);
});

featuresHandler.callbackQuery("adv:back:age", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const lang = user.language === "en" ? "en" : "fa";
  const { advAgeKeyboard } = await import("../services/advancedSearch.js");
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    lang === "en"
      ? "Step 3/4 — Age range?"
      : "مرحله ۳ از ۴ — بازه سنی؟",
    { reply_markup: advAgeKeyboard(lang) },
  ).catch(() => undefined);
});

featuresHandler.callbackQuery("adv:loc:mine", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const lang = user.language === "en" ? "en" : "fa";
  if (!user.province) {
    await ctx.answerCallbackQuery({ text: "استان ثبت نشده", show_alert: true });
    return;
  }
  const {
    setAdvDraft,
    advAgeKeyboard,
  } = await import("../services/advancedSearch.js");
  setAdvDraft(user.id, {
    province: user.province,
    city: user.city ?? null,
  });
  await ctx.answerCallbackQuery();
  const locShown =
    lang === "en"
      ? [
          user.city
            ? cityLabel(user.city, "en", user.country ?? "IR", user.province)
            : null,
          provinceLabel(user.province, "en", user.country ?? "IR"),
        ]
          .filter(Boolean)
          .join(", ")
      : [
          user.city ?? null,
          user.province,
        ]
          .filter(Boolean)
          .join("، ");
  await ctx.editMessageText(
    lang === "en"
      ? `Location: ${locShown}\n\nStep 3/4 — Age range?`
      : `مکان: ${locShown}\n\nمرحله ۳ از ۴ — بازه سنی؟`,
    { reply_markup: advAgeKeyboard(lang) },
  ).catch(() => undefined);
});

featuresHandler.callbackQuery("adv:loc:any", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const lang = user.language === "en" ? "en" : "fa";
  const {
    setAdvDraft,
    advAgeKeyboard,
  } = await import("../services/advancedSearch.js");
  setAdvDraft(user.id, { province: null, city: null });
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    lang === "en"
      ? "Location: all Iran\n\nStep 3/4 — Age range?"
      : "مکان: همه ایران\n\nمرحله ۳ از ۴ — بازه سنی؟",
    { reply_markup: advAgeKeyboard(lang) },
  ).catch(() => undefined);
});

featuresHandler.callbackQuery("adv:loc:pick", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const lang = user.language === "en" ? "en" : "fa";
  const { advRegionKeyboard } = await import("../services/advancedSearch.js");
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    lang === "en"
      ? "Pick a region first:"
      : "اول منطقه را انتخاب کن:",
    { reply_markup: advRegionKeyboard(lang) },
  ).catch(() => undefined);
});

featuresHandler.callbackQuery(/^adv:reg:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const lang = user.language === "en" ? "en" : "fa";
  const regionIndex = Number(ctx.match![1]);
  const {
    advProvinceKeyboard,
    resolveRegionByIndex,
  } = await import("../services/advancedSearch.js");
  const region = resolveRegionByIndex(regionIndex);
  if (!region) {
    await ctx.answerCallbackQuery({ text: "نامعتبر" });
    return;
  }
  const { kb } = advProvinceKeyboard(regionIndex, lang);
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    lang === "en"
      ? `Region: ${regionLabel(region, "en")}\nPick a province:`
      : `منطقه: ${regionLabel(region, "fa")}\nاستان را انتخاب کن:`,
    { reply_markup: kb },
  ).catch(() => undefined);
});

featuresHandler.callbackQuery(/^adv:pv:(\d+):(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const lang = user.language === "en" ? "en" : "fa";
  const regionIndex = Number(ctx.match![1]);
  const provinceIndex = Number(ctx.match![2]);
  const {
    resolveProvinceByIndex,
    setAdvDraft,
    advCityKeyboard,
  } = await import("../services/advancedSearch.js");
  const province = resolveProvinceByIndex(regionIndex, provinceIndex);
  if (!province) {
    await ctx.answerCallbackQuery({ text: "نامعتبر" });
    return;
  }
  setAdvDraft(user.id, { province, city: null });
  const { kb } = advCityKeyboard(province, lang);
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    lang === "en"
      ? `Province: ${provinceLabel(province, "en")}\nPick a city:`
      : `استان: ${province}\nشهر را انتخاب کن:`,
    { reply_markup: kb },
  ).catch(() => undefined);
});

featuresHandler.callbackQuery(/^adv:ct:(all|\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const lang = user.language === "en" ? "en" : "fa";
  const {
    getAdvDraft,
    setAdvDraft,
    advCityKeyboard,
    advAgeKeyboard,
  } = await import("../services/advancedSearch.js");
  const draft = getAdvDraft(user.id);
  if (!draft.province) {
    await ctx.answerCallbackQuery({ text: "اول استان را انتخاب کن", show_alert: true });
    return;
  }
  const token = ctx.match![1]!;
  if (token === "all") {
    setAdvDraft(user.id, { city: null });
  } else {
    const { cities } = advCityKeyboard(draft.province, lang);
    const city = cities[Number(token)];
    if (!city) {
      await ctx.answerCallbackQuery({ text: "نامعتبر" });
      return;
    }
    setAdvDraft(user.id, { city });
  }
  const d = getAdvDraft(user.id);
  await ctx.answerCallbackQuery();
  const locEn = [
    d.city ? cityLabel(d.city, "en", "IR", d.province) : "all cities",
    provinceLabel(d.province, "en"),
  ].join(", ");
  const locFa = [
    d.city ?? "همه شهرها",
    d.province,
  ].join("، ");
  await ctx.editMessageText(
    lang === "en"
      ? `Location: ${locEn}\n\nStep 3/4 — Age range?`
      : `مکان: ${locFa}\n\nمرحله ۳ از ۴ — بازه سنی؟`,
    { reply_markup: advAgeKeyboard(lang) },
  ).catch(() => undefined);
});

featuresHandler.callbackQuery(/^adv:age:(all|\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const lang = user.language === "en" ? "en" : "fa";
  const {
    setAdvDraft,
    advOnlineKeyboard,
  } = await import("../services/advancedSearch.js");
  const { AGE_RANGES_I18N } = await import("../i18n/buttons.js");
  const token = ctx.match![1]!;
  if (token === "all") {
    setAdvDraft(user.id, { ageMin: null, ageMax: null });
  } else {
    const range = AGE_RANGES_I18N[lang][Number(token)];
    if (!range) {
      await ctx.answerCallbackQuery({ text: "نامعتبر" });
      return;
    }
    setAdvDraft(user.id, { ageMin: range.from, ageMax: range.to });
  }
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    lang === "en"
      ? "Step 4/4 — Last online time?"
      : "مرحله ۴ از ۴ — آخرین زمان آنلاین؟",
    { reply_markup: advOnlineKeyboard(lang) },
  ).catch(() => undefined);
});

featuresHandler.callbackQuery(/^adv:on:(all|\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const lang = user.language === "en" ? "en" : "fa";
  const token = ctx.match![1]!;
  const {
    setAdvDraft,
    getAdvDraft,
    clearAdvDraft,
    advDraftToExploreOpts,
    summarizeDraft,
  } = await import("../services/advancedSearch.js");
  setAdvDraft(user.id, {
    onlineHours: token === "all" ? null : Number(token),
  });
  const draft = getAdvDraft(user.id);
  const opts = advDraftToExploreOpts(draft);
  await ctx.answerCallbackQuery({ text: "در حال جستجو…" });
  await ctx
    .editMessageText(
      [
        lang === "en" ? "✅ Filters ready" : "✅ فیلترها آماده شد",
        "",
        summarizeDraft(draft, lang),
        "",
        lang === "en" ? "Searching…" : "در حال جستجو…",
      ].join("\n"),
    )
    .catch(() => undefined);
  clearAdvDraft(user.id);
  await sendSearchList(ctx, user.id, opts);
});

// سازگاری قدیمی — اگر جایی هنوز search:adv مانده
featuresHandler.callbackQuery(/^search:adv:(female|male|any)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const looking = ctx.match![1] as "female" | "male" | "any";
  await ctx.answerCallbackQuery();
  const {
    clearAdvDraft,
    setAdvDraft,
    advLocationKeyboard,
  } = await import("../services/advancedSearch.js");
  clearAdvDraft(user.id);
  setAdvDraft(user.id, { gender: looking });
  const lang = user.language === "en" ? "en" : "fa";
  await ctx.reply(
    lang === "en"
      ? "Step 2/4 — Province & city?"
      : "مرحله ۲ از ۴ — استان و شهرش چی باشه؟",
    { reply_markup: advLocationKeyboard(user.province, lang) },
  );
});

featuresHandler.callbackQuery("search:recent", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  const recent = await prisma.interaction.findMany({
    where: { fromUserId: user.id, type: { in: ["like", "view"] } },
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { toUser: true },
  });
  const seen = new Set<number>();
  const lines: string[] = [];
  for (const i of recent) {
    if (seen.has(i.toUserId) || i.toUser.deletedAt) continue;
    seen.add(i.toUserId);
    const n = i.toUser.displayName ?? "ناشناس";
    lines.push(`• ${n} (${i.type === "like" ? "❤️" : "👁"})`);
    if (lines.length >= 5) break;
  }
  if (!lines.length) {
    await ctx.reply("هنوز چت/بازدید اخیری نداری.", {
      reply_markup: mainKeyboard(),
    });
    return;
  }
  await ctx.reply(
    ["👀 تعاملات اخیر تو:", "", ...lines, "", "برای دیدن پروفایل‌های جدید از جستجو استفاده کن."].join(
      "\n",
    ),
    { reply_markup: mainKeyboard() },
  );
});

featuresHandler.callbackQuery("pro:buy", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const cost = 200;
  const { debitCoins } = await import("../services/coins.js");
  const ok = await debitCoins(user.id, cost);
  if (!ok) {
    await ctx.answerCallbackQuery({ text: "سکه کافی نیست" });
    return;
  }
  await patchUser(user.id, { isPro: true });
  await ctx.answerCallbackQuery({ text: "پرو فعال شد" });
  await ctx.reply("🅿️ اشتراک پرو فعال شد!", {
    reply_markup: mainKeyboard(),
  });
});

/** ❤️ {count} — اگر لایک نشده لایک می‌کند؛ اگر قبلاً لایک شده تعداد را نشان می‌دهد */
featuresHandler.callbackQuery(/^exp:likes?:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const targetId = Number(ctx.match[1]);
  if (targetId === user.id) {
    const self = await prisma.user.findUnique({ where: { id: targetId } });
    await ctx.answerCallbackQuery({
      text: `❤️ ${formatNum(self?.likesCount ?? 0)} لایک`,
      show_alert: true,
    });
    return;
  }

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target || target.deletedAt) {
    if (target?.deletedAt) {
      const { notifyTargetAccountDeleted } = await import("../services/account.js");
      await notifyTargetAccountDeleted(ctx, langOf(user));
      return;
    }
    await ctx.answerCallbackQuery({
      text: langOf(user) === "en" ? "User not found" : "کاربر پیدا نشد",
    });
    return;
  }

  const already = await prisma.interaction.findFirst({
    where: { type: "like", fromUserId: user.id, toUserId: targetId },
  });
  if (already) {
    await ctx.answerCallbackQuery({
      text: `❤️ ${formatNum(target.likesCount)} لایک`,
      show_alert: true,
    });
    return;
  }

  if (user.diamonds < LIKE_GIFT_DIAMONDS) {
    await ctx.answerCallbackQuery({ text: "سکه کافی نیست" });
    await ctx.reply(
      `برای لایک به ${formatNum(LIKE_GIFT_DIAMONDS)} سکه نیاز داری.\nموجودی: ${formatNum(user.diamonds)} 💰`,
    );
    return;
  }

  try {
    const liked = await prisma.$transaction(async (tx) => {
      const debited = await tx.user.updateMany({
        where: {
          id: user.id,
          diamonds: { gte: LIKE_GIFT_DIAMONDS },
          deletedAt: null,
        },
        data: { diamonds: { decrement: LIKE_GIFT_DIAMONDS } },
      });
      if (debited.count !== 1) return false;
      await tx.interaction.create({
        data: { type: "like", fromUserId: user.id, toUserId: targetId },
      });
      await tx.user.update({
        where: { id: targetId },
        data: {
          likesCount: { increment: 1 },
          diamonds: { increment: LIKE_GIFT_DIAMONDS },
        },
      });
      return true;
    });
    if (!liked) {
      await ctx.answerCallbackQuery({ text: "سکه کافی نیست" });
      return;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/Unique constraint|unique/i.test(msg)) {
      await ctx.answerCallbackQuery({
        text: `❤️ ${formatNum(target.likesCount)} لایک`,
        show_alert: true,
      });
      return;
    }
    throw err;
  }

  const fromName = user.displayName ?? "یک کاربر";
  if (target.telegramId < 9000000000n) {
    await ctx.api
      .sendMessage(
        Number(target.telegramId),
        [
          "❤️ یک لایک جدید گرفتی!",
          `از طرف: ${fromName}`,
          `🎁 ${formatNum(LIKE_GIFT_DIAMONDS)} سکه به حسابت هدیه شد.`,
          "",
          "جزئیات در پروفایل ← تعاملات",
        ].join("\n"),
      )
      .catch(() => undefined);
  }

  await ctx.answerCallbackQuery({ text: "لایک + هدیه سکه ارسال شد" });
  await ctx.reply(
    `❤️ لایک ثبت شد.\n🎁 ${formatNum(LIKE_GIFT_DIAMONDS)} سکه برای «${target.displayName ?? "کاربر"}» هدیه شد.`,
  );
  await nextExploreProfile(ctx, user.id, {
    ...exploreOptsFromState(user.state),
  });
});

featuresHandler.callbackQuery(/^exp:thread:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const targetId = Number(ctx.match[1]);
  const lang = user.language === "en" ? "en" : "fa";
  const {
    sendThreadGift,
    threadGiftSenderConfirm,
    threadGiftInsufficient,
  } = await import("../services/threadGift.js");

  const result = await sendThreadGift(ctx.api, user, targetId);

  if (result === "self") {
    await ctx.answerCallbackQuery({
      text: lang === "en" ? "Can't thread yourself" : "به خودت نمی‌توانی نخ بدهی",
    });
    return;
  }
  if (result === "missing") {
    await ctx.answerCallbackQuery({
      text: lang === "en" ? "User not found" : "کاربر پیدا نشد",
    });
    return;
  }
  if (result === "rate_limited") {
    await ctx.answerCallbackQuery({
      text: lang === "en" ? "Slow down a bit" : "کمی آهسته‌تر",
    });
    return;
  }
  if (result === "insufficient") {
    await ctx.answerCallbackQuery({
      text: lang === "en" ? "Not enough coins" : "سکه کافی نیست",
    });
    await ctx.reply(
      `${threadGiftInsufficient(lang)}\n${lang === "en" ? "Balance" : "موجودی"}: ${formatNum(user.diamonds)} 💰`,
    );
    return;
  }

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  const targetName = target?.displayName ?? (lang === "en" ? "user" : "کاربر");
  await ctx.answerCallbackQuery({
    text: lang === "en" ? "Thread sent 🧵" : "نخ ارسال شد 🧵",
  });
  await ctx.reply(threadGiftSenderConfirm(targetName, lang));
});

featuresHandler.callbackQuery(/^dm:start:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const targetId = Number(ctx.match[1]);
  if (targetId === user.id) {
    await ctx.answerCallbackQuery({ text: "به خودت نمی‌توانی پیام بدهی" });
    return;
  }
  // Mid-chat DM allowed — never blockIfChatting / never end anon chat.
  // Silent targets allowed (chatSilentUntil only blocks chat requests).
  const lang = user.language === "en" ? "en" : "fa";
  const { hasBlocked } = await import("../services/block.js");
  if (await hasBlocked(user.id, targetId)) {
    const { InlineKeyboard } = await import("grammy");
    await ctx.answerCallbackQuery({
      text: lang === "en" ? "Unblock first" : "اول آنبلاک کن",
      show_alert: true,
    });
    await ctx.reply(
      lang === "en"
        ? "🚫 You blocked this user.\nUnblock first, then send a direct message."
        : "🚫 این کاربر را بلاک کرده‌ای.\nاول آنبلاک کن، بعد پیام دایرکت بفرست.",
      {
        reply_markup: new InlineKeyboard()
          .text(lang === "en" ? "🔓 Unblock" : "🔓 آنبلاک", `block:off:${targetId}`)
          .success(),
      },
    );
    return;
  }
  await ctx.answerCallbackQuery();
  const { beginDirectCompose } = await import("../services/directMsg.js");
  await beginDirectCompose(ctx, user, targetId);
});

featuresHandler.callbackQuery(/^block:on:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const targetId = Number(ctx.match[1]);
  const lang = user.language === "en" ? "en" : "fa";
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target || target.deletedAt) {
    if (target?.deletedAt) {
      const { notifyTargetAccountDeleted } = await import("../services/account.js");
      await notifyTargetAccountDeleted(ctx, lang);
      return;
    }
    await ctx.answerCallbackQuery({
      text: lang === "en" ? "User not found" : "کاربر پیدا نشد",
      show_alert: true,
    });
    return;
  }

  // اگر از قبل بلاک است، همان دکمه = رفع بلاک
  const { hasBlocked, unblockUser } = await import("../services/block.js");
  if (await hasBlocked(user.id, targetId)) {
    await unblockUser(user.id, targetId);
    await ctx.answerCallbackQuery({
      text: lang === "en" ? "Unblocked ✅" : "رفع بلاک شد ✅",
    });
    await refreshBlockButtonOnCard(ctx, user, target, false);
    return;
  }

  const { blockConfirmKeyboard } = await import("../keyboards/main.js");
  await ctx.answerCallbackQuery();
  const name = target.displayName ?? (lang === "en" ? "this user" : "این کاربر");
  await ctx.reply(
    lang === "en"
      ? [
          `🚫 Block «${name}»?`,
          "",
          "They won't appear in your search/nearby lists.",
          "Chat requests and DMs between you will be blocked.",
          "If you're chatting now, the chat will end.",
        ].join("\n")
      : [
          `🚫 «${name}» بلاک شود؟`,
          "",
          "دیگر در جستجو و نزدیک‌ها دیده نمی‌شود.",
          "درخواست چت و پیام دایرکت بین شما قطع می‌شود.",
          "اگر الان در چت هستید، چت قطع می‌شود.",
        ].join("\n"),
    { reply_markup: blockConfirmKeyboard(targetId, lang) },
  );
});

featuresHandler.callbackQuery(/^block:no:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "لغو شد" });
  await ctx.deleteMessage().catch(() => undefined);
});

featuresHandler.callbackQuery(/^block:yes:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const targetId = Number(ctx.match[1]);
  const lang = user.language === "en" ? "en" : "fa";
  const { blockUser } = await import("../services/block.js");
  const result = await blockUser(user.id, targetId);
  if (!result.ok) {
    await ctx.answerCallbackQuery({
      text: lang === "en" ? "Couldn't block" : "بلاک ممکن نشد",
      show_alert: true,
    });
    return;
  }

  if (user.chatPartnerId === targetId) {
    const { leaveQueueOrChat } = await import("../services/match.js");
    await leaveQueueOrChat(ctx.api, user, true);
    const other = await prisma.user.findUnique({ where: { id: targetId } });
    if (other) await leaveQueueOrChat(ctx.api, other, true);
  }

  await ctx.answerCallbackQuery({
    text: lang === "en" ? "Blocked ✅" : "بلاک شد ✅",
  });

  const doneText =
    lang === "en"
      ? "✅ Blocked.\nOn their profile, tap the same button again to unblock."
      : "✅ بلاک شد.\nروی پروفایلش، همان دکمه را دوباره بزن تا آنلاک شود.";
  await ctx.editMessageText(doneText).catch(async () => {
    await ctx.reply(doneText);
  });
});

featuresHandler.callbackQuery(/^block:off:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const targetId = Number(ctx.match[1]);
  const lang = user.language === "en" ? "en" : "fa";
  const { unblockUser } = await import("../services/block.js");
  const ok = await unblockUser(user.id, targetId);
  await ctx.answerCallbackQuery({
    text: ok
      ? lang === "en"
        ? "Unblocked ✅"
        : "رفع بلاک شد ✅"
      : lang === "en"
        ? "Wasn't blocked"
        : "بلاک نبود",
  });
  if (!ok) return;

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (target) {
    // همان دکمه روی کارت → دوباره «بلاک»
    const flipped = await refreshBlockButtonOnCard(ctx, user, target, false);
    if (flipped) return;
  }

  await ctx.reply(
    lang === "en" ? "✅ User unblocked." : "✅ رفع بلاک انجام شد.",
  );
});

/** دکمه بلاک/رفع‌بلاک را روی همان کارت پروفایل عوض کن */
async function refreshBlockButtonOnCard(
  ctx: { editMessageReplyMarkup: (arg: { reply_markup: import("grammy").InlineKeyboard }) => Promise<unknown> },
  user: { id: number; language?: string | null; chatPartnerId?: number | null; state?: string | null },
  target: { id: number; likesCount: number },
  blocked: boolean,
): Promise<boolean> {
  const { exploreKeyboard, partnerInChatKeyboard } = await import(
    "../keyboards/main.js"
  );
  const { nearbyUserKeyboard } = await import("../keyboards/nearby.js");
  const { isInContacts } = await import("../services/contacts.js");
  const inContacts = await isInContacts(user.id, target.id);
  const likes = target.likesCount;
  const lang = user.language;

  const keyboards = [
    exploreKeyboard(target.id, likes, inContacts, lang, blocked),
    partnerInChatKeyboard(target.id, likes, inContacts, lang, blocked),
    nearbyUserKeyboard(target.id, likes, inContacts, lang, blocked),
  ];

  for (const kb of keyboards) {
    try {
      await ctx.editMessageReplyMarkup({ reply_markup: kb });
      return true;
    } catch {
      /* try next layout */
    }
  }
  return false;
}

featuresHandler.callbackQuery(/^list:blast:(.+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const token = ctx.match[1]!;
  await ctx.answerCallbackQuery();
  const { beginListBlast } = await import("../services/directMsg.js");
  await beginListBlast(ctx, user, token);
});

featuresHandler.callbackQuery(/^blast:edit:(.+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const { editListBlast } = await import("../services/directMsg.js");
  await editListBlast(ctx, user.id, ctx.match[1]!);
});

featuresHandler.callbackQuery(/^blast:send:(.+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const { sendListBlast } = await import("../services/directMsg.js");
  await sendListBlast(ctx, user.id, ctx.match[1]!);
});

featuresHandler.callbackQuery(/^dm:edit:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const { editDirectDraft } = await import("../services/directMsg.js");
  await editDirectDraft(ctx, user.id, Number(ctx.match[1]));
});

featuresHandler.callbackQuery(/^dm:send:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const { sendDirectDraft } = await import("../services/directMsg.js");
  await sendDirectDraft(ctx, user.id, Number(ctx.match[1]));
});

featuresHandler.callbackQuery(/^dm:view:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const { viewDirectMessage } = await import("../services/directMsg.js");
  await viewDirectMessage(ctx, user.id, Number(ctx.match[1]));
});

featuresHandler.callbackQuery(/^dm:reply:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const { beginReplyToDirect } = await import("../services/directMsg.js");
  await beginReplyToDirect(ctx, user, Number(ctx.match[1]));
});

featuresHandler.callbackQuery(/^contact:add:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const targetId = Number(ctx.match[1]);
  const { addContact } = await import("../services/contacts.js");
  const result = await addContact(user.id, targetId);
  if (result === "self") {
    await ctx.answerCallbackQuery({ text: "خودت را نمی‌توانی اضافه کنی" });
    return;
  }
  if (result === "demo") {
    await ctx.answerCallbackQuery({ text: "پروفایل نمونه" });
    return;
  }
  if (result === "missing") {
    await ctx.answerCallbackQuery({ text: "کاربر پیدا نشد" });
    return;
  }
  if (result === "exists") {
    await ctx.answerCallbackQuery({ text: "قبلاً در مخاطبین است" });
  } else {
    await ctx.answerCallbackQuery({ text: "به مخاطبین اضافه شد ✅" });
  }

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (target) {
    const { exploreKeyboard, partnerInChatKeyboard } = await import(
      "../keyboards/main.js"
    );
    const { nearbyUserKeyboard } = await import("../keyboards/nearby.js");
    // سعی کن دکمه‌های همان پیام را به حالت «در مخاطبین» عوض کنی
    const likes = target.likesCount;
    try {
      const { hasBlocked } = await import("../services/block.js");
      const blocked = await hasBlocked(user.id, targetId);
      await ctx.editMessageReplyMarkup({
        reply_markup: exploreKeyboard(
          targetId,
          likes,
          true,
          user.language,
          blocked,
        ),
      });
    } catch {
      try {
        const { hasBlocked } = await import("../services/block.js");
        const blocked = await hasBlocked(user.id, targetId);
        await ctx.editMessageReplyMarkup({
          reply_markup: partnerInChatKeyboard(
            targetId,
            likes,
            true,
            user.language,
            blocked,
          ),
        });
      } catch {
        try {
          const { hasBlocked } = await import("../services/block.js");
          const blocked = await hasBlocked(user.id, targetId);
          await ctx.editMessageReplyMarkup({
            reply_markup: nearbyUserKeyboard(
              targetId,
              likes,
              true,
              user.language,
              blocked,
            ),
          });
        } catch {
          /* ignore */
        }
      }
    }
  }
});

featuresHandler.callbackQuery(/^contact:remove:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const targetId = Number(ctx.match[1]);
  const { removeContact } = await import("../services/contacts.js");
  const ok = await removeContact(user.id, targetId);
  await ctx.answerCallbackQuery({
    text: ok ? "از مخاطبین حذف شد" : "در مخاطبین نبود",
  });

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  const cbMsg = ctx.callbackQuery.message;
  const msgText =
    cbMsg && "text" in cbMsg ? (cbMsg.text ?? "") : "";
  const msgCaption =
    cbMsg && "caption" in cbMsg ? String(cbMsg.caption ?? "") : "";
  const isPhotoCard = Boolean(cbMsg && "photo" in cbMsg && cbMsg.photo);
  const isListPhotoCard =
    isPhotoCard && /^[🟢⚪]\s*[0-9۰-۹]+/.test(msgCaption.trim());
  const fromContactsList =
    isListPhotoCard ||
    msgText.includes("مخاطبین") ||
    msgText.includes("Contacts");

  // کارت/ناوبری لیست مخاطبین — کل صفحه را تازه کن
  if (ok && fromContactsList) {
    const { sendContactsList, loadContactsPaged } = await import(
      "../services/contacts.js"
    );
    const remaining = await loadContactsPaged(user.id);
    if (!remaining.length) {
      const { clearPagedListSession } = await import("../services/pagedList.js");
      await clearPagedListSession(ctx, "c");
      await ctx.deleteMessage().catch(() => undefined);
      await ctx.reply(
        user.language === "en"
          ? "👥 Contacts\n\nYou haven't added anyone yet."
          : "👥 مخاطبین\n\nهنوز کسی را به مخاطبین اضافه نکردی.",
      );
      return;
    }
    await sendContactsList(ctx, user.id, 0, true);
    return;
  }
  if (msgText.includes("👤") && ok) {
    await ctx.deleteMessage().catch(() => undefined);
    return;
  }

  if (target) {
    const { exploreKeyboard, partnerInChatKeyboard } = await import(
      "../keyboards/main.js"
    );
    const likes = target.likesCount;
    const { hasBlocked } = await import("../services/block.js");
    const blocked = await hasBlocked(user.id, targetId);
    try {
      await ctx.editMessageReplyMarkup({
        reply_markup: exploreKeyboard(
          targetId,
          likes,
          false,
          user.language,
          blocked,
        ),
      });
    } catch {
      try {
        await ctx.editMessageReplyMarkup({
          reply_markup: partnerInChatKeyboard(
            targetId,
            likes,
            false,
            user.language,
            blocked,
          ),
        });
      } catch {
        /* ignore */
      }
    }
  }
});

featuresHandler.callbackQuery(/^gift:menu:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const targetId = Number(ctx.match[1]);
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) {
    await ctx.answerCallbackQuery({ text: "کاربر نیست" });
    return;
  }
  await ctx.answerCallbackQuery();
  await ctx.reply(
    [
      `🎁 هدیه سکه به «${target.displayName ?? "کاربر"}»`,
      "",
      `موجودی خودت: ${formatNum(user.diamonds)} 💰`,
      "مقدار هدیه را انتخاب کن (از موجودی خودت کم می‌شود):",
    ].join("\n"),
    { reply_markup: giftDiamondsKeyboard(targetId, user.language) },
  );
});

featuresHandler.callbackQuery(/^watchend:ask:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const targetId = Number(ctx.match[1]);
  const lang = user.language === "en" ? "en" : "fa";
  if (targetId === user.id) {
    await ctx.answerCallbackQuery({
      text: lang === "en" ? "Can't watch yourself" : "برای خودت ممکن نیست",
      show_alert: true,
    });
    return;
  }

  const {
    chatEndWatchConfirmText,
    CHAT_END_WATCH_COST,
    isUserInChat,
  } = await import("../services/chatEndWatch.js");
  const { chatEndWatchConfirmKeyboard } = await import("../keyboards/main.js");

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target || target.deletedAt) {
    if (target?.deletedAt) {
      const { notifyTargetAccountDeleted } = await import("../services/account.js");
      await notifyTargetAccountDeleted(ctx, lang);
      return;
    }
    await ctx.answerCallbackQuery({
      text: lang === "en" ? "User not found" : "کاربر پیدا نشد",
      show_alert: true,
    });
    return;
  }

  const inChat = await isUserInChat(targetId);
  if (!inChat) {
    await ctx.answerCallbackQuery({
      text:
        lang === "en"
          ? "They're free now — not in a chat"
          : "الان آزاد است — در چت نیست",
      show_alert: true,
    });
    return;
  }

  const existing = await prisma.chatEndWatch.findFirst({
    where: { watcherId: user.id, targetId, consumedAt: null },
    select: { id: true },
  });
  if (existing) {
    await ctx.answerCallbackQuery({
      text:
        lang === "en"
          ? "Already watching this chat"
          : "قبلاً برای پایان چت این کاربر ثبت‌نام کردی",
      show_alert: true,
    });
    return;
  }

  if (user.diamonds < CHAT_END_WATCH_COST) {
    await ctx.answerCallbackQuery({
      text: lang === "en" ? "Not enough coins" : "سکه کافی نیست",
      show_alert: true,
    });
    await ctx.reply(
      lang === "en"
        ? `Need ${formatNum(CHAT_END_WATCH_COST)} coin.\nBalance: ${formatNum(user.diamonds)} 💰`
        : `برای این کار ${formatNum(CHAT_END_WATCH_COST)} سکه لازم است.\nموجودی: ${formatNum(user.diamonds)} 💰`,
    );
    return;
  }

  await ctx.answerCallbackQuery();
  const name = target.displayName ?? (lang === "en" ? "this user" : "این کاربر");
  await ctx.reply(chatEndWatchConfirmText(name, user.diamonds, lang), {
    reply_markup: chatEndWatchConfirmKeyboard(targetId, lang),
  });
});

featuresHandler.callbackQuery(/^watchend:no:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "لغو شد" });
  await ctx.deleteMessage().catch(() => undefined);
});

featuresHandler.callbackQuery(/^watchend:yes:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const targetId = Number(ctx.match[1]);
  const lang = user.language === "en" ? "en" : "fa";
  const {
    activateChatEndWatch,
    CHAT_END_WATCH_COST,
  } = await import("../services/chatEndWatch.js");

  const result = await activateChatEndWatch(user.id, targetId);
  if (result === "self") {
    await ctx.answerCallbackQuery({
      text: lang === "en" ? "Can't watch yourself" : "برای خودت ممکن نیست",
      show_alert: true,
    });
    return;
  }
  if (result === "not_found") {
    await ctx.answerCallbackQuery({
      text: lang === "en" ? "User not found" : "کاربر پیدا نشد",
      show_alert: true,
    });
    return;
  }
  if (result === "blocked") {
    await ctx.answerCallbackQuery({
      text: lang === "en" ? "Blocked" : "بلاک است — ممکن نیست",
      show_alert: true,
    });
    return;
  }
  if (result === "not_in_chat") {
    await ctx.answerCallbackQuery({
      text:
        lang === "en"
          ? "They're already free"
          : "الان آزاد است — سکه کم نشد",
      show_alert: true,
    });
    await ctx.deleteMessage().catch(() => undefined);
    return;
  }
  if (result === "already") {
    await ctx.answerCallbackQuery({
      text:
        lang === "en"
          ? "Already watching"
          : "قبلاً ثبت شده — سکه دوباره کم نشد",
      show_alert: true,
    });
    await ctx.deleteMessage().catch(() => undefined);
    return;
  }
  if (result === "insufficient") {
    await ctx.answerCallbackQuery({
      text: lang === "en" ? "Not enough coins" : "سکه کافی نیست",
      show_alert: true,
    });
    const fresh = await prisma.user.findUnique({ where: { id: user.id } });
    await ctx.reply(
      lang === "en"
        ? `Need ${formatNum(CHAT_END_WATCH_COST)} coin.\nBalance: ${formatNum(fresh?.diamonds ?? 0)} 💰`
        : `سکه کافی نیست.\nنیاز: ${formatNum(CHAT_END_WATCH_COST)} | موجودی: ${formatNum(fresh?.diamonds ?? 0)}`,
    );
    return;
  }

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  const fresh = await prisma.user.findUnique({ where: { id: user.id } });
  const name = target?.displayName ?? (lang === "en" ? "user" : "کاربر");
  await ctx.answerCallbackQuery({
    text: lang === "en" ? "Watching ✓" : "ثبت شد ✓",
  });
  await ctx.deleteMessage().catch(() => undefined);
  await ctx.reply(
    lang === "en"
      ? [
          `✅ Done — we'll notify you when «${name}»'s chat ends.`,
          `−${formatNum(CHAT_END_WATCH_COST)} coin · balance: ${formatNum(fresh?.diamonds ?? 0)} 💰`,
        ].join("\n")
      : [
          `✅ ثبت شد — به محض تموم شدن چت «${name}» بهت خبر می‌دیم.`,
          `−${formatNum(CHAT_END_WATCH_COST)} سکه · موجودی: ${formatNum(fresh?.diamonds ?? 0)} 💰`,
        ].join("\n"),
  );
});

featuresHandler.callbackQuery(/^gift:back:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  await nextExploreProfile(ctx, user.id, {
    ...exploreOptsFromState(user.state),
  });
});

featuresHandler.callbackQuery(/^gift:send:(\d+):(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const targetId = Number(ctx.match[1]);
  const amount = Number(ctx.match[2]);
  if (!(GIFT_AMOUNTS as readonly number[]).includes(amount)) {
    await ctx.answerCallbackQuery({ text: "مقدار نامعتبر" });
    return;
  }
  if (targetId === user.id) {
    await ctx.answerCallbackQuery({ text: "به خودت نمی‌شود هدیه داد" });
    return;
  }

  const fresh = await prisma.user.findUnique({ where: { id: user.id } });
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!fresh || !target || target.deletedAt) {
    if (target?.deletedAt) {
      const { notifyTargetAccountDeleted } = await import("../services/account.js");
      await notifyTargetAccountDeleted(ctx, langOf(user));
      return;
    }
    await ctx.answerCallbackQuery({ text: "کاربر پیدا نشد" });
    return;
  }

  const { transferCoins } = await import("../services/coins.js");
  const ok = await transferCoins(fresh.id, targetId, amount);
  if (!ok) {
    await ctx.answerCallbackQuery({ text: "سکه کافی نیست" });
    await ctx.reply(
      `موجودی‌ات کافی نیست.\nنیاز: ${formatNum(amount)} | موجودی: ${formatNum(fresh.diamonds)}`,
    );
    return;
  }

  const fromName = fresh.displayName ?? "یک کاربر";
  if (target.telegramId < 9000000000n) {
    await ctx.api
      .sendMessage(
        Number(target.telegramId),
        [
          "🎁 یک هدیه سکه گرفتی!",
          `از طرف: ${fromName}`,
          `💰 ${formatNum(amount)} سکه به حسابت اضافه شد.`,
        ].join("\n"),
      )
      .catch(() => undefined);
  }

  await ctx.answerCallbackQuery({ text: "هدیه ارسال شد" });
  await ctx.reply(
    `✅ ${formatNum(amount)} سکه برای «${target.displayName ?? "کاربر"}» ارسال شد.`,
    { reply_markup: mainKeyboard() },
  );
});

featuresHandler.callbackQuery(/^exp:chat:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const targetId = Number(ctx.match[1]);
  const lang = user.language === "en" ? "en" : "fa";
  // اول اسپینر را ببند — sendChatRequest ممکن است طول بکشد
  await ctx.answerCallbackQuery({
    text: lang === "en" ? "Sending…" : "در حال ارسال…",
  });
  const result = await sendChatRequest(ctx.api, user.id, targetId);
  if (result === "blocked") {
    const { InlineKeyboard } = await import("grammy");
    await ctx.reply(
      lang === "en"
        ? "🚫 You blocked this user.\nUnblock first, then send a chat request."
        : "🚫 این کاربر را بلاک کرده‌ای.\nاول آنبلاک کن، بعد درخواست چت بفرست.",
      {
        reply_markup: new InlineKeyboard()
          .text(lang === "en" ? "🔓 Unblock" : "🔓 آنبلاک", `block:off:${targetId}`)
          .success(),
      },
    );
    return;
  }
  if (result === "blocked_by") {
    await ctx.reply(
      lang === "en" ? "Can't send request to this user." : "امکان ارسال درخواست به این کاربر نیست.",
    );
    return;
  }
  if (result === "demo") {
    await ctx.reply("این پروفایل نمونه‌ است؛ با کاربر واقعی چت کن.");
    return;
  }
  if (result === "pending") {
    await ctx.reply("درخواست قبلی هنوز باز است.");
    return;
  }
  if (result === "busy") {
    await ctx.reply("الان مشغول است.");
    return;
  }
  if (result === "silent") {
    const { replySilentReject } = await import("../services/chatSilent.js");
    await replySilentReject(ctx, targetId, lang);
    return;
  }
  if (result === "no_coins") {
    const { DIRECT_CHAT_REQUEST_COST, formatNum } = await import("../data/packages.js");
    await ctx.reply(
      lang === "en"
        ? `You need ${DIRECT_CHAT_REQUEST_COST} coin to send a direct chat request. Buy coins from the coins menu.`
        : `برای ارسال درخواست چت مستقیم به ${formatNum(DIRECT_CHAT_REQUEST_COST)} سکه نیاز داری. از منوی سکه شارژ کن.`,
      { reply_markup: mainKeyboard(lang) },
    );
    return;
  }
  if (result !== "ok") {
    await ctx.reply("ارسال نشد. دوباره امتحان کن.");
    return;
  }
  await ctx.reply(
    lang === "en" ? "✅ Chat request sent." : "✅ درخواست چت ارسال شد.",
  );
});

featuresHandler.callbackQuery(/^chatreq:(ok|no):(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const accept = ctx.match[1] === "ok";
  const requestId = Number(ctx.match[2]);
  // اول اسپینر را ببند — connectUsers چند پیام می‌فرستد و کند است
  await ctx.answerCallbackQuery({
    text: accept ? "در حال اتصال…" : "رد شد…",
  });
  const result = await respondChatRequest(ctx.api, requestId, user.id, accept);
  if (result === "missing" || result === "gone") {
    await ctx
      .editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } })
      .catch(() => undefined);
    await ctx.reply(
      "این درخواست منقضی یا لغو شده. اگر هنوز می‌خواهی چت کنی از منو «به یه ناشناس وصلم کن» را بزن.",
      { reply_markup: mainKeyboard() },
    );
    return;
  }
  if (result === "busy" || result === "demo") {
    await ctx.reply("الان نمی‌شود وصل شد. کمی بعد دوباره امتحان کن.", {
      reply_markup: mainKeyboard(),
    });
    return;
  }
  if (result === "no_coins") {
    await ctx.reply(
      "وصل نشد — سکه کافی برای چت سریع نیست (یا طرف مقابل سکه ندارد).",
      { reply_markup: mainKeyboard() },
    );
    return;
  }
  await ctx
    .editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } })
    .catch(() => undefined);
  if (!accept) {
    await ctx.reply("درخواست رد شد.", { reply_markup: mainKeyboard() });
  }
});

featuresHandler.callbackQuery(/^chat:wipe:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const partnerId = Number(ctx.match[1]);
  const partner = await prisma.user.findUnique({ where: { id: partnerId } });
  const { wipeChatBothSides } = await import("../services/chatLog.js");
  const { notifyWipeDone } = await import("../services/nearbyUi.js");
  const counts = await wipeChatBothSides(ctx.api, user.id, partnerId);
  await ctx.answerCallbackQuery({ text: "پاک شد برای هر دو طرف" });
  await ctx.reply(
    [
      "🗑 گفتگو برای هر دو طرف پاک شد.",
      `پیام‌های حذف‌شده از چت تو: ${counts.a}`,
      partner ? `پیام‌های حذف‌شده از چت طرف مقابل: ${counts.b}` : null,
      "",
      "متن، عکس و ویدیوهای ربات حذف شدند.",
      "اگر چیزی باقی ماند: Clear history روی این چت در تلگرام.",
    ]
      .filter(Boolean)
      .join("\n"),
    { reply_markup: mainKeyboard() },
  );
  if (partner && partner.telegramId < 9000000000n) {
    await notifyWipeDone(ctx.api, partner.telegramId, counts.b);
  }
});

featuresHandler.callbackQuery("nearby:saved", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  if (user.latitude == null || user.longitude == null) {
    await ctx.answerCallbackQuery({ text: "لوکیشن ذخیره‌شده نیست" });
    await patchUser(user.id, { state: "await_location" });
    await ctx.reply("لوکیشن ذخیره‌شده نداری. موقعیت فعلی را بفرست:", {
      reply_markup: locationKeyboard(),
    });
    return;
  }
  await ctx.answerCallbackQuery({ text: "با لوکیشن ذخیره‌شده" });
  await patchUser(user.id, { state: "idle", lastActiveAt: new Date() });
  const { askNearbyRadius } = await import("../services/nearbyUi.js");
  await askNearbyRadius(ctx, user.language, { showUpdateLocation: true });
});

featuresHandler.callbackQuery("nearby:fresh", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery({ text: "لوکیشن فعلی" });
  await patchUser(user.id, { state: "await_location" });
  const lang = user.language === "en" ? "en" : "fa";
  await ctx.reply(
    lang === "en"
      ? [
          "📡 Current location",
          "",
          "Tap «Share my location» (or 📎 → Location).",
          "After it saves, pick a radius from 5 to 100 km.",
        ].join("\n")
      : [
          "📡 لوکیشن فعلی",
          "",
          "دکمهٔ ارسال موقعیت را بزن (یا 📎 → Location).",
          "بعد از ذخیره، شعاع ۵ تا ۱۰۰ کیلومتر را انتخاب می‌کنی.",
        ].join("\n"),
    { reply_markup: locationKeyboard(lang) },
  );
});

featuresHandler.callbackQuery("nearby:radius", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  const hasLoc =
    user.latitude != null &&
    user.longitude != null &&
    Number.isFinite(user.latitude) &&
    Number.isFinite(user.longitude);
  const { askNearbyRadius } = await import("../services/nearbyUi.js");
  await askNearbyRadius(ctx, user.language, {
    showUpdateLocation: hasLoc,
  });
});

featuresHandler.callbackQuery(/^nearby:r:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const km = Number(ctx.match[1]);
  const { isValidNearbyRadius, setNearbyRadius } = await import(
    "../services/nearby.js"
  );
  if (!isValidNearbyRadius(km)) {
    await ctx.answerCallbackQuery({ text: "شعاع نامعتبر", show_alert: true });
    return;
  }
  if (user.latitude == null || user.longitude == null) {
    await ctx.answerCallbackQuery({ text: "اول لوکیشن بفرست", show_alert: true });
    await patchUser(user.id, { state: "await_location" });
    await ctx.reply("برای جستجوی نزدیک‌ها، موقعیتت را بفرست:", {
      reply_markup: locationKeyboard(),
    });
    return;
  }
  setNearbyRadius(user.id, km);
  await ctx.answerCallbackQuery({
    text:
      user.language === "en"
        ? `Within ${km} km`
        : `تا ${km} کیلومتر`,
  });
  const { showNearbyResults } = await import("../services/nearbyUi.js");
  await showNearbyResults(ctx, user.id, km);
});

featuresHandler.callbackQuery(/^exp:(next|skip)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  await nextExploreProfile(ctx, user.id, {
    ...exploreOptsFromState(user.state),
  });
});

featuresHandler.callbackQuery("more:province", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  await promptSearchGender(ctx, user.id, "province");
});

featuresHandler.callbackQuery("more:guide", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = ctx.from ? await findByTelegram(ctx.from.id) : null;
  const lang = langOf(user);
  const { fullGuideMessage } = await import("../data/guide.js");
  await ctx.reply(fullGuideMessage(lang), {
    reply_markup: mainKeyboard(lang),
  });
});

featuresHandler.callbackQuery("more:ref", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  const me = await ctx.api.getMe();
  const link = `https://t.me/${me.username}?start=ref_${user.referralCode}`;
  const { sendBotShareCard } = await import("../services/botShare.js");
  await sendBotShareCard(ctx, {
    lang: "fa",
    kind: "referral",
    link,
    bonusLabel: `هر دعوت موفق: ${formatNum(REFERRAL_BONUS)} سکه برای تو 💰`,
  });
});

featuresHandler.callbackQuery("more:nearby", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  const lang = user.language === "en" ? "en" : "fa";
  const hasSaved =
    user.latitude != null &&
    user.longitude != null &&
    Number.isFinite(user.latitude) &&
    Number.isFinite(user.longitude);
  if (hasSaved) {
    const { askNearbyRadius } = await import("../services/nearbyUi.js");
    await askNearbyRadius(ctx, lang, { showUpdateLocation: true });
    return;
  }
  await patchUser(user.id, { state: "await_location" });
  await ctx.reply(
    lang === "en"
      ? "📍 Nearby\n\nSend your location, then pick a distance radius."
      : "📍 افراد نزدیک\n\nموقعیتت را بفرست، بعد شعاع فاصله را انتخاب کن.",
    { reply_markup: locationKeyboard(lang) },
  );
});

featuresHandler.callbackQuery("more:edit", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("چه چیزی را می‌خواهی تغییر بدهی؟", {
    reply_markup: new InlineKeyboard()
      .text("📝 نام", "edit:name")
      .text("🎂 سن", "edit:age")
      .row()
      .text("⚧ جنسیت", "edit:gender")
      .text("🎯 علاقه", "edit:looking")
      .row()
      .text("📄 بیو", "edit:bio")
      .text("✨ علاقه‌مندی‌ها", "edit:interests")
      .row()
      .text("📍 موقعیت", "edit:location")
      .text("📷 عکس پروفایل", "edit:photo"),
  });
});

featuresHandler.callbackQuery("more:anonlink", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();
  const me = await ctx.api.getMe();
  const link = `https://t.me/${me.username}?start=anon_${user.anonCode}`;
  const { sendBotShareCard } = await import("../services/botShare.js");
  await sendBotShareCard(ctx, {
    lang: "fa",
    kind: "anon",
    link,
  });
});

featuresHandler.callbackQuery("edit:name", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await patchUser(user.id, { state: "edit_name" });
  await ctx.answerCallbackQuery();
  await ctx.reply("نام نمایشی جدید را بفرست:", {
    reply_markup: cancelKeyboard(),
  });
});

featuresHandler.callbackQuery("edit:age", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await patchUser(user.id, { state: "edit_age" });
  await ctx.answerCallbackQuery();
  await ctx.reply("بازه سن را بزن، بعد سن دقیق:", {
    reply_markup: ageRangeReplyKeyboard(),
  });
});

featuresHandler.callbackQuery("edit:bio", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await patchUser(user.id, { state: "edit_bio" });
  await ctx.answerCallbackQuery();
  await ctx.reply("بیو جدید را بفرست (حداکثر ۱۵۰ حرف):", {
    reply_markup: cancelKeyboard(),
  });
});

featuresHandler.callbackQuery("edit:looking", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await patchUser(user.id, { state: "edit_looking" });
  await ctx.answerCallbackQuery();
  await ctx.reply("به دنبال چه کسی هستی؟", {
    reply_markup: lookingReplyKeyboard(),
  });
});

featuresHandler.callbackQuery("edit:gender", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const { genderReplyKeyboard } = await import("../keyboards/main.js");
  await patchUser(user.id, { state: "edit_gender" });
  await ctx.answerCallbackQuery();
  await ctx.reply("جنسیت جدید را انتخاب کن:", {
    reply_markup: genderReplyKeyboard(),
  });
});

featuresHandler.callbackQuery("edit:interests", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const {
    parseInterests,
    MAX_INTERESTS,
  } = await import("../data/interests.js");
  const { interestsKeyboard } = await import("../keyboards/main.js");
  const selected = parseInterests(user.interests);
  await ctx.answerCallbackQuery();
  await ctx.reply(
    [
      "✨ علاقه‌مندی‌ها",
      "",
      `تا ${MAX_INTERESTS} مورد انتخاب کن.`,
      "روی هر مورد بزن تا تیک بخورد، بعد ذخیره کن.",
    ].join("\n"),
    { reply_markup: interestsKeyboard(selected) },
  );
});

featuresHandler.callbackQuery(/^interest:toggle:(.+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const id = ctx.match[1]!;
  const {
    parseInterests,
    serializeInterests,
    MAX_INTERESTS,
    INTERESTS,
  } = await import("../data/interests.js");
  const { interestsKeyboard } = await import("../keyboards/main.js");
  if (!INTERESTS.some((i) => i.id === id)) {
    await ctx.answerCallbackQuery({ text: "نامعتبر" });
    return;
  }
  let selected = parseInterests(user.interests);
  if (selected.includes(id)) {
    selected = selected.filter((x) => x !== id);
  } else {
    if (selected.length >= MAX_INTERESTS) {
      await ctx.answerCallbackQuery({
        text: `حداکثر ${MAX_INTERESTS} مورد`,
        show_alert: true,
      });
      return;
    }
    selected = [...selected, id];
  }
  await patchUser(user.id, { interests: serializeInterests(selected) });
  await ctx.answerCallbackQuery({ text: "به‌روز شد" });
  await ctx.editMessageReplyMarkup({
    reply_markup: interestsKeyboard(selected),
  }).catch(() => undefined);
});

featuresHandler.callbackQuery("interest:save", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery({ text: "ذخیره شد" });
  const { checkProfileCompletionRewards } = await import(
    "../services/profileCompletion.js"
  );
  await checkProfileCompletionRewards(user.id, {
    api: ctx.api,
    telegramId: user.telegramId,
  });
  const { sendProfileCard } = await import("../services/profile.js");
  await sendProfileCard(ctx, user.id);
});

featuresHandler.callbackQuery("interest:cancel", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery({ text: "بسته شد" });
  await ctx.reply("منوی اصلی:", { reply_markup: mainKeyboard() });
});

featuresHandler.callbackQuery("edit:location", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await patchUser(user.id, { state: "edit_location" });
  await ctx.answerCallbackQuery();
  await ctx.reply(
    [
      "📍 به‌روزرسانی موقعیت",
      "",
      "موقعیت GPS اختیاری است — برای «افراد نزدیک» و فاصله تقریبی.",
      "موقعیت جدیدت را بفرست (یا از منو → افراد نزدیک).",
      "مختصات دقیق به کسی نشان داده نمی‌شود.",
    ].join("\n"),
    { reply_markup: editLocationKeyboard() },
  );
});

featuresHandler.callbackQuery("edit:photo", async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  await patchUser(user.id, { state: "edit_photo" });
  await ctx.answerCallbackQuery();
  await ctx.reply(
    "یک عکس واضح بفرست.\nتا تأیید ادمین با عکس پیش‌فرض دیده می‌شوی.",
    { reply_markup: cancelKeyboard() },
  );
});

featuresHandler.on("message:location", async (ctx, next) => {
  const from = ctx.from;
  if (!from) return next();
  const user = await findByTelegram(from.id);
  if (!user) return next();

  const { latitude, longitude } = ctx.message.location;

  if (!user.registered) return next();

  if (user.state === "edit_location") {
    await saveLocation(user.id, latitude, longitude);
    await patchUser(user.id, { state: "idle" });
    const { checkProfileCompletionRewards } = await import(
      "../services/profileCompletion.js"
    );
    await checkProfileCompletionRewards(user.id, {
      api: ctx.api,
      telegramId: user.telegramId,
    });
    await ctx.reply("✅ موقعیتت به‌روز شد.\nالان می‌توانی نزدیک‌ها را ببینی.", {
      reply_markup: mainKeyboard(),
    });
    return;
  }

  // نزدیک‌ها / به‌روزرسانی عمومی موقعیت — همیشه ذخیره می‌شود
  await saveLocation(user.id, latitude, longitude);
  await patchUser(user.id, { state: "idle" });

  if (user.state === "await_location") {
    await ctx.reply(
      user.language === "en"
        ? "✅ Location saved.\nNow pick a distance radius:"
        : "✅ موقعیت ذخیره شد.\nحالا شعاع فاصله را انتخاب کن:",
    );
    const { askNearbyRadius } = await import("../services/nearbyUi.js");
    await askNearbyRadius(ctx, user.language, { showUpdateLocation: true });
    return;
  }

  await ctx.reply("✅ موقعیتت ذخیره شد.", { reply_markup: mainKeyboard() });
});

featuresHandler.callbackQuery(/^nearby_chat:(\d+)$/, async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const targetId = Number(ctx.match[1]);
  const lang = user.language === "en" ? "en" : "fa";
  const result = await sendChatRequest(ctx.api, user.id, targetId);
  if (result === "blocked") {
    const { InlineKeyboard } = await import("grammy");
    await ctx.answerCallbackQuery({
      text: lang === "en" ? "Unblock first" : "اول آنبلاک کن",
      show_alert: true,
    });
    await ctx.reply(
      lang === "en"
        ? "🚫 You blocked this user.\nUnblock first, then send a chat request."
        : "🚫 این کاربر را بلاک کرده‌ای.\nاول آنبلاک کن، بعد درخواست چت بفرست.",
      {
        reply_markup: new InlineKeyboard()
          .text(lang === "en" ? "🔓 Unblock" : "🔓 آنبلاک", `block:off:${targetId}`)
          .success(),
      },
    );
    return;
  }
  if (result === "blocked_by") {
    await ctx.answerCallbackQuery({
      text: lang === "en" ? "Can't send request" : "امکان ارسال نیست",
      show_alert: true,
    });
    return;
  }
  if (result === "demo") {
    await ctx.answerCallbackQuery({ text: "نمونه" });
    await ctx.reply("پروفایل نمونه است.");
    return;
  }
  if (result === "pending") {
    await ctx.answerCallbackQuery({ text: "درخواست قبلی باز است" });
    return;
  }
  if (result === "silent") {
    const { replySilentReject } = await import("../services/chatSilent.js");
    await replySilentReject(ctx, targetId, lang, { asAlert: true });
    return;
  }
  if (result === "no_coins") {
    const { DIRECT_CHAT_REQUEST_COST, formatNum } = await import("../data/packages.js");
    await ctx.answerCallbackQuery({
      text:
        lang === "en"
          ? `Need ${DIRECT_CHAT_REQUEST_COST} coin to send a request`
          : `برای درخواست چت به ${formatNum(DIRECT_CHAT_REQUEST_COST)} سکه نیاز داری`,
      show_alert: true,
    });
    return;
  }
  if (result !== "ok") {
    await ctx.answerCallbackQuery({ text: "ارسال نشد" });
    return;
  }
  await ctx.answerCallbackQuery({ text: "درخواست ارسال شد" });
});

featuresHandler.callbackQuery("nearby_skip", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "رد شد" });
  await ctx.deleteMessage().catch(() => undefined);
});
