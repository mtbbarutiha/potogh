import {
  welcomeSlogan,
  fullGuide,
  type Lang,
  normalizeLang,
} from "../i18n/index.js";
import { WELCOME_DIAMONDS } from "./packages.js";

/** پیام ۱ — خوش‌آمدگویی و شعار برند */
export function welcomeSloganMessage(
  opts?: {
    displayName?: string | null;
    city?: string | null;
    province?: string | null;
    diamonds?: number;
  },
  lang?: Lang | string | null,
): string {
  return welcomeSlogan(normalizeLang(lang), {
    ...opts,
    diamonds: opts?.diamonds ?? WELCOME_DIAMONDS,
  });
}

/** پیام ۲ — راهنمای کامل استفاده از پنل */
export function fullGuideMessage(lang?: Lang | string | null): string {
  return fullGuide(normalizeLang(lang));
}
