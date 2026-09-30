import { InlineKeyboard } from "grammy";
import {
  IRAN_REGIONS,
  iranRegionChoices,
  provincesInRegion,
  citiesFor,
  provinceLabel,
  cityLabel,
} from "../data/locations.js";
import { AGE_RANGES_I18N } from "../i18n/buttons.js";
import { normalizeLang, tr, type Lang } from "../i18n/index.js";
import type { ExploreOpts } from "./explore.js";

export type AdvDraft = {
  gender?: "female" | "male" | "any";
  /** null = همه استان‌ها */
  province?: string | null;
  /** null = همه شهرهای استان */
  city?: string | null;
  /** null = همه سن‌ها */
  ageMin?: number | null;
  ageMax?: number | null;
  /** null = همه / بدون محدودیت زمان */
  onlineHours?: number | null;
};

const drafts = new Map<number, AdvDraft>();

export function getAdvDraft(userId: number): AdvDraft {
  return drafts.get(userId) ?? {};
}

export function setAdvDraft(userId: number, patch: Partial<AdvDraft>) {
  const next = { ...getAdvDraft(userId), ...patch };
  drafts.set(userId, next);
  return next;
}

export function clearAdvDraft(userId: number) {
  drafts.delete(userId);
}

export function advDraftToExploreOpts(draft: AdvDraft): ExploreOpts {
  const opts: ExploreOpts = {
    ignoreLookingFor: true,
    gender: draft.gender ?? "any",
    advanced: true,
  };
  if (draft.province) opts.province = draft.province;
  if (draft.city) opts.city = draft.city;
  if (draft.ageMin != null) opts.ageMin = draft.ageMin;
  if (draft.ageMax != null) opts.ageMax = draft.ageMax;
  if (draft.onlineHours !== undefined) {
    opts.onlineHours = draft.onlineHours;
  }
  return opts;
}

export function advCancelKeyboard(lang: Lang | string | null = "fa") {
  const L = normalizeLang(lang);
  return new InlineKeyboard()
    .text(tr(L, "❌ انصراف", "❌ Cancel"), "adv:cancel")
    .danger();
}

/** مرحله ۱ — جنسیت */
export function advGenderKeyboard(lang: Lang | string | null = "fa") {
  const L = normalizeLang(lang);
  return new InlineKeyboard()
    .text(tr(L, "👩 دختر", "👩 Girls"), "adv:g:female")
    .success()
    .text(tr(L, "👨 پسر", "👨 Boys"), "adv:g:male")
    .primary()
    .row()
    .text(tr(L, "👥 هردو", "👥 Both"), "adv:g:any")
    .primary()
    .row()
    .text(tr(L, "❌ انصراف", "❌ Cancel"), "adv:cancel")
    .danger();
}

/** مرحله ۲ — استان/شهر */
export function advLocationKeyboard(
  meProvince: string | null,
  lang: Lang | string | null = "fa",
) {
  const L = normalizeLang(lang);
  const kb = new InlineKeyboard();
  if (meProvince) {
    kb.text(
      tr(
        L,
        `📍 استان خودم (${provinceLabel(meProvince, L)})`,
        `📍 My province (${provinceLabel(meProvince, "en")})`,
      ),
      "adv:loc:mine",
    )
      .success()
      .row();
  }
  kb.text(tr(L, "🗺 انتخاب استان و شهر", "🗺 Pick province & city"), "adv:loc:pick")
    .primary()
    .row()
    .text(tr(L, "🌍 همه ایران", "🌍 All of Iran"), "adv:loc:any")
    .primary()
    .row()
    .text(tr(L, "❌ انصراف", "❌ Cancel"), "adv:cancel")
    .danger();
  return kb;
}

export function advRegionKeyboard(lang: Lang | string | null = "fa") {
  const L = normalizeLang(lang);
  const kb = new InlineKeyboard();
  const regions = iranRegionChoices(L);
  regions.forEach((r, i) => {
    kb.text(r.label, `adv:reg:${i}`);
    if ((i + 1) % 2 === 0) kb.row();
  });
  if (regions.length % 2 !== 0) kb.row();
  kb.text(tr(L, "↩️ بازگشت", "↩️ Back"), "adv:back:gender")
    .primary()
    .text(tr(L, "❌ انصراف", "❌ Cancel"), "adv:cancel")
    .danger();
  return kb;
}

export function advProvinceKeyboard(
  regionIndex: number,
  lang: Lang | string | null = "fa",
) {
  const L = normalizeLang(lang);
  const regions = Object.keys(IRAN_REGIONS);
  const region = regions[regionIndex];
  const list = region ? provincesInRegion(region) ?? [] : [];
  const kb = new InlineKeyboard();
  list.forEach((p, i) => {
    kb.text(provinceLabel(p, L), `adv:pv:${regionIndex}:${i}`);
    if ((i + 1) % 2 === 0) kb.row();
  });
  if (list.length % 2 !== 0) kb.row();
  kb.text(tr(L, "↩️ بازگشت", "↩️ Back"), "adv:loc:pick")
    .primary()
    .text(tr(L, "❌ انصراف", "❌ Cancel"), "adv:cancel")
    .danger();
  return { kb, region, list };
}

