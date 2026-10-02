import { Keyboard, InlineKeyboard } from "grammy";
import {
  DIAMOND_PACKAGES,
  DELETE_ACCOUNT_COST,
  GIFT_AMOUNTS,
  formatToman,
  formatNum,
  packagePickerLabel,
  vipPickerLabel,
} from "../data/packages.js";
import { threadGiftButtonLabel } from "../services/threadGift.js";
import {
  countryChoices,
  provinceLabels,
  cityLabels,
  iranRegionChoices,
} from "../data/locations.js";
import { INTERESTS } from "../data/interests.js";
import {
  btn,
  reg,
  tr,
  normalizeLang,
  BUTTONS,
  REG_LABELS,
  AGE_RANGES_I18N,
  type Lang,
} from "../i18n/index.js";

/** سازگاری با کدهای قبلی — همیشه فارسی */
export const BTN = { ...BUTTONS.fa } as const;

export const REG = {
  ...REG_LABELS.fa,
  /** سازگاری با کدهای قبلی */
  EXPLORE: BUTTONS.fa.SEARCH,
  ANON: BUTTONS.fa.ANON_LINK,
  MORE: BUTTONS.fa.GUIDE,
} as const;

/** بازه‌های سن — فارسی برای سازگاری */
export const AGE_RANGES = AGE_RANGES_I18N.fa;

/**
 * منوی اصلی — رنگ پاتوق:
 * بالایی سبز (success) | سکه/پروفایل/راهنما/معرفی طوسی (پیش‌فرض)
 *
 * مثل منوی چت / استاندارد تلگرام:
 * resize_keyboard تا جمع‌وجور بماند، بدون is_persistent تا کاربر خودش
 * مینیمایز کند و با اسکرول پایین برود (فیکس اجباری نباشد).
 * فقط روی /start، ورود منو، پایان چت و گذارهای مهم بفرست؛
 * روی پاسخ‌های روزمرهٔ idle نفرست تا وسط اسکرول دوباره لنگر نشود.
 */
export function mainKeyboard(lang: Lang | string | null = "fa") {
  const L = normalizeLang(lang);
  return new Keyboard()
    // —— بالا: سبز ——
    .text(btn(L, "QUICK_CHAT"), "success")
    .row()
    // استوری غیرفعال شد
    .text(btn(L, "NEARBY"), "success")
    .text(btn(L, "SEARCH"), "success")
    .row()
    // —— طوسی (بدون style = پیش‌فرض تلگرام) ——
    .text(btn(L, "BOOST"))
    .text(btn(L, "PROFILE"))
    .text(btn(L, "GUIDE"))
    .row()
    .text(btn(L, "EARN"), "primary")
    .text(btn(L, "DIAMONDS"), "primary")
    .row()
    .text(btn(L, "ANON_LINK"))
    .text(btn(L, "REFERRAL"))
    .resized();
}

/** پنل جستجو — سبز/آبی برای اکشن‌های اصلی، بقیه طوسی */
export function searchPanelKeyboard(lang: Lang | string | null = "fa") {
  const L = normalizeLang(lang);
  return new InlineKeyboard()
    .text(
      tr(L, "به مخاطب خاصم وصلم کن 💌", "Connect to someone special 💌"),
      "search:special",
    )
    .success()
    .row()
    .text(tr(L, "هم استانی ها 📍🍷", "Same province 📍🍷"), "search:province")
    .text(tr(L, "هم سن ها 👤👥", "Same age 👤👥"), "search:age")
    .row()
    .text(tr(L, "📋 مشاهده همه", "📋 View all"), "search:all")
    .primary()
    .text(tr(L, "جستجو پیشرفته 🔍", "Advanced search 🔍"), "search:advanced")
    .primary()
    .row()
    .text(tr(L, "کاربران جدید 🙋‍♀️💁‍♂️", "New users 🙋‍♀️💁‍♂️"), "search:new")
    .text(tr(L, "بدون چت ها 🚶‍♂️🚶‍♀️", "No chats yet 🚶‍♂️🚶‍♀️"), "search:nochats")
    .row()
    .text(tr(L, "👀 چت های اخیر من 👀", "👀 My recent chats 👀"), "search:recent")
    .row()
    .text(
      tr(L, "جستجو با GPS فعلی من 📍", "Search by my GPS 📍"),
      "search:gps",
    )
    .row()
    .text(
      tr(L, "کاربران محبوب بر اساس لایک 📊❤️", "Popular by likes 📊❤️"),
      "search:popular",
    )
    .success();
}

