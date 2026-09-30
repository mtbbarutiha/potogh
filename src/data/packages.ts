export type DiamondPackage = {
  id: string;
  diamonds: number;
  toman: number;
  /** قیمت با Telegram Stars (XTR) */
  stars: number;
  label: string;
  /** تخفیف پلکانی — درصد */
  discountPct: number;
  vip?: boolean;
};

/** قیمت پایه هر سکه */
export const COIN_PRICE_TOMAN = 2_000;
export const COIN_PRICE_STARS = 1;

/**
 * نرخ فروش سکه به ریال (کسب درآمد) — قابل تنظیم ادمین از همین ثابت.
 * خرید: COIN_PRICE_TOMAN | فروش: COIN_SELL_PRICE_TOMAN
 * حداقل موجودی برای ثبت درخواست: MIN_SELL_COINS
 */
export const COIN_SELL_PRICE_TOMAN = 1_000;
export const MIN_SELL_COINS = 1000;

function pkg(
  id: string,
  diamonds: number,
  label: string,
  opts?: { vip?: boolean },
): DiamondPackage {
  return {
    id,
    diamonds,
    label,
    discountPct: 0,
    ...(opts?.vip ? { vip: true } : {}),
    toman: diamonds * COIN_PRICE_TOMAN,
    stars: diamonds * COIN_PRICE_STARS,
  };
}

/** پکیج سکه — هر سکه ۲٬۰۰۰ تومان یا ۱ Star */
export const DIAMOND_PACKAGES: DiamondPackage[] = [
  pkg("d50", 50, "۵۰ سکه"),
  pkg("d120", 120, "۱۲۰ سکه"),
  pkg("d300", 300, "۳۰۰ سکه — پرفروش"),
  pkg("d700", 700, "۷۰۰ سکه"),
  pkg("d1500", 1500, "۱۵۰۰ سکه"),
  pkg("d4000", 4000, "VIP", { vip: true }),
];

/** برچسب دکمه — بسته‌های عادی */
export function packagePickerLabel(p: DiamondPackage): string {
  return `💰 ${formatNum(p.diamonds)} سکه · ⭐${formatNum(p.stars)} · ${formatNum(p.toman)}ت`;
}

/** دکمه VIP — برجسته و جدا */
export function vipPickerLabel(p: DiamondPackage): string {
  return `👑 VIP · ${formatNum(p.diamonds)} سکه · ⭐${formatNum(p.stars)} · ${formatNum(p.toman)}ت`;
}

export function coinsShopIntroText(
  lang: "fa" | "en",
  balance: number,
): string {
  if (lang === "en") {
    return [
      "💰 Coins",
      "",
      `Balance: ${formatNum(balance)}`,
      "",
      `Each coin: ${formatNum(COIN_PRICE_TOMAN)} Toman or ${formatNum(COIN_PRICE_STARS)} Star`,
      `🎁 ${formatNum(DAILY_COIN_REWARD)} free coins daily — top button`,
      "Pick a package → Stars or card transfer",
    ].join("\n");
  }
  return [
    "💰 سکه‌ها",
    "",
    `موجودی: ${formatNum(balance)}`,
    "",
    `قیمت هر سکه: ${formatNum(COIN_PRICE_TOMAN)} تومان یا ${formatNum(COIN_PRICE_STARS)} Star`,
    `🎁 هر روز ${formatNum(DAILY_COIN_REWARD)} سکه رایگان — دکمه بالای لیست`,
    "بسته را بزن → Stars یا کارت‌به‌کارت",
  ].join("\n");
}

