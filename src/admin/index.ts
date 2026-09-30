import { Composer } from "grammy";
import { adminChatsHandler } from "./chats.js";
import { adminReportsHandler } from "./reports.js";
import { adminCoinSellsHandler } from "./coinSells.js";

/**
 * زیر‌های ادمین موجود در src/admin.
 * در production، dist/admin/index.js ماژول کامل را لود می‌کند.
 */
export const adminModule = new Composer();
adminModule.use(adminChatsHandler);
adminModule.use(adminCoinSellsHandler);
adminModule.use(adminReportsHandler);

/** @deprecated use adminModule */
export const adminHandler = adminModule;
export { adminPanelKeyboard } from "./panel.js";