export function cancelKeyboard(lang: Lang | string | null = "fa") {
  const L = normalizeLang(lang);
  return new Keyboard().text(btn(L, "BACK"), "danger").resized();
}

export function waitingKeyboard(lang: Lang | string | null = "fa") {
  const L = normalizeLang(lang);
  return new Keyboard()
    .text(btn(L, "CANCEL_WAIT"), "danger")
    .row()
    .text(btn(L, "BACK"), "primary")
    .resized();
}

/** بعد از انتخاب کارت‌به‌کارت — دکمه ارسال رسید */
export function cardReceiptReplyKeyboard(lang: Lang | string | null = "fa") {
  const L = normalizeLang(lang);
  return new Keyboard()
    .text(btn(L, "CARD_SEND_RECEIPT"), "primary")
    .row()
    .text(btn(L, "CARD_CANCEL_PAY"), "danger")
    .resized()
    .persistent();
}

/**
 * منوی Reply حین چت ناشناس — مثل استاندارد تلگرام:
 * resize_keyboard تا جمع‌وجور بماند، بدون is_persistent تا کاربر خودش جمع کند
 * و با اسکرول صفحه پایین برود (فیکس اجباری نباشد).
 * فقط یک‌بار روی اتصال/resume بفرست؛ روی پیام‌های رله نفرست.
 */
export function chattingKeyboard(
  secure = false,
  lang: Lang | string | null = "fa",
) {
  const L = normalizeLang(lang);
  return new Keyboard()
    .text(btn(L, "END_CHAT"), "danger")
    .text(btn(L, "VIEW_PARTNER"), "primary")
    .row()
    .text(btn(L, "ADD_CONTACT"), "success")
    .text(btn(L, "CHAT_GIFT"), "primary")
    .row()
    .text(
      secure ? btn(L, "SECURE_CHAT_OFF") : btn(L, "SECURE_CHAT_ON"),
      "primary",
    )
    .resized();
}

/**
 * دکمه‌های Inline اختیاری زیر پیام «وصل شدید» —
 * مکمل منوی Reply هستند، جایگزین آن نیستند.
 */
export function chattingInlineKeyboard(
  secure = false,
  lang: Lang | string | null = "fa",
) {
  const L = normalizeLang(lang);
  return new InlineKeyboard()
    .text(btn(L, "END_CHAT"), "chat:end")
    .danger()
    .text(btn(L, "VIEW_PARTNER"), "chat:partner")
    .primary()
    .row()
    .text(btn(L, "ADD_CONTACT"), "chat:contact")
    .success()
    .text(
      secure ? btn(L, "SECURE_CHAT_OFF") : btn(L, "SECURE_CHAT_ON"),
      secure ? "chat:secure:off" : "chat:secure:on",
    )
    .primary();
}

/** حذف ReplyKeyboard — فقط وقتی واقعاً لازم است (نه هنگام شروع چت) */
export const removeReplyKeyboard = {
  remove_keyboard: true,
} as const;

export type ProfileChatRequest = "explore" | "nearby" | false;

/**
 * کارت پروفایل دیگران — دکمه‌های فشرده:
 * ❤️ {count} = لایک (اگر قبلاً لایک شده → نمایش تعداد)
 * گزارش + مخاطب در یک ردیف با لیبل کوتاه
 */
