/** علاقه‌مندی‌های انتخابی پروفایل (حداکثر انتخاب همزمان) */
export const MAX_INTERESTS = 8;

export const INTERESTS: { id: string; label: string }[] = [
  { id: "sport", label: "⚽ ورزش" },
  { id: "gym", label: "🏋️ باشگاه" },
  { id: "football", label: "⚽️ فوتبال" },
  { id: "running", label: "🏃 دویدن" },
  { id: "yoga", label: "🧘 یوگا" },
  { id: "books", label: "📚 کتاب‌خوانی" },
  { id: "movies", label: "🎬 فیلم" },
  { id: "series", label: "📺 سریال" },
  { id: "music", label: "🎵 موسیقی" },
  { id: "concert", label: "🎤 کنسرت" },
  { id: "camping", label: "🏕️ کمپینگ" },
  { id: "travel", label: "✈️ سفر" },
  { id: "nature", label: "🌿 طبیعت" },
  { id: "hiking", label: "🥾 کوهنوردی" },
  { id: "photo", label: "📷 عکاسی" },
  { id: "art", label: "🎨 هنر" },
  { id: "cooking", label: "🍳 آشپزی" },
  { id: "coffee", label: "☕ قهوه" },
  { id: "food", label: "🍕 غذاخوری" },
  { id: "games", label: "🎮 بازی" },
  { id: "tech", label: "💻 تکنولوژی" },
  { id: "cars", label: "🚗 ماشین" },
  { id: "pets", label: "🐶 حیوانات" },
  { id: "fashion", label: "👗 مد" },
  { id: "dance", label: "💃 رقص" },
  { id: "lang", label: "🗣️ زبان‌آموزی" },
  { id: "volunteer", label: "🤝 داوطلبی" },
  { id: "invest", label: "📈 سرمایه‌گذاری" },
  { id: "poetry", label: "🪶 شعر و ادبیات" },
  { id: "board", label: "🎲 بازی فکری" },
];

export function parseInterests(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    const ids = new Set(INTERESTS.map((i) => i.id));
    return v.filter((x): x is string => typeof x === "string" && ids.has(x));
  } catch {
    return [];
  }
}

export function serializeInterests(ids: string[]): string {
  return JSON.stringify(ids);
}

export function formatInterestsLine(raw: string | null | undefined): string | null {
  const ids = parseInterests(raw);
  if (!ids.length) return null;
  const map = new Map(INTERESTS.map((i) => [i.id, i.label]));
  return ids.map((id) => map.get(id) ?? id).join(" · ");
}
