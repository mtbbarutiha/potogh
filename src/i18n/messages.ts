import type { Lang } from "./buttons.js";
import { BUTTONS } from "./buttons.js";
import {
  formatNum,
  BOOST_COST,
  BOOST_HOURS,
  WELCOME_DIAMONDS,
  LIKE_GIFT_DIAMONDS,
  DIRECT_MSG_COST,
  REFERRAL_BONUS,
  FACE_VERIFY_REWARD,
  PROFILE_SECTION_REWARD,
  THREAD_GIFT_COST,
  THREAD_GIFT_RECIPIENT,
  LIST_BLAST_COST,
  LIST_BLAST_LIMIT,
  DAILY_COIN_REWARD,
  COIN_PRICE_TOMAN,
  COIN_PRICE_STARS,
} from "../data/packages.js";

type Vars = Record<string, string | number | null | undefined>;

function fill(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    vars[k] == null ? "" : String(vars[k]),
  );
}

const M = {
  fa: {
    main_menu:
      "به دوردوریا خوش اومدی 💞\n\nاینجا می‌تونی افراد نزدیکت رو پیدا کنی، به یه ناشناس وصل شی، یا با جستجو آشنا شی.\n\nاز دکمه‌های پایین استفاده کن 👇",
    welcome_back:
      "خوش برگشتی! 👋\n\nمنو و وضعیتت به‌روز شد — از دکمه‌های پایین استفاده کن 👇",
    welcome_back_chat:
      "💬 چتت هنوز فعاله — می‌تونی ادامه بدی.\n\nمنو به‌روز شد 👇",
    welcome_back_waiting:
      "⚡ هنوز در صف چت سریع هستی.\n\nمنو به‌روز شد — لغو: «لغو جستجو»",
    guide_title: "✨ راهنمای کامل دوردوریا",
    need_register: "برای شروع، ثبت‌نام را کامل کن.",
    reg_welcome:
      "به دوردوریا خوش اومدی 💞\n\nثبت‌نام رایگانه و اطلاعاتت محرمانه می‌مونه.\nدر هر مرحله می‌تونی «↩️ بازگشت به قبل» بزنی.\n\n۱/۸ — زبان خودت را انتخاب کن:",
    reg_lang: "۱/۸ — زبان را انتخاب کن:",
    reg_country: "۲/۸ — کشور را انتخاب کن:",
    reg_province: "۳/۸ — استان را انتخاب کن:",
    reg_city: "۴/۸ — شهر را انتخاب کن:",
    reg_gender: "۵/۸ — جنسیت را انتخاب کن:",
    reg_age: "۶/۸ — بازه سن را انتخاب کن:",
    reg_name: "۷/۸ — یک نام نمایشی بفرست:",
    reg_looking: "۸/۸ — دنبال چی می‌گردی؟",
    pick_from_buttons: "از دکمه‌ها انتخاب کن.",
    chat_connected:
      "✅ وصل شدید!\nچت شروع شد — می‌توانید با هم حرف بزنید.\n📷 می‌توانی عکس بفرستی.\n🔒 برای چت امن از دکمه زیر پیام استفاده کن.\nقطع: دکمه «قطع چت» زیر پیام یا /end",
    chat_ended_partner: "طرف مقابل چت را قطع کرد.",
    chat_ended: "چت قطع شد.",
    end_chat_confirm: "⚠️ مطمئنی می‌خواهی چت را قطع کنی؟",
    end_chat_cancelled: "✅ باشه، چت ادامه دارد.",
    not_chatting: "الان در چت نیستی.",
    only_in_chat: "این دکمه فقط وسط چت فعال است.",
    search_cancelled: "جستجو لغو شد.",
    cancelled: "لغو شد.",
    coins_title: "💰 سکه‌ها",
    balance: "موجودی: {n} سکه",
    welcome_friend: "دوست جدید",
    welcome_slogan_body:
      "به دوردوریا خوش آمدی، {name} 💞\n\n━━━━━━━━━━━━\nدوردوریا جایی‌ست میان فاصله‌ها —\nبرای حرف‌های ناشناس، دوستی‌های تازه\nو آدم‌هایی که شاید نزدیک‌تر از چیزی باشند که فکر می‌کنی.\n━━━━━━━━━━━━\n\nاینجا می‌تونی بدون لو رفتن هویتت گپ بزنی،\nهم‌استانی و نزدیک‌هات را پیدا کنی،\nو با خیال راحت‌تر آشنا بشی.\n\n{loc}🎁 هدیه ورود: {gift} سکه 💰\n\nآماده‌ای؟ منوی پایین، کنترل پنل توست 👇",
    quick_waiting:
      "⚡ چت سریع\n\nوارد صف شدی.\nدرخواست به کاربران فعال ارسال می‌شود.\nبه‌محض قبول یکی — یا ورود نفر بعدی به صف — وصل می‌شوی.\nلغو: «لغو جستجو»",
    still_waiting: "⚡ هنوز در صف چت سریع هستی.",
    contact_added: "✅ طرف مقابل به مخاطبینت اضافه شد.",
    contact_exists: "این کاربر از قبل در مخاطبینت هست.",
    dm_sent: "✅ پیام دایرکت ارسال شد.",
    coin_deducted: "💰 {n} سکه کسر شد.",
    request_sent:
      "✅ درخواست چت شما ارسال شد.\n\nدر صورت عدم پذیرش از طرف مقابل، تا ۲ دقیقه آینده درخواست چت منقضی می‌شود.",
    chat_req_title: "💬 درخواست چت",
    chat_req_quick: "⚡ درخواست چت سریع",
    accept_or_reject: "قبول می‌کنی یا رد؟",
    valid_2min: "⏳ این درخواست تا ۲ دقیقه معتبر است.",
    nearby_title: "📍 افراد نزدیک",
    search_pick: "🔍 جستجو کاربران — یک گزینه را انتخاب کن:",
    referral_title: "🔗 معرفی دوستان",
    anon_title: "🎭 لینک ناشناس من",
    boost_on: "🚀 شتاب‌دهی فعال شد تا {until}\n{cost} سکه کم شد.",
    not_enough_coins: "سکه کافی نیست.",
    profile_partner: "👤 پروفایل طرف مقابل",
    profile_completion_pct: "📊 تکمیل پروفایل: {pct}٪",
    profile_complete_title: "🧾 تکمیل پروفایل",
    profile_section_reward:
      "🎁 {n} سکه جایزه برای تکمیل {count} بخش پروفایل!",
    profile_section_reward_hint:
      "هر بخش = {n} سکه (فقط یک‌بار)",
    profile_missing_sections: "موارد ناقص:",
    profile_fully_complete: "✅ پروفایلت کامل است!",
    profile_complete_cta: "از دکمه‌ها ادامه بده:",
    continue_chat: "👋 سلام کن!",
    chat_still_open: "💬 چت هنوز بازه — می‌تونی ادامه بدی.",
    wipe_offer:
      "می‌توانی کل گفتگو (متن/عکس/ویدیو) را برای هر دو طرف پاک کنی.",
    lang_changed: "✅ Language set to English. The bot will continue in English.",
  },
  en: {
    main_menu:
      "Welcome to Patogh 💞\n\nFind people nearby, connect anonymously, or search and chat.\n\nUse the buttons below 👇",
    welcome_back:
      "Welcome back! 👋\n\nYour menu and status are updated — use the buttons below 👇",
    welcome_back_chat:
      "💬 Your chat is still active — you can keep chatting.\n\nMenu updated 👇",
    welcome_back_waiting:
      "⚡ You're still in the quick-chat queue.\n\nMenu updated — cancel: «Cancel search»",
    guide_title: "✨ Patogh Guide",
    need_register: "Please complete registration to continue.",
    reg_welcome:
      "Welcome to Patogh 💞\n\nComplete registration to start.\nYou can tap «↩️ Go back» at any step.\n\n1/8 — Choose your language:",
    reg_lang: "1/8 — Choose your language:",
    reg_country: "2/8 — Choose your country:",
    reg_province: "3/8 — Choose your province:",
    reg_city: "4/8 — Choose your city:",
    reg_gender: "5/8 — Choose your gender:",
    reg_age: "6/8 — Choose your age range:",
    reg_name: "7/8 — Send a display name:",
    reg_looking: "8/8 — Who are you looking for?",
    pick_from_buttons: "Please choose from the buttons.",
    chat_connected:
      "✅ Connected!\nChat started — you can talk now.\n📷 You can send photos.\n🔒 Use the button under this message for secure chat.\nEnd: «End chat» under the message or /end",
    chat_ended_partner: "The other person ended the chat.",
    chat_ended: "Chat ended.",
    end_chat_confirm: "⚠️ Are you sure you want to end the chat?",
    end_chat_cancelled: "✅ OK, the chat continues.",
    not_chatting: "You're not in a chat right now.",
    only_in_chat: "This button only works during a chat.",
    search_cancelled: "Search cancelled.",
    cancelled: "Cancelled.",
    coins_title: "💰 Coins",
    balance: "Balance: {n} coins",
    welcome_friend: "friend",
    welcome_slogan_body:
      "Welcome to Patogh, {name} 💞\n\n━━━━━━━━━━━━\nPatogh is a place between distances —\nfor anonymous talks, new friendships,\nand people who may be closer than you think.\n━━━━━━━━━━━━\n\nChat without revealing your identity,\nfind people nearby or from your province,\nand meet with more peace of mind.\n\n{loc}🎁 Welcome gift: {gift} coins 💰\n\nReady? The menu below is your control panel 👇",
    quick_waiting:
      "⚡ Quick chat\n\nYou're in the queue.\nRequests are being sent to active users.\nYou'll connect when someone accepts — or when the next person joins the queue.\nCancel: «Cancel search»",
    still_waiting: "⚡ You're still in the quick-chat queue.",
    contact_added: "✅ Partner added to your contacts.",
    contact_exists: "This user is already in your contacts.",
    dm_sent: "✅ Direct message sent.",
    coin_deducted: "💰 {n} coin(s) deducted.",
    request_sent:
      "✅ Your chat request was sent.\n\nIf they don't accept within 2 minutes, the request will expire.",
    chat_req_title: "💬 Chat request",
    chat_req_quick: "⚡ Quick chat request",
    accept_or_reject: "Accept or decline?",
    valid_2min: "⏳ This request is valid for 2 minutes.",
    nearby_title: "📍 People nearby",
    search_pick: "🔍 Search users — pick an option:",
    referral_title: "🔗 Invite friends",
    anon_title: "🎭 My anonymous link",
    boost_on: "🚀 Boost active until {until}\n{cost} coins deducted.",
    not_enough_coins: "Not enough coins.",
    profile_partner: "👤 Partner profile",
    profile_completion_pct: "📊 Profile completion: {pct}%",
    profile_complete_title: "🧾 Complete profile",
    profile_section_reward:
      "🎁 {n} coins for completing {count} profile section(s)!",
    profile_section_reward_hint:
      "{n} coins per section (once each)",
    profile_missing_sections: "Still missing:",
    profile_fully_complete: "✅ Your profile is complete!",
    profile_complete_cta: "Continue with the buttons:",
    continue_chat: "👋 Say hi!",
    chat_still_open: "💬 Chat is still open — you can keep chatting.",
    wipe_offer: "You can wipe the full chat (text/photo/video) for both sides.",
    lang_changed: "✅ زبان روی فارسی تنظیم شد. ربات فارسی ادامه می‌دهد.",
  },
} as const;

