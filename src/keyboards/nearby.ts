import { userProfileActionKeyboard } from "./main.js";
import type { Lang } from "../i18n/index.js";

export function nearbyUserKeyboard(
  targetUserId: number,
  likesCount: number,
  inContacts = false,
  lang: Lang | string | null = "fa",
  blocked = false,
) {
  return userProfileActionKeyboard(
    targetUserId,
    likesCount,
    inContacts,
    lang,
    blocked,
    "nearby",
  );
}