export function userProfileActionKeyboard(
  targetId: number,
  likesCount: number,
  inContacts = false,
  lang: Lang | string | null = "fa",
  blocked = false,
  chatRequest: ProfileChatRequest = false,
) {
  const L = normalizeLang(lang);
  const kb = new InlineKeyboard()
    .text(`❤️ ${formatNum(likesCount)}`, `exp:like:${targetId}`)
    .success()
    .text(threadGiftButtonLabel(L), `exp:thread:${targetId}`)
    .primary()
    .row()
    .text(tr(L, "🎁 هدیه سکه", "🎁 Gift coins"), `gift:menu:${targetId}`)
    .primary()
    .text(tr(L, "✉️ پیام دایرکت", "✉️ Direct message"), `dm:start:${targetId}`)
    .primary()
    .row()
    .text(
      inContacts
        ? tr(L, "✅ مخاطب", "✅ Saved")
        : tr(L, "👤 مخاطب", "👤 Contact"),
      inContacts ? `contact:remove:${targetId}` : `contact:add:${targetId}`,
    )
    .success()
    .text(tr(L, "🚩 گزارش", "🚩 Report"), `report:start:${targetId}`)
    .danger()
    .row();
  if (blocked) {
    kb.text(tr(L, "🔓 آنبلاک", "🔓 Unblock"), `block:off:${targetId}`).success();
  } else {
    kb.text(tr(L, "🚫 بلاک", "🚫 Block"), `block:on:${targetId}`).danger();
  }
  kb.text(
    tr(L, "🔔 اطلاع پایان چت (۱💰)", "🔔 Chat end (1💰)"),
    `watchend:ask:${targetId}`,
  )
    .primary();
  if (chatRequest === "explore") {
    kb.row()
      .text(
        tr(L, "💬 درخواست چت", "💬 Chat request"),
        `exp:chat:${targetId}`,
      )
      .primary();
  } else if (chatRequest === "nearby") {
    kb.row()
      .text(
        tr(L, "💬 درخواست چت", "💬 Chat request"),
        `nearby_chat:${targetId}`,
      )
      .primary();
  }
  return kb;
}

/** پروفایل طرف مقابل وسط چت — بدون دکمه درخواست چت */
export function partnerInChatKeyboard(
  targetId: number,
  likesCount: number,
  inContacts = false,
  lang: Lang | string | null = "fa",
  blocked = false,
) {
  return userProfileActionKeyboard(
    targetId,
    likesCount,
    inContacts,
    lang,
    blocked,
    false,
  );
}

export function locationKeyboard(lang: Lang | string | null = "fa") {
  const L = normalizeLang(lang);
  return new Keyboard()
    .requestLocation({ text: btn(L, "SEND_LOCATION"), style: "success" })
    .row()
    .text(btn(L, "BACK"), "danger")
    .resized()
    .oneTime();
}

/** لوکیشن — فقط ویرایش پروفایل (ثبت‌نام دیگر لوکیشن نمی‌گیرد) */
export function regLocationKeyboard(lang: Lang | string | null = "fa") {
  const L = normalizeLang(lang);
  return new Keyboard()
    .requestLocation({
      text: tr(L, "📍 ارسال موقعیت من", "📍 Send my location"),
      style: "success",
    })
    .row()
    .text(reg(L, "STEP_BACK"), "danger")
    .resized()
    .oneTime();
}

/** فقط بازگشت — مرحله نام نمایشی */
export function regNameKeyboard(lang: Lang | string | null = "fa") {
  const L = normalizeLang(lang);
  return new Keyboard().text(reg(L, "STEP_BACK")).resized().persistent();
}

/** ویرایش لوکیشن از پروفایل */
export function editLocationKeyboard(lang: Lang | string | null = "fa") {
  const L = normalizeLang(lang);
  return new Keyboard()
    .requestLocation({
      text: tr(L, "📍 به‌روزرسانی موقعیت", "📍 Update location"),
      style: "success",
    })
    .row()
    .text(btn(L, "BACK"), "danger")
    .resized()
    .oneTime();
}

/**
 * ReplyKeyboard ثبت‌نام: ستون زیاد = اسکرول کمتر،
 * oneTime = بعد از انتخاب کیبورد جمع می‌شود تا مرحله بعد فول‌صفحه باشد.
 */
function gridReply(
  labels: string[],
  cols: number,
  opts:
    | { oneTime?: boolean; stepBack?: boolean; lang?: Lang | string | null }
    | boolean = true,
) {
  const normalized =
    typeof opts === "boolean" ? { oneTime: opts, stepBack: false } : opts;
  const oneTime = normalized.oneTime ?? true;
  const stepBack = normalized.stepBack ?? false;
  const L = normalizeLang(normalized.lang);
  const kb = new Keyboard();
  labels.forEach((label, i) => {
    kb.text(label);
    if ((i + 1) % cols === 0) kb.row();
  });
  if (labels.length % cols !== 0) kb.row();
  if (stepBack) kb.text(reg(L, "STEP_BACK")).row();
  const built = kb.resized();
  return oneTime ? built.oneTime() : built.persistent();
}

export function languageReplyKeyboard() {
  return gridReply([REG.LANG_FA, REG.LANG_EN], 2);
}

export function countryReplyKeyboard(
  stepBack = true,
  lang: Lang | string | null = "fa",
) {
  const L = normalizeLang(lang);
  return gridReply(
    countryChoices(L).map((c) => c.label),
    2,
    { stepBack, lang: L },
  );
}

