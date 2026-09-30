export type { Lang, BtnKey, RegKey } from "./buttons.js";
export type { MsgKey } from "./messages.js";
export {
  normalizeLang,
  BUTTONS,
  btn,
  btnAll,
  allMenuButtonTexts,
  REG_LABELS,
  reg,
  parseGenderLabel,
  parseLookingLabel,
  isStepBack,
  AGE_RANGES_I18N,
} from "./buttons.js";
export { t, tr, welcomeSlogan, fullGuide } from "./messages.js";

import { normalizeLang, type Lang } from "./buttons.js";

export function langOf(user: { language?: string | null } | null | undefined): Lang {
  return normalizeLang(user?.language);
}
