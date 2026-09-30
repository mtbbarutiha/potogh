#!/usr/bin/env npx tsx
/**
 * Set BotFather-style name/description used in share previews & bot profile.
 * Default (no language_code) is Persian so link shares show FA copy.
 *
 * Usage: npx tsx scripts/set-bot-profile-texts.ts
 */
import "dotenv/config";

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("BOT_TOKEN missing");
  process.exit(1);
}

const SHORT_FA = "شبکه گفت‌وگو: چت خصوصی، کاربران نزدیک، پیام و ویس";
const DESC_FA = [
  "دوردوریا — شبکه گفت‌وگو و پیام‌رسانی اجتماعی",
  "",
  "گفتگوی یک‌به‌یک با حفظ حریم خصوصی",
  "پیدا کردن کاربران نزدیک و هم‌استان",
  "پیام متنی و پیام صوتی",
  "فیلتر استان و بازه سنی",
  "",
  "ثبت‌نام رایگان است. حریم خصوصی شما مهم است.",
].join("\n");

const SHORT_EN =
  "Social chat network: private chat, nearby users, messages and voice";
const DESC_EN = [
  "Patogh — social chat and messaging network",
  "",
  "One-to-one chat with privacy controls",
  "Find nearby and same-province users",
  "Text and voice messages",
  "Province and age filters",
  "",
  "Free to join. Your privacy matters.",
].join("\n");

async function call(
  method: string,
  body: Record<string, string>,
): Promise<unknown> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function main() {
  const jobs: Array<[string, Record<string, string>]> = [
    ["setMyShortDescription", { short_description: SHORT_FA }],
    ["setMyDescription", { description: DESC_FA }],
    [
      "setMyShortDescription",
      { short_description: SHORT_FA, language_code: "fa" },
    ],
    ["setMyDescription", { description: DESC_FA, language_code: "fa" }],
    [
      "setMyShortDescription",
      { short_description: SHORT_EN, language_code: "en" },
    ],
    ["setMyDescription", { description: DESC_EN, language_code: "en" }],
  ];
  for (const [method, body] of jobs) {
    const r = await call(method, body);
    console.log(method, body.language_code ?? "default", r);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