export function provinceReplyKeyboard(
  country: string,
  region?: string,
  stepBack = true,
  lang: Lang | string | null = "fa",
) {
  const L = normalizeLang(lang);
  if (country === "IR" && !region) {
    const choices = iranRegionChoices(L);
    const kb = new Keyboard();
    choices.forEach((c, i) => {
      kb.text(c.label);
      if ((i + 1) % 2 === 0) kb.row();
    });
    if (choices.length % 2 !== 0) kb.row();
    if (stepBack) kb.text(reg(L, "STEP_BACK")).row();
    return kb.resized().persistent();
  }
  if (country === "IR" && region) {
    const list = provinceLabels(country, L, region);
    const cols = list.length <= 4 ? 2 : 3;
    const kb = gridReply(list, cols, {
      stepBack: false,
      oneTime: false,
      lang: L,
    });
    kb.row().text(reg(L, "REGION_BACK"));
    if (stepBack) kb.row().text(reg(L, "STEP_BACK"));
    return kb;
  }
  const list = provinceLabels(country, L);
  const cols = list.length <= 6 ? 2 : 3;
  return gridReply(list, cols, { stepBack, lang: L });
}

export function cityReplyKeyboard(
  country: string,
  province: string,
  stepBack = true,
  lang: Lang | string | null = "fa",
) {
  const L = normalizeLang(lang);
  const list = cityLabels(country, province, L);
  const cols = list.length <= 4 ? 2 : list.length <= 9 ? 3 : 4;
  return gridReply(list, cols, { stepBack, lang: L });
}

export function genderReplyKeyboard(
  stepBack = false,
  lang: Lang | string | null = "fa",
) {
  const L = normalizeLang(lang);
  return gridReply([reg(L, "GENDER_F"), reg(L, "GENDER_M")], 2, {
    stepBack,
    lang: L,
  });
}

export function lookingReplyKeyboard(
  stepBack = false,
  lang: Lang | string | null = "fa",
) {
  const L = normalizeLang(lang);
  return gridReply(
    [reg(L, "LOOK_F"), reg(L, "LOOK_M"), reg(L, "LOOK_ANY")],
    3,
    { stepBack, lang: L },
  );
}

/** مرحله ۱ سن: فقط ۶ بازه بزرگ */
export function ageRangeReplyKeyboard(
  stepBack = false,
  lang: Lang | string | null = "fa",
) {
  const L = normalizeLang(lang);
  return gridReply(
    AGE_RANGES_I18N[L].map((r) => r.label),
    2,
    { stepBack, lang: L },
  );
}

/** مرحله ۲ سن: فقط سن‌های همان بازه — دکمه‌های درشت */
export function ageReplyKeyboard(
  from = 18,
  to = 60,
  stepBack = false,
  lang: Lang | string | null = "fa",
) {
  const L = normalizeLang(lang);
  const ages: string[] = [];
  for (let a = from; a <= to; a++) ages.push(String(a));
  const cols = ages.length <= 4 ? 2 : ages.length <= 8 ? 4 : 5;
  const kb = gridReply(ages, cols, { stepBack: false, lang: L });
  if (from > 18 || to < 60) {
    kb.row().text(reg(L, "AGE_BACK"));
  }
  if (stepBack) kb.row().text(reg(L, "STEP_BACK"));
  return kb;
}

export function parseAgeRange(text: string) {
  for (const lang of ["fa", "en"] as Lang[]) {
    const found = AGE_RANGES_I18N[lang].find((r) => r.label === text);
    if (found) return found;
  }
  return null;
}

// --- سازگاری با کدهای قبلی (ویرایش پروفایل / ادمین) ---
export function registerGenderKeyboard() {
  return genderReplyKeyboard();
}

export function lookingForKeyboard() {
  return lookingReplyKeyboard();
}

export function agePickerKeyboard(_page = 0, _prefix = "reg") {
  return ageRangeReplyKeyboard();
}

export function languageKeyboard() {
  return languageReplyKeyboard();
}

export function countryKeyboard(lang: Lang | string | null = "fa") {
  return countryReplyKeyboard(true, lang);
}

export function provinceKeyboard(country: string, _page = 0) {
  return provinceReplyKeyboard(country);
}

export function cityKeyboard(country: string, province: string, _page = 0) {
  return cityReplyKeyboard(country, province);
}

