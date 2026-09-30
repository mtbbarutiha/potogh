import type { Api } from "grammy";
import type { User } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { formatNum, PROFILE_SECTION_REWARD } from "../data/packages.js";
import { parseInterests } from "../data/interests.js";
import { langOf, t, tr, type Lang } from "../i18n/index.js";

export type ProfileSectionId =
  | "name"
  | "age"
  | "gender"
  | "looking"
  | "bio"
  | "interests"
  | "city"
  | "gps"
  | "photo"
  | "face";

type SectionDef = {
  id: ProfileSectionId;
  labelFa: string;
  labelEn: string;
  isComplete: (user: User) => boolean;
};

export const PROFILE_SECTIONS: SectionDef[] = [
  {
    id: "name",
    labelFa: "نام",
    labelEn: "Name",
    isComplete: (u) => !!u.displayName?.trim(),
  },
  {
    id: "age",
    labelFa: "سن",
    labelEn: "Age",
    isComplete: (u) => u.age != null && u.age >= 18,
  },
  {
    id: "gender",
    labelFa: "جنسیت",
    labelEn: "Gender",
    isComplete: (u) => !!u.gender,
  },
  {
    id: "looking",
    labelFa: "علاقه (جستجو)",
    labelEn: "Looking for",
    isComplete: (u) => !!u.lookingFor,
  },
  {
    id: "bio",
    labelFa: "بیو",
    labelEn: "Bio",
    isComplete: (u) => !!u.bio?.trim(),
  },
  {
    id: "interests",
    labelFa: "علاقه‌مندی‌ها",
    labelEn: "Interests",
    isComplete: (u) => parseInterests(u.interests).length > 0,
  },
  {
    id: "city",
    labelFa: "شهر",
    labelEn: "City",
    isComplete: (u) => !!u.city?.trim(),
  },
  {
    id: "gps",
    labelFa: "موقعیت GPS",
    labelEn: "GPS location",
    isComplete: (u) => u.latitude != null && u.longitude != null,
  },
  {
    id: "photo",
    labelFa: "عکس پروفایل",
    labelEn: "Profile photo",
    isComplete: (u) => u.photoStatus === "approved",
  },
  {
    id: "face",
    labelFa: "احراز چهره",
    labelEn: "Face verify",
    isComplete: (u) => u.faceVerified,
  },
];

const SECTION_IDS = new Set(PROFILE_SECTIONS.map((s) => s.id));

export function parseRewardedSections(raw: string | null | undefined): ProfileSectionId[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter(
      (x): x is ProfileSectionId =>
        typeof x === "string" && SECTION_IDS.has(x as ProfileSectionId),
    );
  } catch {
    return [];
  }
}

export function sectionLabel(id: ProfileSectionId, lang: Lang): string {
  const s = PROFILE_SECTIONS.find((x) => x.id === id);
  if (!s) return id;
  return tr(lang, s.labelFa, s.labelEn);
}

export function getCompletedSectionIds(user: User): ProfileSectionId[] {
  return PROFILE_SECTIONS.filter((s) => s.isComplete(user)).map((s) => s.id);
}

export function getIncompleteSectionIds(user: User): ProfileSectionId[] {
  return PROFILE_SECTIONS.filter((s) => !s.isComplete(user)).map((s) => s.id);
}

export function getProfileCompletionPercent(user: User): number {
  const total = PROFILE_SECTIONS.length;
  if (total === 0) return 100;
  const done = getCompletedSectionIds(user).length;
  return Math.round((done / total) * 100);
}

export function profileCompletionLine(user: User, lang: Lang): string {
  const pct = getProfileCompletionPercent(user);
  return t(lang, "profile_completion_pct", { pct: formatNum(pct) });
}

export type ProfileRewardResult = {
  rewarded: ProfileSectionId[];
  coins: number;
  balance: number;
  percent: number;
};

export async function checkProfileCompletionRewards(
  userId: number,
  opts?: { api?: Api; telegramId?: bigint | number; notify?: boolean },
): Promise<ProfileRewardResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) {
    return { rewarded: [], coins: 0, balance: 0, percent: 0 };
  }

  const already = new Set(parseRewardedSections(user.profileRewardedSections));
  const newlyCompleted = PROFILE_SECTIONS.filter(
    (s) => !already.has(s.id) && s.isComplete(user),
  ).map((s) => s.id);

  if (newlyCompleted.length === 0) {
    return {
      rewarded: [],
      coins: 0,
      balance: user.diamonds,
      percent: getProfileCompletionPercent(user),
    };
  }

  const coins = newlyCompleted.length * PROFILE_SECTION_REWARD;
  const updatedRewarded = [...already, ...newlyCompleted];
  const prevSections = user.profileRewardedSections;

  const updatedCount = await prisma.$transaction(async (tx) => {
    const result = await tx.user.updateMany({
      where: { id: userId, profileRewardedSections: prevSections },
      data: {
        diamonds: { increment: coins },
        profileRewardedSections: JSON.stringify(updatedRewarded),
      },
    });
    return result.count;
  });
  if (updatedCount !== 1) {
    return {
      rewarded: [],
      coins: 0,
      balance: user.diamonds,
      percent: getProfileCompletionPercent(user),
    };
  }

  const updated = await prisma.user.findUnique({ where: { id: userId } });
  if (!updated) {
    return {
      rewarded: [],
      coins: 0,
      balance: user.diamonds,
      percent: getProfileCompletionPercent(user),
    };
  }

  const percent = getProfileCompletionPercent(updated);
  const notify = opts?.notify !== false;

  if (notify && opts?.api && opts.telegramId != null) {
    const lang = langOf(user);
    const lines = newlyCompleted.map((id) => `• ${sectionLabel(id, lang)}`);
    const msg = [
      t(lang, "profile_section_reward", {
        n: formatNum(coins),
        count: formatNum(newlyCompleted.length),
      }),
      "",
      ...lines,
      "",
      t(lang, "balance", { n: formatNum(updated.diamonds) }),
      profileCompletionLine(updated, lang),
    ].join("\n");
    await opts.api
      .sendMessage(Number(opts.telegramId), msg)
      .catch(() => undefined);
  }

  return {
    rewarded: newlyCompleted,
    coins,
    balance: updated.diamonds,
    percent,
  };
}

/** متن پنل «تکمیل پروفایل» */
export function profileCompletePanelText(user: User, lang: Lang): string {
  const pct = getProfileCompletionPercent(user);
  const missing = getIncompleteSectionIds(user);
  const lines = [
    t(lang, "profile_complete_title"),
    "",
    profileCompletionLine(user, lang),
    t(lang, "profile_section_reward_hint", {
      n: formatNum(PROFILE_SECTION_REWARD),
    }),
    "",
  ];
  if (missing.length) {
    lines.push(t(lang, "profile_missing_sections"));
    for (const id of missing) {
      lines.push(`• ${sectionLabel(id, lang)}`);
    }
  } else {
    lines.push(t(lang, "profile_fully_complete"));
  }
  lines.push("", t(lang, "profile_complete_cta"));
  return lines.join("\n");
}
