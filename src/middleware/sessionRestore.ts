import { Composer } from "grammy";
import { touchUserFromContext } from "../services/sessionRestore.js";

export const sessionRestoreMiddleware = new Composer();

/** هر آپدیت: کاربر را touch کن — inline_query را skip کن (سرعت اسکرول) */
sessionRestoreMiddleware.use(async (ctx, next) => {
  if (!ctx.inlineQuery) {
    await touchUserFromContext(ctx);
  }
  await next();
});