export function advCityKeyboard(
  province: string,
  lang: Lang | string | null = "fa",
) {
  const L = normalizeLang(lang);
  const cities = citiesFor("IR", province);
  const kb = new InlineKeyboard();
  kb.text(
    tr(L, "🏙 همه شهرهای این استان", "🏙 All cities in province"),
    "adv:ct:all",
  )
    .success()
    .row();
  cities.forEach((c, i) => {
    kb.text(cityLabel(c, L, "IR", province), `adv:ct:${i}`);
    if ((i + 1) % 2 === 0) kb.row();
  });
  if (cities.length % 2 !== 0) kb.row();
  kb.text(tr(L, "↩️ بازگشت", "↩️ Back"), "adv:loc:pick")
    .primary()
    .text(tr(L, "❌ انصراف", "❌ Cancel"), "adv:cancel")
    .danger();
  return { kb, cities };
}

/** مرحله ۳ — بازه سنی */
export function advAgeKeyboard(lang: Lang | string | null = "fa") {
  const L = normalizeLang(lang);
  const kb = new InlineKeyboard();
  const ranges = AGE_RANGES_I18N[L];
  ranges.forEach((r, i) => {
    kb.text(r.label, `adv:age:${i}`);
    if ((i + 1) % 2 === 0) kb.row();
  });
  if (ranges.length % 2 !== 0) kb.row();
  kb.text(tr(L, "🔢 همه سن‌ها", "🔢 All ages"), "adv:age:all")
    .primary()
    .row()
    .text(tr(L, "↩️ بازگشت", "↩️ Back"), "adv:back:loc")
    .primary()
    .text(tr(L, "❌ انصراف", "❌ Cancel"), "adv:cancel")
    .danger();
  return kb;
}

/** مرحله ۴ — زمان آنلاین */
export function advOnlineKeyboard(lang: Lang | string | null = "fa") {
  const L = normalizeLang(lang);
  return new InlineKeyboard()
    .text(tr(L, "🟢 تا ۱ ساعت قبل", "🟢 Last 1 hour"), "adv:on:1")
    .success()
    .row()
    .text(tr(L, "🟢 تا ۶ ساعت قبل", "🟢 Last 6 hours"), "adv:on:6")
    .success()
    .row()
    .text(tr(L, "🟡 تا ۱ روز قبل", "🟡 Last 1 day"), "adv:on:24")
    .primary()
    .row()
    .text(tr(L, "🟡 تا ۲ روز قبل", "🟡 Last 2 days"), "adv:on:48")
    .primary()
    .row()
    .text(tr(L, "⚪ همه (بدون محدودیت)", "⚪ All (no limit)"), "adv:on:all")
    .primary()
    .row()
    .text(tr(L, "↩️ بازگشت", "↩️ Back"), "adv:back:age")
    .primary()
    .text(tr(L, "❌ انصراف", "❌ Cancel"), "adv:cancel")
    .danger();
}

export function resolveRegionByIndex(index: number): string | null {
  return Object.keys(IRAN_REGIONS)[index] ?? null;
}

export function resolveProvinceByIndex(
  regionIndex: number,
  provinceIndex: number,
): string | null {
  const region = resolveRegionByIndex(regionIndex);
  if (!region) return null;
  return (provincesInRegion(region) ?? [])[provinceIndex] ?? null;
}

export function summarizeDraft(draft: AdvDraft, lang: Lang | string | null = "fa") {
  const L = normalizeLang(lang);
  const gender =
    draft.gender === "female"
      ? tr(L, "دختر", "girls")
      : draft.gender === "male"
        ? tr(L, "پسر", "boys")
        : tr(L, "هردو", "both");
  const loc =
    draft.province == null && draft.city == null
      ? tr(L, "همه ایران", "all Iran")
      : draft.city
        ? `${cityLabel(draft.city, L, "IR", draft.province)} / ${provinceLabel(draft.province, L)}`
        : tr(
            L,
            `استان ${provinceLabel(draft.province, L)} (همه شهرها)`,
            `province ${provinceLabel(draft.province, "en")} (all cities)`,
          );
  const age =
    draft.ageMin != null && draft.ageMax != null
      ? `${draft.ageMin}–${draft.ageMax}`
      : tr(L, "همه سن‌ها", "all ages");
  const online =
    draft.onlineHours == null
      ? tr(L, "همه", "all")
      : draft.onlineHours <= 1
        ? tr(L, "تا ۱ ساعت قبل", "last 1h")
        : draft.onlineHours <= 6
          ? tr(L, "تا ۶ ساعت قبل", "last 6h")
          : draft.onlineHours <= 24
            ? tr(L, "تا ۱ روز قبل", "last 1 day")
            : tr(L, "تا ۲ روز قبل", "last 2 days");
  return tr(
    L,
    `جنسیت: ${gender}\nمکان: ${loc}\nسن: ${age}\nآنلاین: ${online}`,
    `Gender: ${gender}\nLocation: ${loc}\nAge: ${age}\nOnline: ${online}`,
  );
}
