DISABLED 2026-09-02 (updated with channelPublish gateway)
Reason: prevent channel churn / duplicate publishes on @Patoghchatbot

Rules:
- Always use scripts/channel-publish.ts / scripts/lib/channelPublish.ts
- Never raw sendPhoto/sendVideo/sendMessage to the channel
- Earn teaser ALREADY LIVE at message 218 — gateway seeds it and refuses republish
- Keep messages 218, 176, 178 intact
- Do NOT mass-delete / wipe channel history
- Do NOT publish earn tutorial until explicit user approval

See: CHANNEL_PUBLISH.md
Re-enable individual campaigns only by rewriting them to call channelPublish().
