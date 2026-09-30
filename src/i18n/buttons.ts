export type Lang = "fa" | "en";

export function normalizeLang(raw: string | null | undefined): Lang {
  return raw === "en" ? "en" : "fa";
}

export type BtnKey =
  | "QUICK_CHAT"
  | "NEARBY"
  | "SEARCH"
  | "PROFILE"
  | "DIAMONDS"
  | "EARN"
  | "ANON_LINK"
  | "REFERRAL"
  | "GUIDE"
  | "BACK"
  | "CANCEL_WAIT"
  | "END_CHAT"
  | "VIEW_PARTNER"
  | "ADD_CONTACT"
  | "CHAT_GIFT"
  | "SECURE_CHAT_ON"
  | "SECURE_CHAT_OFF"
  | "SEND_LOCATION"
  | "BOOST"
  | "STATS"
  | "CARD_SEND_RECEIPT"
  | "CARD_CANCEL_PAY";

/** دکمه‌های منو — لیبل و چیدمان پاتوق */
export const BUTTONS: Record<Lang, Record<BtnKey, string>> = {
  fa: {
    QUICK_CHAT: "به یه ناشناس وصلم کن! ⚡",
    NEARBY: "افراد نزدیک 📍",
    SEARCH: "جستجوی کاربران 🔍",
    PROFILE: "پروفایل 👤",
    DIAMONDS: "سکه 💰",
    EARN: "کسب درآمد 💵",
    ANON_LINK: "لینک ناشناس من 🎭",
    REFERRAL: "دوستت و بیار سکه رایگان بگیر 🎁",
    GUIDE: "راهنما 📖",
    BACK: "↩️ بازگشت به منو",
    CANCEL_WAIT: "❌ لغو جستجو",
    END_CHAT: "🔚 قطع چت",
    VIEW_PARTNER: "🕵️ پروفایل طرف مقابل",
    ADD_CONTACT: "➕ افزودن به مخاطبین",
    CHAT_GIFT: "🎁 هدیه",
    SECURE_CHAT_ON: "🔒 چت امن",
    SECURE_CHAT_OFF: "🔓 خاموش کردن چت امن",
    SEND_LOCATION: "📍 ارسال موقعیت",
    BOOST: "اشتراک پرو 💎",
    STATS: "آمار 📊",
    CARD_SEND_RECEIPT: "📸 ارسال رسید پرداخت",
    CARD_CANCEL_PAY: "❌ انصراف از پرداخت",
  },
  en: {
    QUICK_CHAT: "Connect me to a stranger! ⚡",
    NEARBY: "People nearby 📍",
    SEARCH: "Search users 🔍",
    PROFILE: "Profile 👤",
    DIAMONDS: "Coins 💰",
    EARN: "Earn money 💵",
    ANON_LINK: "My anonymous link 🎭",
    REFERRAL: "Bring a friend, get free coins 🎁",
    GUIDE: "Guide 📖",
    BACK: "↩️ Back to menu",
    CANCEL_WAIT: "❌ Cancel search",
    END_CHAT: "🔚 End chat",
    VIEW_PARTNER: "🕵️ Partner profile",
    ADD_CONTACT: "➕ Add to contacts",
    CHAT_GIFT: "🎁 Gift",
    SECURE_CHAT_ON: "🔒 Secure chat",
    SECURE_CHAT_OFF: "🔓 Turn off secure chat",
    SEND_LOCATION: "📍 Send location",
    BOOST: "Pro subscription 💎",
    STATS: "Stats 📊",
    CARD_SEND_RECEIPT: "📸 Send payment receipt",
    CARD_CANCEL_PAY: "❌ Cancel payment",
  },
};

/** برای hears — هر دو زبان را بشناسد */
export function btnAll(key: BtnKey): string[] {
  return [BUTTONS.fa[key], BUTTONS.en[key]];
}

export function btn(lang: Lang, key: BtnKey): string {
  return BUTTONS[lang][key];
}