export function diamondPackagesKeyboard() {
  return coinsShopKeyboard(null, "fa");
}

export function coinsShopKeyboard(
  lastDailyCoinAt: Date | null | undefined,
  lang: Lang | string | null = "fa",
) {
  const L = normalizeLang(lang);
  const kb = new InlineKeyboard();
  kb.text(
    tr(L, "🎟 کد هدیه / ووچر", "🎟 Gift code / voucher"),
    "voucher:redeem",
  )
    .primary()
    .row();
  for (const p of DIAMOND_PACKAGES) {
    if (p.vip) continue;
    kb.text(packagePickerLabel(p), `pkg:${p.id}`).success().row();
  }
  const vip = DIAMOND_PACKAGES.find((p) => p.vip);
  if (vip) {
    kb.text(vipPickerLabel(vip), `pkg:${vip.id}`).primary();
  }
  return kb;
}

export function paymentMethodKeyboard(
  pkgId: string,
  lang: Lang | string | null = "fa",
) {
  const L = normalizeLang(lang);
  return new InlineKeyboard()
    .text(tr(L, "⭐ Telegram Stars", "⭐ Telegram Stars"), `pay:stars:${pkgId}`)
    .primary()
    .row()
    .text(
      tr(L, "💳 کارت‌به‌کارت", "💳 Card transfer"),
      `pay:card:${pkgId}`,
    )
    .primary()
    .row()
    .text(
      tr(L, "🎟 ووچر (کد هدیه)", "🎟 Voucher (gift code)"),
      "voucher:redeem",
    )
    .success();
}

export function exploreKeyboard(
  targetId: number,
  likesCount: number,
  inContacts = false,
  lang: Lang | string | null = "fa",
  blocked = false,
) {
  return userProfileActionKeyboard(
    targetId,
    likesCount,
    inContacts,
    lang,
    blocked,
    "explore",
  );
}

/** تأیید اطلاع پایان چت (+۱ سکه) */
export function chatEndWatchConfirmKeyboard(
  targetId: number,
  lang: Lang | string | null = "fa",
) {
  const L = normalizeLang(lang);
  return new InlineKeyboard()
    .text(
      tr(L, "✅ بله، اطلاع بده (+۱💰)", "✅ Yes, notify me (+1💰)"),
      `watchend:yes:${targetId}`,
    )
    .success()
    .row()
    .text(tr(L, "↩️ انصراف", "↩️ Cancel"), `watchend:no:${targetId}`)
    .primary();
}


export function reportReasonKeyboard(
  targetId: number,
  lang: Lang | string | null = "fa",
) {
  const L = normalizeLang(lang);
  return new InlineKeyboard()
    .text(tr(L, "📢 تبلیغات سایت/ربات/کانال", "📢 Ads / bots / channels"), `report:reason:${targetId}:ads`)
    .row()
    .text(tr(L, "🔞 محتوای غیر اخلاقی", "🔞 Immoral content"), `report:reason:${targetId}:immoral`)
    .row()
    .text(tr(L, "😤 ایجاد مزاحمت", "😤 Harassment"), `report:reason:${targetId}:harassment`)
    .row()
    .text(tr(L, "📱 شماره / اطلاعات شخصی", "📱 Phone / personal info"), `report:reason:${targetId}:privacy`)
    .row()
    .text(tr(L, "🗯 کلمات توهین‌آمیز", "🗯 Insults"), `report:reason:${targetId}:insult`)
    .row()
    .text(tr(L, "⚧ جنسیت اشتباه پروفایل", "⚧ Wrong gender"), `report:reason:${targetId}:wrong_gender`)
    .row()
    .text(tr(L, "✏️ دیگر موارد (بنویس)", "✏️ Other (type)"), `report:reason:${targetId}:other`)
    .row()
    .text(tr(L, "↩️ انصراف", "↩️ Cancel"), "report:cancel");
}

export function blockConfirmKeyboard(
  targetId: number,
  lang: Lang | string | null = "fa",
) {
  const L = normalizeLang(lang);
  return new InlineKeyboard()
    .text(tr(L, "✅ بله، بلاک کن", "✅ Yes, block"), `block:yes:${targetId}`)
    .danger()
    .row()
    .text(tr(L, "↩️ انصراف", "↩️ Cancel"), `block:no:${targetId}`)
    .primary();
}

