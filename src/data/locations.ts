/** داده مکان دوزبانه برای ثبت‌نام، جستجو و نمایش */

export type LocLang = "fa" | "en";

export type LocName = { fa: string; en: string };

function pick(name: LocName, lang: LocLang): string {
  return lang === "en" ? name.en : name.fa;
}

function norm(s: string): string {
  return s
    .trim()
    .replace(/\u200c/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function matchName(name: LocName, text: string): boolean {
  const t = norm(text);
  return norm(name.fa) === t || norm(name.en) === t;
}

export const LANGUAGES = [
  { id: "fa", fa: "🇮🇷 فارسی", en: "🇮🇷 فارسی" },
  { id: "en", fa: "🇬🇧 English", en: "🇬🇧 English" },
] as const;

export const COUNTRIES: { id: string; fa: string; en: string }[] = [
  { id: "IR", fa: "🇮🇷 ایران", en: "🇮🇷 Iran" },
  { id: "AF", fa: "🇦🇫 افغانستان", en: "🇦🇫 Afghanistan" },
  { id: "TR", fa: "🇹🇷 ترکیه", en: "🇹🇷 Turkey" },
  { id: "IQ", fa: "🇮🇶 عراق", en: "🇮🇶 Iraq" },
  { id: "AE", fa: "🇦🇪 امارات", en: "🇦🇪 UAE" },
  { id: "DE", fa: "🇩🇪 آلمان", en: "🇩🇪 Germany" },
  { id: "OTHER", fa: "🌍 سایر", en: "🌍 Other" },
];

type ProvinceDef = {
  /** نام فارسی canonical — در دیتابیس ذخیره می‌شود */
  fa: string;
  en: string;
  cities: LocName[];
};

function P(fa: string, en: string, cities: [string, string][]): ProvinceDef {
  return {
    fa,
    en,
    cities: cities.map(([cfa, cen]) => ({ fa: cfa, en: cen })),
  };
}

/** ۳۱ استان ایران + شهرهای اصلی */
const IRAN_LIST: ProvinceDef[] = [
  P("تهران", "Tehran", [
    ["تهران", "Tehran"],
    ["شهریار", "Shahriar"],
    ["اسلامشهر", "Eslamshahr"],
    ["ری", "Rey"],
    ["قدس", "Qods"],
    ["ملارد", "Malard"],
    ["پردیس", "Pardis"],
    ["ورامین", "Varamin"],
    ["پاکدشت", "Pakdasht"],
    ["رباط‌کریم", "Robat Karim"],
    ["بهارستان", "Baharestan"],
    ["دماوند", "Damavand"],
    ["فیروزکوه", "Firuzkuh"],
    ["سایر", "Other"],
  ]),
  P("البرز", "Alborz", [
    ["کرج", "Karaj"],
    ["فردیس", "Fardis"],
    ["ساوجبلاغ", "Savojbolagh"],
    ["نظرآباد", "Nazarabad"],
    ["طالقان", "Taleqan"],
    ["اشتهارد", "Eshtehard"],
    ["سایر", "Other"],
  ]),
  P("اصفهان", "Isfahan", [
    ["اصفهان", "Isfahan"],
    ["کاشان", "Kashan"],
    ["نجف‌آباد", "Najafabad"],
    ["خمینی‌شهر", "Khomeyni Shahr"],
    ["شاهین‌شهر", "Shahin Shahr"],
    ["فولادشهر", "Fooladshahr"],
    ["شهرضا", "Shahreza"],
    ["مبارکه", "Mobarakeh"],
    ["گلپایگان", "Golpayegan"],
    ["نطنز", "Natanz"],
    ["آران و بیدگل", "Aran va Bidgol"],
    ["سایر", "Other"],
  ]),
  P("فارس", "Fars", [
    ["شیراز", "Shiraz"],
    ["مرودشت", "Marvdasht"],
    ["جهرم", "Jahrom"],
    ["لار", "Lar"],
    ["فسا", "Fasa"],
    ["کازرون", "Kazerun"],
    ["داراب", "Darab"],
    ["آباده", "Abadeh"],
    ["نی‌ریز", "Neyriz"],
    ["اقلید", "Eqlid"],
    ["سایر", "Other"],
  ]),
  P("خراسان رضوی", "Razavi Khorasan", [
    ["مشهد", "Mashhad"],
    ["نیشابور", "Neyshabur"],
    ["سبزوار", "Sabzevar"],
    ["تربت‌حیدریه", "Torbat-e Heydarieh"],
    ["قوچان", "Quchan"],
    ["کاشمر", "Kashmar"],
    ["تربت‌جام", "Torbat-e Jam"],
    ["گناباد", "Gonabad"],
    ["چناران", "Chenaran"],
    ["سایر", "Other"],
  ]),
  P("آذربایجان شرقی", "East Azerbaijan", [
    ["تبریز", "Tabriz"],
    ["مراغه", "Maragheh"],
    ["مرند", "Marand"],
    ["میانه", "Mianeh"],
    ["اهر", "Ahar"],
    ["بناب", "Bonab"],
    ["سراب", "Sarab"],
    ["شبستر", "Shabestar"],
    ["سایر", "Other"],
  ]),
  P("آذربایجان غربی", "West Azerbaijan", [
    ["ارومیه", "Urmia"],
    ["خوی", "Khoy"],
    ["مهاباد", "Mahabad"],
    ["میاندوآب", "Miandoab"],
    ["بوکان", "Bukan"],
    ["سلماس", "Salmas"],
    ["نقده", "Naqadeh"],
    ["پیرانشهر", "Piranshahr"],
    ["سایر", "Other"],
  ]),
  P("مازندران", "Mazandaran", [
    ["ساری", "Sari"],
    ["بابل", "Babol"],
    ["آمل", "Amol"],
    ["قائم‌شهر", "Qaem Shahr"],
    ["چالوس", "Chalus"],
    ["تنکابن", "Tonekabon"],
    ["بابلسر", "Babolsar"],
    ["نوشهر", "Nowshahr"],
    ["رامسر", "Ramsar"],
    ["بهشهر", "Behshahr"],
    ["سایر", "Other"],
  ]),
  P("گیلان", "Gilan", [
    ["رشت", "Rasht"],
    ["بندر انزلی", "Bandar Anzali"],
    ["لاهیجان", "Lahijan"],
    ["آستارا", "Astara"],
    ["رودسر", "Rudsar"],
    ["لنگرود", "Langarud"],
    ["فومن", "Fuman"],
    ["صومعه‌سرا", "Sowme'eh Sara"],
    ["تالش", "Talesh"],
    ["سایر", "Other"],
  ]),
  P("خوزستان", "Khuzestan", [
    ["اهواز", "Ahvaz"],
    ["آبادان", "Abadan"],
    ["دزفول", "Dezful"],
    ["ماهشهر", "Mahshahr"],
    ["خرمشهر", "Khorramshahr"],
    ["اندیمشک", "Andimeshk"],
    ["بهبهان", "Behbahan"],
    ["شوشتر", "Shushtar"],
    ["ایذه", "Izeh"],
    ["سایر", "Other"],
  ]),
  P("کرمان", "Kerman", [
    ["کرمان", "Kerman"],
    ["رفسنجان", "Rafsanjan"],
    ["سیرجان", "Sirjan"],
    ["جیرفت", "Jiroft"],
    ["بم", "Bam"],
    ["زرند", "Zarand"],
    ["کهنوج", "Kahnuj"],
    ["شهربابک", "Shahr-e Babak"],
    ["سایر", "Other"],
  ]),
  P("هرمزگان", "Hormozgan", [
    ["بندرعباس", "Bandar Abbas"],
    ["میناب", "Minab"],
    ["قشم", "Qeshm"],
    ["کیش", "Kish"],
    ["بندرلنگه", "Bandar Lengeh"],
    ["حاجی‌آباد", "Hajiabad"],
    ["جاسک", "Jask"],
    ["سایر", "Other"],
  ]),
  P("یزد", "Yazd", [
    ["یزد", "Yazd"],
    ["میبد", "Meybod"],
    ["اردکان", "Ardakan"],
    ["تفت", "Taft"],
    ["بافق", "Bafq"],
    ["مهریز", "Mehriz"],
    ["سایر", "Other"],
  ]),
  P("قم", "Qom", [
    ["قم", "Qom"],
    ["سایر", "Other"],
  ]),
  P("قزوین", "Qazvin", [
    ["قزوین", "Qazvin"],
    ["تاکستان", "Takestan"],
    ["الوند", "Alvand"],
    ["آبیک", "Abyek"],
    ["بوئین‌زهرا", "Buin Zahra"],
    ["سایر", "Other"],
  ]),
  P("زنجان", "Zanjan", [
    ["زنجان", "Zanjan"],
    ["ابهر", "Abhar"],
    ["خدابنده", "Khodabandeh"],
    ["خرمدره", "Khorramdarreh"],
    ["قیدار", "Qeydar"],
    ["سایر", "Other"],
  ]),
  P("همدان", "Hamadan", [
    ["همدان", "Hamadan"],
    ["ملایر", "Malayer"],
    ["نهاوند", "Nahavand"],
    ["تویسرکان", "Tuyserkan"],
    ["اسدآباد", "Asadabad"],
    ["کبودرآهنگ", "Kabudarahang"],
    ["سایر", "Other"],
  ]),
  P("کرمانشاه", "Kermanshah", [
    ["کرمانشاه", "Kermanshah"],
    ["اسلام‌آباد غرب", "Eslamabad-e Gharb"],
    ["سنقر", "Sonqor"],
    ["کنگاور", "Kangavar"],
    ["جوانرود", "Javanrud"],
    ["پاوه", "Paveh"],
    ["سایر", "Other"],
  ]),
  P("کردستان", "Kurdistan", [
    ["سنندج", "Sanandaj"],
    ["سقز", "Saqqez"],
    ["مریوان", "Marivan"],
    ["بانه", "Baneh"],
    ["قروه", "Qorveh"],
    ["بیجار", "Bijar"],
    ["کامیاران", "Kamyaran"],
    ["سایر", "Other"],
  ]),
  P("لرستان", "Lorestan", [
    ["خرم‌آباد", "Khorramabad"],
    ["بروجرد", "Borujerd"],
    ["دورود", "Dorud"],
    ["الیگودرز", "Aligudarz"],
    ["کوهدشت", "Kuhdasht"],
    ["نورآباد", "Nurabad"],
    ["ازنا", "Azna"],
    ["سایر", "Other"],
  ]),
  P("مرکزی", "Markazi", [
    ["اراک", "Arak"],
    ["ساوه", "Saveh"],
    ["محلات", "Mahallat"],
    ["خمین", "Khomein"],
    ["دلیجان", "Delijan"],
    ["شازند", "Shazand"],
    ["سایر", "Other"],
  ]),
  P("سمنان", "Semnan", [
    ["سمنان", "Semnan"],
    ["شاهرود", "Shahrud"],
    ["دامغان", "Damghan"],
    ["گرمسار", "Garmsar"],
    ["مهدی‌شهر", "Mahdishahr"],
    ["سایر", "Other"],
  ]),
  P("گلستان", "Golestan", [
    ["گرگان", "Gorgan"],
    ["گنبد کاووس", "Gonbad-e Kavus"],
    ["علی‌آباد کتول", "Aliabad-e Katul"],
    ["بندر ترکمن", "Bandar Torkaman"],
    ["آق‌قلا", "Aqqala"],
    ["کردکوی", "Kordkuy"],
    ["مینودشت", "Minudasht"],
    ["سایر", "Other"],
  ]),
  P("بوشهر", "Bushehr", [
    ["بوشهر", "Bushehr"],
    ["برازجان", "Borazjan"],
    ["کنگان", "Kangan"],
    ["عسلویه", "Asaluyeh"],
    ["گناوه", "Genaveh"],
    ["دیر", "Dayyer"],
    ["سایر", "Other"],
  ]),
  P("چهارمحال و بختیاری", "Chaharmahal and Bakhtiari", [
    ["شهرکرد", "Shahrekord"],
    ["بروجن", "Borujen"],
    ["فارسان", "Farsan"],
    ["لردگان", "Lordegan"],
    ["کیان", "Kian"],
    ["سایر", "Other"],
  ]),
  P("کهگیلویه و بویراحمد", "Kohgiluyeh and Boyer-Ahmad", [
    ["یاسوج", "Yasuj"],
    ["دهدشت", "Dehdasht"],
    ["گچساران", "Gachsaran"],
    ["باشت", "Basht"],
    ["سایر", "Other"],
  ]),
  P("ایلام", "Ilam", [
    ["ایلام", "Ilam"],
    ["دهلران", "Dehloran"],
    ["مهران", "Mehran"],
    ["آبدانان", "Abdanan"],
    ["ایوان", "Eyvan"],
    ["سایر", "Other"],
  ]),
  P("اردبیل", "Ardabil", [
    ["اردبیل", "Ardabil"],
    ["مشگین‌شهر", "Meshginshahr"],
    ["پارس‌آباد", "Parsabad"],
    ["خلخال", "Khalkhal"],
    ["گرمی", "Germi"],
    ["سایر", "Other"],
  ]),
  P("خراسان شمالی", "North Khorasan", [
    ["بجنورد", "Bojnurd"],
    ["شیروان", "Shirvan"],
    ["اسفراین", "Esfarayen"],
    ["جاجرم", "Jajarm"],
    ["فاروج", "Faruj"],
    ["سایر", "Other"],
  ]),
  P("خراسان جنوبی", "South Khorasan", [
    ["بیرجند", "Birjand"],
    ["قائن", "Qaen"],
    ["فردوس", "Ferdows"],
    ["طبس", "Tabas"],
    ["نهبندان", "Nehbandan"],
    ["سایر", "Other"],
  ]),
  P("سیستان و بلوچستان", "Sistan and Baluchestan", [
    ["زاهدان", "Zahedan"],
    ["زابل", "Zabol"],
    ["چابهار", "Chabahar"],
    ["ایرانشهر", "Iranshahr"],
    ["خاش", "Khash"],
    ["سراوان", "Saravan"],
    ["کنارک", "Konarak"],
    ["سایر", "Other"],
  ]),
];

/** نام‌های قدیمی → canonical */
const IRAN_ALIASES: Record<string, string> = {
  آذربایجانشرقی: "آذربایجان شرقی",
  آذربایجانغربی: "آذربایجان غربی",
  چهارمحال: "چهارمحال و بختیاری",
  "چهار محال": "چهارمحال و بختیاری",
  کهگیلویه: "کهگیلویه و بویراحمد",
  سیستان: "سیستان و بلوچستان",
  انزلی: "بندر انزلی",
  گنبد: "گنبد کاووس",
  علی‌آباد: "علی‌آباد کتول",
  بندرترکمن: "بندر ترکمن",
  "اسلام‌آبادغرب": "اسلام‌آباد غرب",
};

export const IRAN_PROVINCES: Record<string, string[]> = Object.fromEntries(
  IRAN_LIST.map((p) => [p.fa, p.cities.map((c) => c.fa)]),
);

const IRAN_BY_FA = new Map(IRAN_LIST.map((p) => [p.fa, p]));

const AFGHAN_LIST: ProvinceDef[] = [
  P("کابل", "Kabul", [
    ["کابل", "Kabul"],
    ["پغمان", "Paghman"],
    ["بگرامی", "Bagrami"],
    ["سایر", "Other"],
  ]),
  P("هرات", "Herat", [
    ["هرات", "Herat"],
    ["انجیل", "Injil"],
    ["سایر", "Other"],
  ]),
  P("بلخ", "Balkh", [
    ["مزارشریف", "Mazar-i-Sharif"],
    ["بلخ", "Balkh"],
    ["سایر", "Other"],
  ]),
  P("قندهار", "Kandahar", [
    ["قندهار", "Kandahar"],
    ["سایر", "Other"],
  ]),
  P("ننگرهار", "Nangarhar", [
    ["جلال‌آباد", "Jalalabad"],
    ["سایر", "Other"],
  ]),
  P("بدخشان", "Badakhshan", [
    ["فیض‌آباد", "Fayzabad"],
    ["سایر", "Other"],
  ]),
  P("بامیان", "Bamyan", [
    ["بامیان", "Bamyan"],
    ["سایر", "Other"],
  ]),
  P("پکتیا", "Paktia", [
    ["گردیز", "Gardez"],
    ["سایر", "Other"],
  ]),
  P("هلمند", "Helmand", [
    ["لشکرگاه", "Lashkargah"],
    ["سایر", "Other"],
  ]),
  P("سایر", "Other", [["سایر شهرها", "Other cities"]]),
];

export const AFGHAN_PROVINCES: Record<string, string[]> = Object.fromEntries(
  AFGHAN_LIST.map((p) => [p.fa, p.cities.map((c) => c.fa)]),
);

const TURKEY_LIST: ProvinceDef[] = [
  P("استانبول", "Istanbul", [
    ["استانبول", "Istanbul"],
    ["سایر", "Other"],
  ]),
  P("آنکارا", "Ankara", [
    ["آنکارا", "Ankara"],
    ["سایر", "Other"],
  ]),
  P("ازمیر", "Izmir", [
    ["ازمیر", "Izmir"],
    ["سایر", "Other"],
  ]),
  P("آنتالیا", "Antalya", [
    ["آنتالیا", "Antalya"],
    ["سایر", "Other"],
  ]),
  P("بورسا", "Bursa", [
    ["بورسا", "Bursa"],
    ["سایر", "Other"],
  ]),
  P("آدانا", "Adana", [
    ["آدانا", "Adana"],
    ["سایر", "Other"],
  ]),
  P("غازی‌عینتاب", "Gaziantep", [
    ["غازی‌عینتاب", "Gaziantep"],
    ["سایر", "Other"],
  ]),
  P("قونیه", "Konya", [
    ["قونیه", "Konya"],
    ["سایر", "Other"],
  ]),
  P("مرسین", "Mersin", [
    ["مرسین", "Mersin"],
    ["سایر", "Other"],
  ]),
  P("سایر", "Other", [["سایر شهرها", "Other cities"]]),
];

export const TURKEY_PROVINCES: Record<string, string[]> = Object.fromEntries(
  TURKEY_LIST.map((p) => [p.fa, p.cities.map((c) => c.fa)]),
);

const SIMPLE_COUNTRY: Record<string, ProvinceDef[]> = {
  IQ: [
    P("بغداد", "Baghdad", [
      ["بغداد", "Baghdad"],
      ["سایر", "Other"],
    ]),
    P("اربیل", "Erbil", [
      ["اربیل", "Erbil"],
      ["سایر", "Other"],
    ]),
    P("بصره", "Basra", [
      ["بصره", "Basra"],
      ["سایر", "Other"],
    ]),
    P("نجف", "Najaf", [
      ["نجف", "Najaf"],
      ["سایر", "Other"],
    ]),
    P("کربلا", "Karbala", [
      ["کربلا", "Karbala"],
      ["سایر", "Other"],
    ]),
    P("سایر", "Other", [["سایر شهرها", "Other cities"]]),
  ],
  AE: [
    P("دبی", "Dubai", [
      ["دبی", "Dubai"],
      ["سایر", "Other"],
    ]),
    P("ابوظبی", "Abu Dhabi", [
      ["ابوظبی", "Abu Dhabi"],
      ["سایر", "Other"],
    ]),
    P("شارجه", "Sharjah", [
      ["شارجه", "Sharjah"],
      ["سایر", "Other"],
    ]),
    P("سایر", "Other", [["سایر شهرها", "Other cities"]]),
  ],
  DE: [
    P("برلین", "Berlin", [
      ["برلین", "Berlin"],
      ["سایر", "Other"],
    ]),
    P("هامبورگ", "Hamburg", [
      ["هامبورگ", "Hamburg"],
      ["سایر", "Other"],
    ]),
    P("مونیخ", "Munich", [
      ["مونیخ", "Munich"],
      ["سایر", "Other"],
    ]),
    P("کلن", "Cologne", [
      ["کلن", "Cologne"],
      ["سایر", "Other"],
    ]),
    P("فرانکفورت", "Frankfurt", [
      ["فرانکفورت", "Frankfurt"],
      ["سایر", "Other"],
    ]),
    P("سایر", "Other", [["سایر شهرها", "Other cities"]]),
  ],
  OTHER: [P("سایر", "Other", [["سایر شهرها", "Other cities"]])],
};

function provinceListFor(country: string): ProvinceDef[] {
  if (country === "IR") return IRAN_LIST;
  if (country === "AF") return AFGHAN_LIST;
  if (country === "TR") return TURKEY_LIST;
  return SIMPLE_COUNTRY[country] ?? SIMPLE_COUNTRY.OTHER!;
}

function findProvinceDef(
  country: string,
  provinceText: string,
): ProvinceDef | null {
  const list = provinceListFor(country);
  const alias = IRAN_ALIASES[provinceText] ?? provinceText;
  for (const p of list) {
    if (
      matchName({ fa: p.fa, en: p.en }, alias) ||
      matchName({ fa: p.fa, en: p.en }, provinceText)
    ) {
      return p;
    }
  }
  return list.find((p) => p.fa === provinceText || p.fa === alias) ?? null;
}

type RegionDef = { fa: string; en: string; provinces: string[] };

export const IRAN_REGION_DEFS: RegionDef[] = [
  {
    fa: "شمال",
    en: "North",
    provinces: ["گیلان", "مازندران", "گلستان"],
  },
  {
    fa: "شمال‌غرب",
    en: "Northwest",
    provinces: ["آذربایجان شرقی", "آذربایجان غربی", "اردبیل", "زنجان"],
  },
  {
    fa: "غرب",
    en: "West",
    provinces: ["کردستان", "کرمانشاه", "همدان", "ایلام", "لرستان"],
  },
  {
    fa: "مرکز",
    en: "Central",
    provinces: ["تهران", "البرز", "قم", "قزوین", "مرکزی", "سمنان", "اصفهان", "یزد"],
  },
  {
    fa: "جنوب",
    en: "South",
    provinces: [
      "فارس",
      "بوشهر",
      "هرمزگان",
      "خوزستان",
      "کهگیلویه و بویراحمد",
      "چهارمحال و بختیاری",
    ],
  },
  {
    fa: "شرق",
    en: "East",
    provinces: [
      "خراسان رضوی",
      "خراسان شمالی",
      "خراسان جنوبی",
      "سیستان و بلوچستان",
      "کرمان",
    ],
  },
];

export const IRAN_REGIONS: Record<string, string[]> = Object.fromEntries(
  IRAN_REGION_DEFS.map((r) => [r.fa, r.provinces]),
);

export function iranRegionChoices(
  lang: LocLang | string | null = "fa",
): { id: string; label: string }[] {
  const L: LocLang = lang === "en" ? "en" : "fa";
  return IRAN_REGION_DEFS.map((r) => {
    const sampleNames = r.provinces.slice(0, 2).map((pf) => {
      const def = IRAN_BY_FA.get(pf);
      return def ? pick({ fa: def.fa, en: def.en }, L) : pf;
    });
    const sample = sampleNames.join(L === "en" ? ", " : "، ");
    const more = r.provinces.length > 2 ? "…" : "";
    const title = L === "en" ? r.en : r.fa;
    return { id: r.fa, label: `${title} (${sample}${more})` };
  });
}

export function iranRegions(): string[] {
  return IRAN_REGION_DEFS.map((r) => r.fa);
}

export function regionLabel(
  regionId: string | null | undefined,
  lang: LocLang | string | null = "fa",
): string {
  if (!regionId) return "—";
  const L: LocLang = lang === "en" ? "en" : "fa";
  const r = IRAN_REGION_DEFS.find(
    (x) => x.fa === regionId || x.en === regionId,
  );
  if (!r) return regionId;
  return L === "en" ? r.en : r.fa;
}

export function resolveIranRegion(text: string): string | null {
  const t = text.trim();
  for (const r of IRAN_REGION_DEFS) {
    if (
      t === r.fa ||
      t === r.en ||
      norm(t) === norm(r.fa) ||
      norm(t) === norm(r.en)
    ) {
      return r.fa;
    }
  }
  const hit = iranRegionChoices("fa")
    .concat(iranRegionChoices("en"))
    .find((c) => c.label === t);
  if (hit) return hit.id;
  for (const r of IRAN_REGION_DEFS) {
    if (
      t.startsWith(`${r.fa} `) ||
      t.startsWith(`${r.fa}(`) ||
      t.startsWith(`${r.en} `) ||
      t.startsWith(`${r.en}(`)
    ) {
      return r.fa;
    }
  }
  return null;
}

export function provincesInRegion(region: string): string[] | null {
  const id = resolveIranRegion(region) ?? region;
  return IRAN_REGIONS[id] ?? null;
}

export function iranRegionPrompt(
  lang: LocLang | string | null = "fa",
): string {
  if (lang === "en") {
    return [
      "3/8 — Where is your province?",
      "",
      "Iran has many provinces — first pick your region",
      "to shorten the list, then choose the exact province.",
      "",
      "Examples:",
      "• Tehran / Karaj / Isfahan → Central",
      "• Gilan / Mazandaran → North",
      "• Shiraz / Ahvaz → South",
    ].join("\n");
  }
  return [
    "۳/۸ — استانت کجاست؟",
    "",
    "استان‌های ایران زیادند؛ اول منطقه‌ات را بزن",
    "تا لیست کوتاه شود، بعد استان دقیق را انتخاب کن.",
    "",
    "مثال:",
    "• تهران / کرج / اصفهان → مرکز",
    "• گیلان / مازندران → شمال",
    "• شیراز / اهواز → جنوب",
  ].join("\n");
}

export function provincesForCountry(country: string): string[] {
  return provinceListFor(country).map((p) => p.fa);
}

export function citiesFor(country: string, province: string): string[] {
  const def = findProvinceDef(country, province);
  if (!def) return ["سایر"];
  return def.cities.map((c) => c.fa);
}

export function provinceLabels(
  country: string,
  lang: LocLang | string | null = "fa",
  region?: string,
): string[] {
  const L: LocLang = lang === "en" ? "en" : "fa";
  let list = provinceListFor(country);
  if (country === "IR" && region) {
    const ids = provincesInRegion(region) ?? [];
    list = ids
      .map((fa) => IRAN_BY_FA.get(fa))
      .filter((p): p is ProvinceDef => !!p);
  }
  return list.map((p) => pick({ fa: p.fa, en: p.en }, L));
}

export function cityLabels(
  country: string,
  province: string,
  lang: LocLang | string | null = "fa",
): string[] {
  const L: LocLang = lang === "en" ? "en" : "fa";
  const def = findProvinceDef(country, province);
  if (!def) return [L === "en" ? "Other" : "سایر"];
  return def.cities.map((c) => pick(c, L));
}

export function resolveCountry(
  text: string,
): (typeof COUNTRIES)[number] | null {
  const t = text.trim();
  return (
    COUNTRIES.find(
      (c) =>
        c.id === t ||
        c.fa === t ||
        c.en === t ||
        norm(c.fa) === norm(t) ||
        norm(c.en) === norm(t),
    ) ?? null
  );
}

export function resolveProvince(country: string, text: string): string | null {
  return findProvinceDef(country, text)?.fa ?? null;
}

export function resolveCity(
  country: string,
  province: string,
  text: string,
): string | null {
  const def = findProvinceDef(country, province);
  if (!def) {
    if (
      text === "سایر" ||
      text === "Other" ||
      text === "سایر شهرها" ||
      text === "Other cities"
    ) {
      return "سایر";
    }
    return null;
  }
  const hit = def.cities.find((c) => matchName(c, text));
  return hit?.fa ?? null;
}

export function provinceLabel(
  province: string | null | undefined,
  lang: LocLang | string | null = "fa",
  country = "IR",
): string {
  if (!province) return "—";
  const L: LocLang = lang === "en" ? "en" : "fa";
  const def = findProvinceDef(country, province);
  if (def) return pick({ fa: def.fa, en: def.en }, L);
  for (const c of ["IR", "AF", "TR", "IQ", "AE", "DE", "OTHER"]) {
    const d = findProvinceDef(c, province);
    if (d) return pick({ fa: d.fa, en: d.en }, L);
  }
  return province;
}

export function cityLabel(
  city: string | null | undefined,
  lang: LocLang | string | null = "fa",
  country = "IR",
  province?: string | null,
): string {
  if (!city) return "—";
  const L: LocLang = lang === "en" ? "en" : "fa";
  if (province) {
    const def = findProvinceDef(country, province);
    const hit = def?.cities.find((c) => matchName(c, city) || c.fa === city);
    if (hit) return pick(hit, L);
  }
  for (const c of ["IR", "AF", "TR", "IQ", "AE", "DE", "OTHER"]) {
    for (const p of provinceListFor(c)) {
      const hit = p.cities.find((x) => matchName(x, city) || x.fa === city);
      if (hit) return pick(hit, L);
    }
  }
  if (city === "سایر" || city === "سایر شهرها") {
    return L === "en" ? "Other" : city;
  }
  return city;
}

export function countryLabel(
  id: string | null | undefined,
  lang: LocLang | string | null = "fa",
): string {
  const L: LocLang = lang === "en" ? "en" : "fa";
  const c = COUNTRIES.find((x) => x.id === id);
  if (!c) return id ?? "—";
  return L === "en" ? c.en : c.fa;
}

export function languageLabel(id: string | null | undefined): string {
  return LANGUAGES.find((l) => l.id === id)?.fa ?? id ?? "—";
}

export function formatLocation(
  opts: {
    city?: string | null;
    province?: string | null;
    country?: string | null;
  },
  lang: LocLang | string | null = "fa",
): string {
  const L: LocLang = lang === "en" ? "en" : "fa";
  const country = opts.country ?? "IR";
  const parts = [
    cityLabel(opts.city, L, country, opts.province),
    provinceLabel(opts.province, L, country),
  ].filter((p) => p && p !== "—");
  return parts.join(L === "en" ? ", " : "، ");
}

export function countryChoices(lang: LocLang | string | null = "fa") {
  const L: LocLang = lang === "en" ? "en" : "fa";
  return COUNTRIES.map((c) => ({
    id: c.id,
    label: L === "en" ? c.en : c.fa,
  }));
}
