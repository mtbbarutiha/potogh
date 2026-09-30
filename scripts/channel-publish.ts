/**
 * CLI for the channel publish gateway.
 *
 * Always use this (or import channelPublish) — never raw sendPhoto/sendVideo to the channel.
 *
 * Examples:
 *   npx tsx scripts/channel-publish.ts --dry-run --kind text --caption "test"
 *   npx tsx scripts/channel-publish.ts --kind video --media ./assets/.../x.mp4 --caption-file ./cap.txt
 *   npx tsx scripts/channel-publish.ts --seed-known   # register live posts (218, …) into the log
 *
 * See CHANNEL_PUBLISH.md
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { InlineKeyboard } from "grammy";
import {
  buildFingerprint,
  channelPublish,
  formatResult,
  hashFile,
  normalizeCaption,
  seedPublishLog,
  type PublishKind,
} from "./lib/channelPublish.ts";

function usage(): never {
  console.error(`Usage:
  npx tsx scripts/channel-publish.ts --dry-run --kind text|photo|video [options]
  npx tsx scripts/channel-publish.ts --seed-known
  npx tsx scripts/channel-publish.ts --check-dup --caption "..." [--media path]

Options:
  --kind text|photo|video
  --caption TEXT | --caption-file PATH
  --media PATH
  --thumb PATH
  --button LABEL=URL   (repeatable)
  --label NAME
  --dry-run
  --chat ID
`);
  process.exit(2);
}

function argValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  return argv[i + 1];
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(name);
}

function allArgValues(argv: string[], name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === name && argv[i + 1]) out.push(argv[i + 1]!);
  }
  return out;
}

/** Known live posts that must never be republished */
function seedKnown(): void {
  const chatId =
    process.env.FORCE_JOIN_CHAT_ID ||
    process.env.FORCE_JOIN_CHANNEL ||
    "@Patoghchatbot";

  const teaserCaption = [
    "از خونه، بدون خروج ✨",
    "",
    "روزی ۴۰ دعوت → حدود ماهی ۳۰ میلیون تومان",
    "۲۵ سکه × ۴۰ × ۱٬۰۰۰ تومان",
    "",
    "معرفی دوستان ← سکه ← کسب درآمد ← فروش/کارت",
    "",
    "دوردوریا",
    "https://t.me/Patoghchatbot",
  ].join("\n");

  const teaserMedia = path.resolve(
    process.cwd(),
    "assets/banners/channel-posts/channel-earn-teaser-pro.mp4",
  );
  const teaserHash = fs.existsSync(teaserMedia) ? hashFile(teaserMedia) : null;
  const teaserNorm = normalizeCaption(teaserCaption);
  const teaserFp = buildFingerprint(teaserNorm, teaserHash, "video");

  seedPublishLog({
    message_id: 218,
    fingerprint: teaserFp,
    captionNorm: teaserNorm,
    mediaHash: teaserHash,
    mediaName: "channel-earn-teaser-pro.mp4",
    kind: "video",
    chatId: String(chatId),
    label: "earn-teaser-pro-live",
  });

  // Soft-seed other kept message ids (caption unknown) so wipe scripts stay aware
  for (const id of [176, 178] as const) {
    seedPublishLog({
      message_id: id,
      fingerprint: buildFingerprint(`kept-message-${id}`, null, "text"),
      captionNorm: `kept-message-${id}`,
      mediaHash: null,
      mediaName: null,
      kind: "text",
      chatId: String(chatId),
      label: `kept-live-${id}`,
    });
  }

  console.log("Seeded known live posts into", process.env.CHANNEL_PUBLISH_LOG || "data/channel-publish-log.json");
  console.log("  - message 218 (earn teaser pro)");
  console.log("  - message 176, 178 (kept placeholders)");
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || hasFlag(argv, "--help") || hasFlag(argv, "-h")) {
    usage();
  }

  if (hasFlag(argv, "--seed-known")) {
    seedKnown();
    return;
  }

  if (hasFlag(argv, "--check-dup")) {
    const caption =
      argValue(argv, "--caption") ??
      (argValue(argv, "--caption-file")
        ? fs.readFileSync(argValue(argv, "--caption-file")!, "utf8")
        : "");
    const media = argValue(argv, "--media");
    const kind = (argValue(argv, "--kind") as PublishKind) || (media ? "video" : "text");
    const result = await channelPublish({
      kind,
      caption,
      mediaPath: media,
      dryRun: true,
      label: "check-dup",
    });
    console.log(formatResult(result));
    process.exit(result.ok ? 0 : 1);
  }

  const kind = argValue(argv, "--kind") as PublishKind | undefined;
  if (!kind || !["text", "photo", "video"].includes(kind)) {
    console.error("--kind text|photo|video required");
    usage();
  }

  const captionFile = argValue(argv, "--caption-file");
  const caption =
    argValue(argv, "--caption") ??
    (captionFile ? fs.readFileSync(captionFile, "utf8") : undefined);
  const media = argValue(argv, "--media");
  const thumb = argValue(argv, "--thumb");
  const label = argValue(argv, "--label");
  const chat = argValue(argv, "--chat");
  const dryRun = hasFlag(argv, "--dry-run");

  const buttons = allArgValues(argv, "--button");
  let replyMarkup: InlineKeyboard | undefined;
  if (buttons.length) {
    replyMarkup = new InlineKeyboard();
    for (const b of buttons) {
      const eq = b.indexOf("=");
      if (eq < 0) throw new Error(`--button must be LABEL=URL, got: ${b}`);
      replyMarkup.url(b.slice(0, eq), b.slice(eq + 1));
    }
  }

  const result = await channelPublish({
    kind,
    caption,
    text: caption,
    mediaPath: media,
    thumbnailPath: thumb,
    replyMarkup,
    chatId: chat,
    dryRun,
    label,
  });

  console.log(formatResult(result));
  if (!result.ok) process.exit(1);
  if (result.ok && !result.dryRun && result.messageId != null) {
    console.log(`https://t.me/Patoghchatbot/${result.messageId}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