export type MsgKey = keyof typeof M.fa;

export function t(lang: Lang, key: MsgKey, vars?: Vars): string {
  return fill(M[lang][key] ?? M.fa[key], vars);
}

/** جفت فارسی/انگلیسی برای متن‌هایی که هنوز کلید اختصاصی ندارند */
export function tr(
  lang: Lang | string | null | undefined,
  fa: string,
  en: string,
  vars?: Vars,
): string {
  const L: Lang = lang === "en" ? "en" : "fa";
  return fill(L === "en" ? en : fa, vars);
}

export function welcomeSlogan(lang: Lang, opts?: {
  displayName?: string | null;
  city?: string | null;
  province?: string | null;
  diamonds?: number;
}): string {
  const name =
    opts?.displayName?.trim() ||
    (lang === "en" ? "friend" : "دوست جدید");
  const locParts = [opts?.city, opts?.province].filter(Boolean);
  const loc =
    locParts.length > 0
      ? `🏘 ${locParts.join(lang === "en" ? ", " : "، ")}\n`
      : "";
  const gift = formatNum(opts?.diamonds ?? WELCOME_DIAMONDS);
  return t(lang, "welcome_slogan_body", { name, loc, gift });
}

export function fullGuide(lang: Lang): string {
  const B = BUTTONS[lang];
  if (lang === "en") {
    return [
      "✨ Welcome to Patogh",
      "Your space for anonymous chats, new connections, and people who might be closer than you think 💫",
      "",
      "━━━━━━━━━━━━━━━━",
      "🏠 Main menu",
      "━━━━━━━━━━━━━━━━",
      "",
      `⚡ ${B.QUICK_CHAT}`,
      "   Jump into an instant anonymous chat.",
      "   Online and nearby users get priority.",
      "   Cancel anytime with «Cancel search».",
      "",
      `📍 ${B.NEARBY}`,
      "   Discover people around you with GPS.",
      "   Pick a radius from 5 to 100 km.",
      "   Your exact location is never shared.",
      "",
      `🔍 ${B.SEARCH}`,
      "   Smart filters to find the right people:",
      "   💌 Special contact  ·  📋 View all",
      "   🏛 Same province  ·  👥 Same age",
      "   🆕 New users  ·  🚶 No chats yet",
      "   👀 Recent chats  ·  📡 GPS search",
      "   ❤️ Popular by likes  ·  🔬 Advanced",
      "",
      `👤 ${B.PROFILE}`,
      "   Edit your name, bio, interests, city, and location.",
      "   Upload a photo · Face verify · Manage contacts.",
      `   📊 Complete each profile section → +${formatNum(PROFILE_SECTION_REWARD)} coins`,
      `   🛡✅ Face verify → trust badge + ${formatNum(FACE_VERIFY_REWARD)} coins`,
      "",
      `💰 ${B.DIAMONDS}`,
      "   Check your balance and buy coin packs.",
      `   🎁 Daily reward: ${formatNum(DAILY_COIN_REWARD)} free coins — tap the top button once a day`,
      `   🎁 Welcome gift: ${formatNum(WELCOME_DIAMONDS)} coins for new users`,
      "",
      `   Each coin: ${formatNum(COIN_PRICE_STARS)} Star or ${formatNum(COIN_PRICE_TOMAN)} Toman`,
      "   👑 VIP — largest pack (4000 coins)",
      "",
      `🔗 ${B.REFERRAL}`,
      `   Invite a friend who completes signup → +${formatNum(REFERRAL_BONUS)} free coins for you`,
      "",
      `🎭 ${B.ANON_LINK}`,
      "   Share your personal link and receive anonymous messages.",
      "",
      "━━━━━━━━━━━━━━━━",
      "💬 On someone's profile",
      "━━━━━━━━━━━━━━━━",
      "",
      `❤️ Like → ${formatNum(LIKE_GIFT_DIAMONDS)} coin gifted to them`,
      `🧵 Thread gift → costs ${formatNum(THREAD_GIFT_COST)} · they receive ${formatNum(THREAD_GIFT_RECIPIENT)}`,
      "🎁 Send coins → 10 / 50 / 100 / 200",
      `✉️ Direct message → ${formatNum(DIRECT_MSG_COST)} coin`,
      "💬 Chat request → they need to accept first",
      "➕ Add to contacts  ·  🚫 Block / Unblock",
      "",
      "━━━━━━━━━━━━━━━━",
      "🕶 Anonymous chat",
      "━━━━━━━━━━━━━━━━",
      "",
      "📝 Text · 📷 Photos · 🎬 Videos · 🎤 Voice · ✨ Stickers",
      "🔒 Secure chat → media can't be saved or forwarded",
      "👤 View your partner's profile anytime during chat",
      "🔚 End chat → confirmation first, then optional wipe",
      "🧹 Wipe the full conversation for both sides",
      "",
      "━━━━━━━━━━━━━━━━",
      "🚀 Boost & Pro",
      "━━━━━━━━━━━━━━━━",
      "",
      `🚀 Boost (/boost) → ${formatNum(BOOST_COST)} coins / ${BOOST_HOURS}h priority in search`,
      "🅿️ Pro (/pro) → premium visibility badge",
      `📣 List blast → message ${formatNum(LIST_BLAST_LIMIT)} people for ${formatNum(LIST_BLAST_COST)} coins`,
      "",
      "━━━━━━━━━━━━━━━━",
      "💡 Good to know",
      "━━━━━━━━━━━━━━━━",
      "",
      "🔐 Your identity stays private in anonymous chat",
      "📍 Exact GPS coordinates are never shown to others",
      "📢 Channel membership may be required to use the bot",
      "♻️ /start refreshes your menu without ending an active chat",
      "🔚 End chat: «End chat» or /end",
      "",
      "Patogh — bring people closer 💞✨",
    ].join("\n");
  }

  return [
    "✨ به دوردوریا خوش اومدی",
    "جایی برای گپ‌های ناشناس، آشنایی‌های تازه و آدم‌هایی که شاید از چیزی که فکر می‌کنی نزدیک‌تر باشن 💫",
    "",
    "━━━━━━━━━━━━━━━━",
    "🏠 منوی اصلی",
    "━━━━━━━━━━━━━━━━",
    "",
    `⚡ ${B.QUICK_CHAT}`,
    "   همین الان وارد یک چت ناشناس شو.",
    "   کاربران آنلاین و نزدیک‌تر، اولویت بیشتری دارن.",
    "   هر وقت خواستی با «لغو جستجو» از صف خارج شو.",
    "",
    `📍 ${B.NEARBY}`,
    "   افراد اطرافت رو با GPS پیدا کن.",
    "   شعاع دلخواه: از ۵ تا ۱۰۰ کیلومتر.",
    "   موقعیت دقیقت به هیچ‌کس نشون داده نمی‌شه.",
    "",
    `🔍 ${B.SEARCH}`,
    "   با فیلترهای هوشمند، آدم مناسب رو پیدا کن:",
    "   💌 مخاطب خاص  ·  📋 مشاهده همه",
    "   🏛 هم‌استانی  ·  👥 هم‌سن",
    "   🆕 کاربران تازه  ·  🚶 بدون چت",
    "   👀 چت‌های اخیر  ·  📡 جستجو با GPS",
    "   ❤️ محبوب‌ها  ·  🔬 جستجو پیشرفته",
    "",
    `👤 ${B.PROFILE}`,
    "   نام، بیو، علاقه‌مندی، شهر و موقعیتت رو ویرایش کن.",
    "   عکس بذار · احراز چهره · مخاطبینت رو مدیریت کن.",
    `   📊 تکمیل هر بخش پروفایل → +${formatNum(PROFILE_SECTION_REWARD)} سکه`,
    `   🛡✅ احراز چهره → نشان اعتماد + ${formatNum(FACE_VERIFY_REWARD)} سکه`,
    "",
    `💰 ${B.DIAMONDS}`,
    "   موجودیت رو ببین و بسته سکه بخر.",
    `   🎁 سکه روزانه: ${formatNum(DAILY_COIN_REWARD)} سکه رایگان — هر روز یک‌بار دکمه بالای لیست`,
    `   🎁 هدیه ورود: ${formatNum(WELCOME_DIAMONDS)} سکه برای کاربران جدید`,
    "",
    `   هر سکه: ${formatNum(COIN_PRICE_STARS)} Star یا ${formatNum(COIN_PRICE_TOMAN)} تومان`,
    "   👑 VIP — بزرگ‌ترین بسته (۴۰۰۰ سکه)",
    "",
    `🔗 ${B.REFERRAL}`,
    `   دوستت رو دعوت کن؛ بعد از تکمیل ثبت‌نام → +${formatNum(REFERRAL_BONUS)} سکه برای تو`,
    "",
    `🎭 ${B.ANON_LINK}`,
    "   لینک شخصی‌ات رو بفرست و پیام ناشناس دریافت کن.",
    "",
    "━━━━━━━━━━━━━━━━",
    "💬 روی پروفایل دیگران",
    "━━━━━━━━━━━━━━━━",
    "",
    `❤️ لایک → ${formatNum(LIKE_GIFT_DIAMONDS)} سکه هدیه به طرف مقابل`,
    `🧵 نخ دادن → هزینه ${formatNum(THREAD_GIFT_COST)} · طرف مقابل ${formatNum(THREAD_GIFT_RECIPIENT)} می‌گیره`,
    "🎁 هدیه سکه → ۱۰ / ۵۰ / ۱۰۰ / ۲۰۰",
    `✉️ پیام دایرکت → ${formatNum(DIRECT_MSG_COST)} سکه`,
    "💬 درخواست چت → باید طرف مقابل قبول کنه",
    "➕ افزودن به مخاطبین  ·  🚫 بلاک / آنبلاک",
    "",
    "━━━━━━━━━━━━━━━━",
    "🕶 چت ناشناس",
    "━━━━━━━━━━━━━━━━",
    "",
    "📝 متن · 📷 عکس · 🎬 ویدیو · 🎤 ویس · ✨ استیکر",
    "🔒 چت امن → عکس و ویدیو قابل ذخیره یا فوروارد نیست",
    "👤 وسط چت می‌تونی پروفایل طرف مقابل رو ببینی",
    "🔚 قطع چت → اول تأیید می‌گیریم، بعد پیشنهاد پاک‌سازی",
    "🧹 پاک کردن کل گفتگو برای هر دو طرف",
    "",
    "━━━━━━━━━━━━━━━━",
    "🚀 شتاب‌دهی و پرو",
    "━━━━━━━━━━━━━━━━",
    "",
    `🚀 شتاب‌دهی (/boost) → ${formatNum(BOOST_COST)} سکه / ${BOOST_HOURS} ساعت اولویت در جستجو`,
    "🅿️ اشتراک پرو (/pro) → نمایش ویژه و برجسته‌تر",
    `📣 پیام گروهی به ${formatNum(LIST_BLAST_LIMIT)} نفر → ${formatNum(LIST_BLAST_COST)} سکه`,
    "",
    "━━━━━━━━━━━━━━━━",
    "💡 نکات مهم",
    "━━━━━━━━━━━━━━━━",
    "",
    "🔐 هویتت در چت ناشناس محفوظ می‌مونه",
    "📍 مختصات دقیق GPS به کسی داده نمی‌شه",
    "📢 برای استفاده از ربات، ممکنه عضویت در کانال لازم باشه",
    "♻️ /start منو رو به‌روز می‌کنه — چت فعالت قطع نمی‌شه",
    "🔚 قطع چت: «قطع چت» یا /end",
    "",
    "دوردوریا — فاصله‌ها رو کوتاه کن 💞✨",
  ].join("\n");
}
