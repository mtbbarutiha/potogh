import { Composer } from "grammy";
import { findByTelegram } from "../db/users.js";
import { restoreUserSession } from "../services/sessionRestore.js";
import { chattingKeyboard } from "../keyboards/main.js";
import { langOf, tr } from "../i18n/index.js";

export const fallbackHandler = new Composer();

fallbackHandler.on("message:text", async (ctx) => {
  if (ctx.message.text.startsWith("/")) return;
  const from = ctx.from;
  if (!from) return;

  const user = await findByTelegram(from.id);
  if (!user) {
    const { ensureUser } = await import("../db/users.js");
    const created = await ensureUser({
      telegramId: from.id,
      ...(from.username ? { username: from.username } : {}),
      ...(from.first_name ? { firstName: from.first_name } : {}),
    });
    await restoreUserSession(ctx, created, { announce: true });
    return;
  }

  // Never bounce an active chat into the main-menu welcome path
  if (user.state === "chatting" && user.chatPartnerId != null) {
    const lang = langOf(user);
    await ctx.reply(
      tr(
        lang,
        "هنوز در چتی. پیام را بنویس یا از منوی پایین استفاده کن.",
        "You're still in a chat. Type a message or use the bottom menu.",
      ),
      { reply_markup: chattingKeyboard(user.secureChat, lang) },
    );
    return;
  }

  await restoreUserSession(ctx, user, { announce: true });
});
