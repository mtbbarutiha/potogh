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

/** نرخ مرجع هر سکه (گران‌ترین پله = مبنای محاسبه‌ی تخفیف) */
export const COIN_PRICE_TOMAN = 750;
export const COIN_PRICE_STARS = 1;
/** بهترین نرخ (بسته‌ی بزرگ) — برای پیام «از X تومان» */
export const COIN_BEST_RATE_TOMAN = 221;

/**
 * نرخ فروش سکه (برداشت کاربر) — باید خیلی کمتر از ارزان‌ترین نرخ خرید باشد
 * تا سوءاستفاده‌ی خرید-بفروش (آربیتراژ) ممکن نباشد.
 * حداقل موجودی برای ثبت درخواست: MIN_SELL_COINS
 */
export const COIN_SELL_PRICE_TOMAN = 200;
export const MIN_SELL_COINS = 3000;

/** تومانِ هر سکه در یک بسته (برای نمایش نرخ واقعی هر بسته) */
export function perCoinToman(p: DiamondPackage): number {
  return Math.round(p.toman / p.diamonds);
}

function pkg(
  id: string,
  diamonds: number,
  toman: number,
  stars: number,
  label: string,
  opts?: { vip?: boolean },
): DiamondPackage {
  const perCoin = toman / diamonds;
  const discountPct = Math.max(
    0,
    Math.round((1 - perCoin / COIN_PRICE_TOMAN) * 100),
  );
  return {
    id,
    diamonds,
    label,
    discountPct,
    ...(opts?.vip ? { vip: true } : {}),
    toman,
    stars,
  };
}

/** پکیج سکه — تعرفه‌ی پلکانی (هرچه بسته بزرگ‌تر، هر سکه ارزان‌تر) */
export const DIAMOND_PACKAGES: DiamondPackage[] = [
  pkg("d320", 320, 240_000, 120, "۳۲۰ سکه"),
  pkg("d540", 540, 380_000, 190, "۵۴۰ سکه"),
  pkg("d1500", 1500, 560_000, 280, "۱۵۰۰ سکه — پرفروش"),
  pkg("d2800", 2800, 800_000, 400, "۲۸۰۰ سکه"),
  pkg("d6800", 6800, 1_500_000, 750, "VIP", { vip: true }),
];

/** برچسب دکمه — بسته‌های عادی */
export function packagePickerLabel(p: DiamondPackage): string {
  const off = p.discountPct >= 5 ? ` · ${formatNum(p.discountPct)}٪ تخفیف` : "";
  return `💰 ${formatNum(p.diamonds)} سکه · ${formatNum(p.toman)}ت · ⭐${formatNum(p.stars)}${off}`;
}

/** دکمه VIP — برجسته و جدا */
export function vipPickerLabel(p: DiamondPackage): string {
  const off = p.discountPct >= 5 ? ` · ${formatNum(p.discountPct)}٪ تخفیف` : "";
  return `👑 VIP · ${formatNum(p.diamonds)} سکه · ${formatNum(p.toman)}ت · ⭐${formatNum(p.stars)}${off}`;
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
      `Bigger pack = cheaper coins (from ${formatNum(COIN_BEST_RATE_TOMAN)} Toman/coin, up to 71% off)`,
      "Pick a package → Stars or card transfer",
    ].join("\n");
  }
  return [
    "💰 سکه‌ها",
    "",
    `موجودی: ${formatNum(balance)}`,
    "",
    `هرچه بسته بزرگ‌تر، هر سکه ارزان‌تر (از ${formatNum(COIN_BEST_RATE_TOMAN)} تومان — تا ۷۱٪ تخفیف)`,
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
        `⭐ Telegram Stars: ${formatNum(pkg.stars)}`,
        `💳 Card transfer: ${formatToman(pkg.toman)} (${formatNum(perCoinToman(pkg))} Toman/coin)`,
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
      `⭐ Telegram Stars: ${formatNum(pkg.stars)}`,
      `💳 کارت‌به‌کارت: ${formatToman(pkg.toman)} (هر سکه ${formatNum(perCoinToman(pkg))} تومان)`,
      "",
      "🎁 با این بسته VIP دائمی می‌شوی:",
      "• 👑 نشان VIP روی پروفایل و لیست‌ها",
      "• ⚡ بالاترین اولویت در صف چت سریع",
      "• 🔍 جستجوی پیشرفته رایگان (برای بقیه سکه‌ای)",
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

export const REFERRAL_BONUS = 50;
export const WELCOME_DIAMONDS = 15;
/** @deprecated سکه رایگان روزانه حذف شد — فقط برای سازگاری import باقی مانده */
export const DAILY_COIN_REWARD = 10;
/** هزینه ارسال درخواست چت مستقیم (از روی پروفایل/آیدی) */
export const DIRECT_CHAT_REQUEST_COST = 1;
export const BOOST_COST = 40;
export const BOOST_HOURS = 12;
/** استوری ۲۴ ساعته */
export const STORY_TTL_HOURS = 24;
export const STORY_MAX_TEXT = 300;
/** هزینه‌ی بوست استوری (نمایش در ابتدای صف) */
export const STORY_BOOST_COST = 15;
/** هزینه‌ی هر جستجوی پیشرفته برای کاربر عادی (VIP رایگان) */
export const ADV_SEARCH_COST = 1;
/** جایزه تأیید احراز چهره (ویدیو مطابق عکس پروفایل) — تک‌پاداش */
export const FACE_VERIFY_REWARD = 30;
/** هزینه پاک کردن دائمی حساب کاربری */
export const DELETE_ACCOUNT_COST = 100;
/** جایزه تکمیل هر بخش پروفایل پایه (یک‌بار برای هر بخش) */
export const PROFILE_SECTION_REWARD = 5;
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
