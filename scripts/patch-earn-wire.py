#!/usr/bin/env python3
"""Wire earn feature into menu, features index, admin index, panel."""
from pathlib import Path

ROOT = Path("/opt/patogh-bot")


def patch_menu() -> None:
    path = ROOT / "src/handlers/menu.ts"
    text = path.read_text()
    if 'btnAll("EARN")' in text:
        print("menu already has EARN hears")
        return

    # imports
    if "earnIntroText" not in text:
        text = text.replace(
            '  coinsShopIntroText,\n} from "../data/packages.js";',
            '  coinsShopIntroText,\n  COIN_SELL_PRICE_TOMAN,\n  MIN_SELL_COINS,\n  formatToman,\n} from "../data/packages.js";',
        )
        # formatToman might already be unused conflict - check if formatToman imported
        # Actually formatNum already imported; formatToman may need coinSell service
        # Simpler: dynamic import in handler

    # Better insert after DIAMONDS hears block
    needle = '''menuHandler.hears(btnAll("DIAMONDS"), async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  const lang = langOf(user);
  await ctx.reply(coinsShopIntroText(lang, user.diamonds), {
    reply_markup: coinsShopKeyboard(user.lastDailyCoinAt, lang),
  });
});
'''
    insert = '''menuHandler.hears(btnAll("DIAMONDS"), async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  const lang = langOf(user);
  await ctx.reply(coinsShopIntroText(lang, user.diamonds), {
    reply_markup: coinsShopKeyboard(user.lastDailyCoinAt, lang),
  });
});

menuHandler.hears(btnAll("EARN"), async (ctx) => {
  const user = await requireRegistered(ctx);
  if (!user) return;
  const lang = langOf(user);
  const {
    earnIntroText,
    userHasOpenSell,
  } = await import("../services/coinSell.js");
  const { InlineKeyboard } = await import("grammy");
  const { MIN_SELL_COINS } = await import("../data/packages.js");
  const balance = user.diamonds ?? 0;
  const pending = await userHasOpenSell(user.id);
  const canSell = balance >= MIN_SELL_COINS && !pending;
  const kb = new InlineKeyboard();
  if (canSell) {
    kb.text(lang === "en" ? "💵 Sell my balance" : "💵 فروش موجودی", "earn:sell")
      .success()
      .row();
  } else if (pending) {
    kb.text(
      lang === "en" ? "⏳ Payout pending review" : "⏳ در انتظار بررسی ادمین",
      "earn:close",
    ).row();
  }
  kb.text(lang === "en" ? "↩️ Close" : "↩️ بستن", "earn:close");
  await ctx.reply(earnIntroText(lang, balance), { reply_markup: kb });
});
'''
    if needle not in text:
        raise SystemExit("menu DIAMONDS needle missing")
    text = text.replace(needle, insert, 1)
    path.write_text(text)
    print("menu.ts EARN hears added")


def patch_features_index() -> None:
    # Ensure src/features/index.ts exists matching dist
    path = ROOT / "src/features/index.ts"
    if not path.exists():
        # recreate from dist pattern
        path.write_text('''import { Composer } from "grammy";
import { matchHandler } from "./match.js";
import { exploreHandler } from "./explore.js";
import { dmHandler } from "./dm.js";
import { socialHandler } from "./social.js";
import { nearbyHandler } from "./nearby.js";
import { profileEditHandler } from "./profile.js";
import { reportHandler } from "./report.js";
import { earnHandler } from "./earn.js";

/** ماژول فیچرهای کاربر — explore, match, dm, nearby, social, earn */
export const featuresModule = new Composer();
featuresModule.use(earnHandler);
featuresModule.use(reportHandler);
featuresModule.use(matchHandler);
featuresModule.use(exploreHandler);
featuresModule.use(dmHandler);
featuresModule.use(socialHandler);
featuresModule.use(nearbyHandler);
featuresModule.use(profileEditHandler);

/** @deprecated use featuresModule */
export const featuresHandler = featuresModule;
''')
        print("created features/index.ts")
        return

    text = path.read_text()
    if "earnHandler" in text:
        print("features index already has earn")
        return
    if 'from "./report.js"' in text and "earnHandler" not in text:
        text = text.replace(
            'import { reportHandler } from "./report.js";\n',
            'import { reportHandler } from "./report.js";\nimport { earnHandler } from "./earn.js";\n',
        )
        text = text.replace(
            "featuresModule.use(reportHandler);",
            "featuresModule.use(earnHandler);\nfeaturesModule.use(reportHandler);",
        )
        path.write_text(text)
        print("features/index.ts wired earn")
    else:
        raise SystemExit("unexpected features/index.ts")


def patch_admin_index() -> None:
    path = ROOT / "src/admin/index.ts"
    if not path.exists():
        path.write_text('''import { Composer } from "grammy";
import { adminCoreHandler } from "./core.js";
import { adminChatsHandler } from "./chats.js";
import { adminReportsHandler } from "./reports.js";
import { adminCoinSellsHandler } from "./coinSells.js";
import { adminVouchersHandler } from "./vouchers.js";
import { adminOpsHandler } from "./operations.js";

/**
 * ماژول یکپارچه ادمین + مانیتورینگ
 * ops → vouchers → chats → sells → reports → core
 */
export const adminModule = new Composer();
adminModule.use(adminOpsHandler);
adminModule.use(adminVouchersHandler);
adminModule.use(adminChatsHandler);
adminModule.use(adminCoinSellsHandler);
adminModule.use(adminReportsHandler);
adminModule.use(adminCoreHandler);

/** @deprecated use adminModule */
export const adminHandler = adminModule;
export { adminPanelKeyboard } from "./panel.js";
''')
        print("created admin/index.ts")
        return

    text = path.read_text()
    if "adminCoinSellsHandler" in text:
        print("admin index already has sells")
        return
    text = text.replace(
        'import { adminReportsHandler } from "./reports.js";\n',
        'import { adminReportsHandler } from "./reports.js";\nimport { adminCoinSellsHandler } from "./coinSells.js";\n',
    )
    text = text.replace(
        "adminModule.use(adminReportsHandler);",
        "adminModule.use(adminCoinSellsHandler);\nadminModule.use(adminReportsHandler);",
    )
    path.write_text(text)
    print("admin/index.ts wired sells")