/** همه متن‌های دکمه برای رد شدن از رله چت */
export function allMenuButtonTexts(): Set<string> {
  const set = new Set<string>();
  for (const lang of ["fa", "en"] as Lang[]) {
    for (const v of Object.values(BUTTONS[lang])) set.add(v);
  }
  return set;
}

export type RegKey =
  | "LANG_FA"
  | "LANG_EN"
  | "GENDER_F"
  | "GENDER_M"
  | "LOOK_F"
  | "LOOK_M"
  | "LOOK_ANY"
  | "AGE_BACK"
  | "REGION_BACK"
  | "STEP_BACK";

export const REG_LABELS: Record<Lang, Record<RegKey, string>> = {
  fa: {
    LANG_FA: "🇮🇷 فارسی",
    LANG_EN: "🇬🇧 English",
    GENDER_F: "👩 خانم",
    GENDER_M: "👨 آقا",
    LOOK_F: "👩 خانم",
    LOOK_M: "👨 آقا",
    LOOK_ANY: "🎲 هردو",
    AGE_BACK: "↩️ بازه سن",
    REGION_BACK: "↩️ تغییر منطقه",
    STEP_BACK: "↩️ بازگشت به قبل",
  },
  en: {
    LANG_FA: "🇮🇷 فارسی",
    LANG_EN: "🇬🇧 English",
    GENDER_F: "👩 Female",
    GENDER_M: "👨 Male",
    LOOK_F: "👩 Female",
    LOOK_M: "👨 Male",
    LOOK_ANY: "🎲 Both",
    AGE_BACK: "↩️ Age ranges",
    REGION_BACK: "↩️ Change region",
    STEP_BACK: "↩️ Go back",
  },
};

export function reg(lang: Lang, key: RegKey): string {
  return REG_LABELS[lang][key];
}

/** تشخیص جنسیت از هر دو زبان */
export function parseGenderLabel(text: string): "female" | "male" | null {
  if (
    text === REG_LABELS.fa.GENDER_F ||
    text === REG_LABELS.en.GENDER_F ||
    text === REG_LABELS.fa.LOOK_F ||
    text === REG_LABELS.en.LOOK_F
  ) {
    return "female";
  }
  if (
    text === REG_LABELS.fa.GENDER_M ||
    text === REG_LABELS.en.GENDER_M ||
    text === REG_LABELS.fa.LOOK_M ||
    text === REG_LABELS.en.LOOK_M
  ) {
    return "male";
  }
  return null;
}

export function parseLookingLabel(text: string): "female" | "male" | "any" | null {
  const g = parseGenderLabel(text);
  if (g) return g;
  if (text === REG_LABELS.fa.LOOK_ANY || text === REG_LABELS.en.LOOK_ANY) {
    return "any";
  }
  return null;
}

export function isStepBack(text: string): boolean {
  return (
    text === REG_LABELS.fa.STEP_BACK || text === REG_LABELS.en.STEP_BACK
  );
}

export const AGE_RANGES_I18N: Record<
  Lang,
  { label: string; from: number; to: number }[]
> = {
  fa: [
    { label: "🎂 ۱۸ تا ۲۴", from: 18, to: 24 },
    { label: "🎂 ۲۵ تا ۳۱", from: 25, to: 31 },
    { label: "🎂 ۳۲ تا ۳۸", from: 32, to: 38 },
    { label: "🎂 ۳۹ تا ۴۵", from: 39, to: 45 },
    { label: "🎂 ۴۶ تا ۵۲", from: 46, to: 52 },
    { label: "🎂 ۵۳ تا ۶۰", from: 53, to: 60 },
  ],
  en: [
    { label: "🎂 18–24", from: 18, to: 24 },
    { label: "🎂 25–31", from: 25, to: 31 },
    { label: "🎂 32–38", from: 32, to: 38 },
    { label: "🎂 39–45", from: 39, to: 45 },
    { label: "🎂 46–52", from: 46, to: 52 },
    { label: "🎂 53–60", from: 53, to: 60 },
  ],
};