export function packageCheckoutText(
  pkg: DiamondPackage,
  lang: "fa" | "en",
): string {
  if (pkg.vip) {
    if (lang === "en") {
      return [
        "👑━━━━━━━━━━━━━━👑",
        "       VIP PACKAGE",
        "👑━━━━━━━━━━━━━━👑",
        "",
        `💎 ${formatNum(pkg.diamonds)} coins`,
        `⭐ Telegram Stars: ${formatNum(pkg.stars)} (${formatNum(COIN_PRICE_STARS)} per coin)`,
        `💳 Card transfer: ${formatToman(pkg.toman)} (${formatNum(COIN_PRICE_TOMAN)} Toman per coin)`,
        "",
        "Choose payment method:",
      ].join("\n");
    }
    return [
      "👑━━━━━━━━━━━━━━👑",
      "         VIP",
      "👑━━━━━━━━━━━━━━👑",
      "",
      `💎 ${formatNum(pkg.diamonds)} سکه`,
      `⭐ Telegram Stars: ${formatNum(pkg.stars)} (هر سکه ${formatNum(COIN_PRICE_STARS)} Star)`,
      `💳 کارت‌به‌کارت: ${formatToman(pkg.toman)} (هر سکه ${formatNum(COIN_PRICE_TOMAN)} تومان)`,
      "",
      "روش پرداخت را انتخاب کن:",
    ].join("\n");
  }

  if (lang === "en") {
    return [
      "💰 Buy coins",
      "",
      `Package: ${formatNum(pkg.diamonds)} coins`,
      `⭐ Telegram Stars: ${formatNum(pkg.stars)} (${formatNum(COIN_PRICE_STARS)} per coin)`,
      `💳 Card transfer: ${formatToman(pkg.toman)} (${formatNum(COIN_PRICE_TOMAN)} Toman per coin)`,
      "",
      "Choose payment method:",
    ].join("\n");
  }
  return [
    "💰 خرید سکه",
    "",
    `بسته: ${formatNum(pkg.diamonds)} سکه`,
    `⭐ Telegram Stars: ${formatNum(pkg.stars)} (هر سکه ${formatNum(COIN_PRICE_STARS)} Star)`,
    `💳 کارت‌به‌کارت: ${formatToman(pkg.toman)} (هر سکه ${formatNum(COIN_PRICE_TOMAN)} تومان)`,
    "",
    "روش پرداخت را انتخاب کن:",
  ].join("\n");
}

export const REFERRAL_BONUS = 25;
export const WELCOME_DIAMONDS = 15;
/** سکه رایگان روزانه با ورود به ربات */
export const DAILY_COIN_REWARD = 10;
export const BOOST_COST = 40;
export const BOOST_HOURS = 12;
/** جایزه تأیید احراز چهره (ویدیو مطابق عکس پروفایل) */
export const FACE_VERIFY_REWARD = 100;
/** هزینه پاک کردن دائمی حساب کاربری */
export const DELETE_ACCOUNT_COST = 100;
/** جایزه تکمیل هر بخش پروفایل (یک‌بار برای هر بخش) */
export const PROFILE_SECTION_REWARD = 10;
/** هر لایک: ۱ سکه از لایک‌کننده → هدیه به طرف مقابل */
export const LIKE_GIFT_DIAMONDS = 1;
/** نخ دادن: ۵ سکه از فرستنده، ۳ سکه به گیرنده (۲ سکه سهم سیستم) */
export const THREAD_GIFT_COST = 5;
export const THREAD_GIFT_RECIPIENT = 3;
/** هزینه ارسال پیام دایرکت از روی پروفایل */
export const DIRECT_MSG_COST = 1;
/** هزینه وصل ناشناس (چت سریع) — کسر هنگام وصل موفق، نه ورود به صف */
export const QUICK_MATCH_COST = 2;
/** اگر طرف مقابل زودتر از این بازه قطع کند، سکه به پرداخت‌کننده برمی‌گردد */
export const QUICK_MATCH_REFUND_MS = 20_000;

/** پیام گروهی از لیست سرچ: ۱۰ نفر اول، هزینه ثابت ۱۰ سکه */
export const LIST_BLAST_LIMIT = 10;
export const LIST_BLAST_COST = 10;
/** بسته‌های هدیه سکه به کاربر دیگر (از موجودی خودت) */
export const GIFT_AMOUNTS = [10, 50, 100, 200] as const;
/** شعاع‌های قابل انتخاب برای افراد نزدیک */
export const NEARBY_RADIUS_OPTIONS_KM = [5, 10, 20, 50, 100] as const;
/** پیش‌فرض اگر شعاع انتخاب نشود */
export const NEARBY_RADIUS_KM = 20;
export const EXPLORE_LIMIT = 1;

/** ایموجی رسمی سکه — یکدست با منوی اصلی */
export const COIN = "💰";

export function formatToman(n: number): string {
  return n.toLocaleString("fa-IR") + " تومان";
}

export function formatNum(n: number): string {
  return n.toLocaleString("fa-IR");
}

/** نمایش موجودی با ایموجی رسمی سکه */
export function formatCoins(n: number): string {
  return `${formatNum(n)} ${COIN}`;
}

export function genderLabel(g: string | null | undefined): string {
  if (g === "female") return "خانم";
  if (g === "male") return "آقا";
  return "نامشخص";
}