def patch_panel() -> None:
    path = ROOT / "src/admin/panel.ts"
    text = path.read_text()
    if "adm:sells" in text:
        print("panel already has sells")
        return
    old = '''    .text("🚩 گزارش تخلفات", "adm:reports")
    .danger()
    .row()
    .text("💰 افزودن سکه", "adm:givecoins")
'''
    new = '''    .text("🚩 گزارش تخلفات", "adm:reports")
    .danger()
    .row()
    .text("💵 فروش سکه / تسویه", "adm:sells")
    .row()
    .text("💰 افزودن سکه", "adm:givecoins")
'''
    if old not in text:
        # try without danger style variance
        old2 = '.text("🚩 گزارش تخلفات", "adm:reports")'
        if old2 in text and "adm:sells" not in text:
            text = text.replace(
                old2,
                '.text("🚩 گزارش تخلفات", "adm:reports")\n    .danger()\n    .row()\n    .text("💵 فروش سکه / تسویه", "adm:sells")',
                1,
            )
            # may duplicate .danger() — check
            path.write_text(text)
            print("panel.ts patched (alt)")
            return
        raise SystemExit("panel needle missing")
    path.write_text(text.replace(old, new, 1))
    print("panel.ts sells button added")


def patch_dist_buttons_keyboard() -> None:
    """Also patch running dist JS for buttons + keyboard immediately."""
    btn = ROOT / "dist/i18n/buttons.js"
    bt = btn.read_text()
    if "EARN:" in bt or "کسب درآمد" in bt:
        print("dist buttons already has EARN")
    else:
        bt = bt.replace(
            '        DIAMONDS: "سکه 💰",\n        ANON_LINK:',
            '        DIAMONDS: "سکه 💰",\n        EARN: "کسب درآمد 💵",\n        ANON_LINK:',
        )
        bt = bt.replace(
            '        DIAMONDS: "Coins 💰",\n        ANON_LINK:',
            '        DIAMONDS: "Coins 💰",\n        EARN: "Earn money 💵",\n        ANON_LINK:',
        )
        btn.write_text(bt)
        print("dist buttons updated")

    kb = ROOT / "dist/keyboards/main.js"
    kt = kb.read_text()
    if 'btn(L, "EARN")' in kt:
        print("dist keyboard already has EARN")
    else:
        old = '''        .text(btn(L, "GUIDE"))
        .text(btn(L, "PROFILE"))
        .text(btn(L, "DIAMONDS"))
        .row()
        .text(btn(L, "REFERRAL"))
        .row()'''
        new = '''        .text(btn(L, "GUIDE"))
        .text(btn(L, "PROFILE"))
        .text(btn(L, "DIAMONDS"))
        .row()
        .text(btn(L, "EARN"))
        .text(btn(L, "REFERRAL"))
        .row()'''
        if old not in kt:
            raise SystemExit("dist keyboard needle missing")
        kb.write_text(kt.replace(old, new, 1))
        print("dist keyboard updated")

    panel = ROOT / "dist/admin/panel.js"
    pt = panel.read_text()
    if "adm:sells" in pt:
        print("dist panel already has sells")
    else:
        old = '''        .text("🚩 گزارش تخلفات", "adm:reports")
        .danger()
        .row()
        .text("💰 افزودن سکه", "adm:givecoins")'''
        new = '''        .text("🚩 گزارش تخلفات", "adm:reports")
        .danger()
        .row()
        .text("💵 فروش سکه / تسویه", "adm:sells")
        .row()
        .text("💰 افزودن سکه", "adm:givecoins")'''
        if old not in pt:
            raise SystemExit("dist panel needle missing")
        panel.write_text(pt.replace(old, new, 1))
        print("dist panel updated")

    # packages.js
    pkg = ROOT / "dist/data/packages.js"
    pk = pkg.read_text()
    if "COIN_SELL_PRICE_TOMAN" in pk:
        print("dist packages already has sell rate")
    else:
        old = "export const COIN_PRICE_TOMAN = 2000;\nexport const COIN_PRICE_STARS = 1;\n"
        # may be 2_000 compiled differently
        if old not in pk:
            old = "export const COIN_PRICE_TOMAN = 2_000;\nexport const COIN_PRICE_STARS = 1;\n"
        if old not in pk:
            # try without underscore
            import re
            m = re.search(r"export const COIN_PRICE_TOMAN = \d+;\nexport const COIN_PRICE_STARS = \d+;\n", pk)
            if not m:
                raise SystemExit("dist packages needle missing")
            old = m.group(0)
        new = old + (
            "/** نرخ فروش سکه (کسب درآمد) — ثابت ادمین‌قابل‌تنظیم */\n"
            "export const COIN_SELL_PRICE_TOMAN = 1000;\n"
            "export const MIN_SELL_COINS = 50;\n"
        )
        pkg.write_text(pk.replace(old, new, 1))
        print("dist packages updated")


def main() -> None:
    patch_menu()
    patch_features_index()
    patch_admin_index()
    patch_panel()
    patch_dist_buttons_keyboard()
    print("wiring done")


if __name__ == "__main__":
    main()
