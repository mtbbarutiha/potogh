/**
 * HARD BLOCK stub — use the channel publish gateway instead.
 *
 * Always: npx tsx scripts/channel-publish.ts
 * Never:  raw sendPhoto / sendVideo / sendMessage to @Patoghchatbot
 *
 * See CHANNEL_PUBLISH.md
 */
throw new Error(
  "BLOCKED: use scripts/channel-publish.ts (channelPublish gateway). " +
    "Raw channel/private publish scripts are disabled. See CHANNEL_PUBLISH.md",
);