/** دکمه‌های زیر لیست سرچ */
export function searchListFooterKeyboard(
  optsKey = "default",
  lang: Lang | string | null = "fa",
) {
  const L = normalizeLang(lang);
  return new InlineKeyboard()
    .text(tr(L, "📋 مشاهده همه", "📋 View all"), `search:viewall:${optsKey}`)
    .primary()
    .row()
    .text(tr(L, "⏭️ بعدی", "⏭️ Next"), `search:next:${optsKey}`)
    .primary()
    .text(tr(L, "✖️ رد", "✖️ Skip"), `search:skip:${optsKey}`)
    .danger();
}

/** انتخاب مقدار هدیه سکه به کاربر دیگر */
export function giftDiamondsKeyboard(
  targetId: number,
  lang: Lang | string | null = "fa",
) {
  const L = normalizeLang(lang);
  const kb = new InlineKeyboard();
  for (const n of GIFT_AMOUNTS) {
    kb.text(
      tr(L, `🎁 ${formatNum(n)} سکه`, `🎁 ${formatNum(n)} coins`),
      `gift:send:${targetId}:${n}`,
    )
      .success()
      .row();
  }
  kb.text(tr(L, "↩️ بازگشت", "↩️ Back"), `gift:back:${targetId}`).danger();
  return kb;
}

export function moreKeyboard(lang: Lang | string | null = "fa") {
  const L = normalizeLang(lang);
  return new InlineKeyboard()
    .text(tr(L, "📖 راهنما", "📖 Guide"), "more:guide")
    .primary()
    .text(tr(L, "🎁 دعوت دوستان", "🎁 Invite friends"), "more:ref")
    .success()
    .row()
    .text(tr(L, "🏘 هم‌استانی‌ها", "🏘 Same province"), "more:province")
    .primary()
    .text(tr(L, "📍 نزدیک‌های شهر", "📍 Nearby city"), "more:nearby")
    .primary()
    .row()
    .text(tr(L, "🔗 لینک ناشناس من", "🔗 My anonymous link"), "more:anonlink")
    .primary();
}

export function profilePanelKeyboard(
  isActive: boolean,
  faceVerified: boolean,
  likesCount: number,
  contactsCount = 0,
  lang: Lang | string | null = "fa",
) {
  const L = normalizeLang(lang);
  return new InlineKeyboard()
    .text(`❤️ ${formatNum(likesCount)}`, "prof:likes")
    .text(
      tr(
        L,
        `👥 مخاطبین (${formatNum(contactsCount)})`,
        `👥 Contacts (${formatNum(contactsCount)})`,
      ),
      "prof:contacts",
    )
    .primary()
    .row()
    .text(tr(L, "ویرایش پروفایل 📝", "Edit profile 📝"), "prof:edit")
    .primary()
    .text(tr(L, "تکمیل پروفایل 🧾", "Complete profile 🧾"), "prof:complete")
    .primary()
    .row()
    .text(tr(L, "🔄 تعاملات", "🔄 Interactions"), "prof:interactions")
    .primary()
    .text(
      faceVerified
        ? tr(L, "احراز شده ✅", "Verified ✅")
        : tr(L, "احراز چهره (+۱۰۰ 💰)", "Face verify (+100 💰)"),
      "prof:face",
    )
    .success()
    .row()
    .text(tr(L, "🚫 بلاک‌شده‌ها", "🚫 Blocked users"), "prof:blocked")
    .danger()
    .row()
    .text(
      tr(L, "🔇 سایلنت درخواست چت", "🔇 Mute chat requests"),
      "prof:silent",
    )
    .primary()
    .row()
    .text(
      tr(L, "🔴 حذف / غیرفعال‌سازی حساب", "🔴 Delete / deactivate account"),
      "prof:manage",
    )
    .danger();
}

/** مقدمه احراز چهره — مثل دوردور */
export function faceVerifyIntroKeyboard(lang: Lang | string | null = "fa") {
  const L = normalizeLang(lang);
  return new InlineKeyboard()
    .text(tr(L, "✅ بله، متوجه شدم", "✅ Yes, understood"), "face:ok")
    .success()
    .row()
    .text(tr(L, "📷 تغییر عکس پروفایل", "📷 Change profile photo"), "face:photo")
    .primary()
    .row()
    .text(tr(L, "❌ انصراف", "❌ Cancel"), "face:cancel")
    .danger();
}

