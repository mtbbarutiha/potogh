import { Composer } from "grammy";
import { reportHandler } from "./report.js";
import { earnHandler } from "./earn.js";

/**
 * ماژول‌های موجود در src/features.
 * در production، dist/features/index.js ماژول کامل را لود می‌کند.
 */
export const featuresModule = new Composer();
featuresModule.use(earnHandler);
featuresModule.use(reportHandler);

/** @deprecated use featuresModule */
export const featuresHandler = featuresModule;
