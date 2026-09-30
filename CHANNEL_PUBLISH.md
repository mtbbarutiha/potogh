# Channel publish — anti-duplicate gateway

**همیشه از `channelPublish` استفاده کنید؛ هرگز `sendPhoto` / `sendVideo` / `sendMessage` خام به کانال نزنید.**

Always use `channelPublish`; never raw `sendPhoto` / `sendVideo` / `sendMessage` to the channel.

## Why

Agents previously published then deleted many near-duplicate earn/referral/tutorial posts on `@Patoghchatbot` (`-1004324389916`). This gateway is the **only** allowed publish path.

## Entry points

| Path | Role |
|------|------|
| `scripts/lib/channelPublish.ts` | Library API (`channelPublish`, `seedPublishLog`, …) |
| `scripts/channel-publish.ts` | CLI wrapper |
| `scripts/send-channel-*.ts` | **Blocked** stubs — point here; real copies stay under `.channel-mutations-DISABLED-*` |
| Mass-delete / wipe scripts | Stay disabled |

## Dedup rules (before any Telegram send)

1. Build fingerprint = SHA-256(`kind|captionNorm|mediaHash`)
2. `captionNorm` = Unicode NFKC, strip emoji/ZWJ/variation selectors, collapse whitespace, lower-case
3. `mediaHash` = SHA-256 of the media file (or `nomedia` for text)
4. Refuse (exit 1) if **any** of these match an existing log entry:
   - same fingerprint
   - same `captionNorm` (blocks near-dupes with different media)
   - same `mediaHash` (blocks same file with different caption)
5. On success only: append `{ message_id, fingerprint, captionNorm, mediaHash, kind, createdAt, chatId }` to the log
6. Dry-run never appends to the durable log and never calls Telegram send APIs

## Log file

- Default: `data/channel-publish-log.json` (repo-relative / VPS: `/opt/patogh-bot/data/channel-publish-log.json`)
- Override: env `CHANNEL_PUBLISH_LOG`

Seed known live posts (so they cannot be republished):

```bash
cd /opt/patogh-bot
npx tsx scripts/channel-publish.ts --seed-known
```

## Publish (safe)

```bash
# Dry-run first (no Telegram send, no log write)
npx tsx scripts/channel-publish.ts --dry-run --kind text --caption "پست تست"

# Real publish (only after dry-run OK and human approval)
npx tsx scripts/channel-publish.ts --kind video \
  --media assets/banners/channel-posts/example.mp4 \
  --caption-file /tmp/caption.txt \
  --button "ورود به ربات=https://t.me/Patogh_bot" \
  --label my-campaign
```

From TypeScript:

```ts
import { channelPublish, formatResult } from "./lib/channelPublish.ts";

const result = await channelPublish({
  kind: "video",
  mediaPath: "...",
  caption: "...",
  dryRun: false,
  label: "my-script",
});
if (!result.ok) {
  console.error(formatResult(result));
  process.exit(1);
}
```

## Smoke-test duplicate block

```bash
npx tsx scripts/smoke-channel-dedupe.ts
```

Expect: first dry-run OK; second identical caption blocked with Persian/English reason; exit code 1 on duplicate. No real channel posts.