export function profileEditKeyboard(lang: Lang | string | null = "fa") {
  const L = normalizeLang(lang);
  return new InlineKeyboard()
    .text(tr(L, "📝 نام", "📝 Name"), "edit:name")
    .primary()
    .text(tr(L, "🎂 سن", "🎂 Age"), "edit:age")
    .primary()
    .row()
    .text(tr(L, "⚧ جنسیت", "⚧ Gender"), "edit:gender")
    .primary()
    .text(tr(L, "🎯 علاقه (جستجو)", "🎯 Looking for"), "edit:looking")
    .primary()
    .row()
    .text(tr(L, "📄 بیو", "📄 Bio"), "edit:bio")
    .primary()
    .text(tr(L, "✨ علاقه‌مندی‌ها", "✨ Interests"), "edit:interests")
    .primary()
    .row()
    .text(tr(L, "📍 موقعیت", "📍 Location"), "edit:location")
    .primary()
    .text(tr(L, "📷 عکس", "📷 Photo"), "edit:photo")
    .primary()
    .row()
    .text(tr(L, "↩️ بازگشت به پروفایل", "↩️ Back to profile"), "prof:back")
    .danger();
}

export function interestsKeyboard(
  selected: string[],
  lang: Lang | string | null = "fa",
) {
  const L = normalizeLang(lang);
  const sel = new Set(selected);
  const kb = new InlineKeyboard();
  INTERESTS.forEach((item, i) => {
    const mark = sel.has(item.id) ? "✅ " : "";
    kb.text(`${mark}${item.label}`, `interest:toggle:${item.id}`);
    if ((i + 1) % 2 === 0) kb.row();
  });
  if (INTERESTS.length % 2 !== 0) kb.row();
  kb.text(tr(L, "💾 ذخیره", "💾 Save"), "interest:save")
    .success()
    .text(tr(L, "↩️ انصراف", "↩️ Cancel"), "interest:cancel")
    .danger();
  return kb;
}

export function confirmDeleteKeyboard(lang: Lang | string | null = "fa") {
  const L = normalizeLang(lang);
  return new InlineKeyboard()
    .text(
      tr(
        L,
        `🔴🗑 بله، حذف با ${formatNum(DELETE_ACCOUNT_COST)} سکه`,
        `🔴🗑 Yes, delete for ${formatNum(DELETE_ACCOUNT_COST)} coins`,
      ),
      "prof:delete:yes",
    )
    .danger()
    .row()
    .text(tr(L, "❌ خیر، منصرف شدم", "❌ No, cancel"), "prof:delete:no")
    .primary();
}

export function confirmEndChatKeyboard(lang: Lang | string | null = "fa") {
  const L = normalizeLang(lang);
  return new InlineKeyboard()
    .text(tr(L, "✅ بله، قطع کن", "✅ Yes, end chat"), "chat:end:yes")
    .danger()
    .row()
    .text(tr(L, "❌ نه، ادامه بده", "❌ No, continue"), "chat:end:no")
    .primary();
}

export function accountManageKeyboard(
  isActive: boolean,
  lang: Lang | string | null = "fa",
) {
  const L = normalizeLang(lang);
  return new InlineKeyboard()
    .text(
      isActive
        ? tr(L, "🔴⏸ غیرفعال‌سازی حساب", "🔴⏸ Deactivate account")
        : tr(L, "🟢▶️ فعال‌سازی حساب", "🟢▶️ Activate account"),
      "prof:toggle",
    )
    .style(isActive ? "danger" : "success")
    .row()
    .text(
      tr(
        L,
        `🔴🗑 حذف دائمی حساب (${formatNum(DELETE_ACCOUNT_COST)}💰)`,
        `🔴🗑 Permanently delete (${formatNum(DELETE_ACCOUNT_COST)}💰)`,
      ),
      "prof:delete",
    )
    .danger()
    .row()
    .text(tr(L, "↩️ بازگشت به پروفایل", "↩️ Back to profile"), "prof:back")
    .primary();
}

export function adminPhotoKeyboard(userId: number) {
  return new InlineKeyboard()
    .text("✅ تأیید عکس", `adm:photo:ok:${userId}`)
    .success()
    .text("❌ رد عکس", `adm:photo:no:${userId}`)
    .danger();
}

export function adminFaceKeyboard(userId: number) {
  return new InlineKeyboard()
    .text("✅ تأیید احراز", `adm:face:ok:${userId}`)
    .success()
    .text("❌ رد احراز", `adm:face:no:${userId}`)
    .danger();
}
