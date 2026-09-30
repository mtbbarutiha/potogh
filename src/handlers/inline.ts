import { Composer } from "grammy";
import { answerInlineUserList } from "../services/inlineList.js";

export const inlineHandler = new Composer();

inlineHandler.on("inline_query", async (ctx) => {
  try {
    await answerInlineUserList(ctx);
  } catch (err) {
    console.error(
      "[inline_query]",
      err instanceof Error ? err.stack ?? err.message : err,
    );
    await ctx
      .answerInlineQuery([], { cache_time: 1, is_personal: true })
      .catch(() => undefined);
  }
});
