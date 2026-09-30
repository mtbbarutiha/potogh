#!/usr/bin/env python3
"""Compile-adjacent wiring for dist earn feature + fix src indexes."""
from pathlib import Path
import subprocess
import textwrap

ROOT = Path("/opt/patogh-bot")


def write_src_indexes() -> None:
    (ROOT / "src/features/index.ts").write_text(
        textwrap.dedent(
            """\
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
            """
        )
    )
    (ROOT / "src/admin/index.ts").write_text(
        textwrap.dedent(
            """\
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
            """
        )
    )
    print("src indexes written")


def compile_modules() -> None:
    cmd = [
        "npx",
        "--yes",
        "esbuild",
        "src/services/coinSell.ts",
        "src/features/earn.ts",
        "src/admin/coinSells.ts",
        "src/admin/auth.ts",
        "--outdir=dist",
        "--outbase=src",
        "--format=esm",
        "--platform=node",
        "--target=node20",
        "--packages=external",
    ]
    subprocess.check_call(cmd, cwd=ROOT)
    print("esbuild ok")


def wire_dist_indexes() -> None:
    p = ROOT / "dist/features/index.js"
    t = p.read_text()
    if "earnHandler" not in t:
        t = t.replace(
            'import { reportHandler } from "./report.js";\n',
            'import { reportHandler } from "./report.js";\nimport { earnHandler } from "./earn.js";\n',
        )
        t = t.replace(
            "featuresModule.use(reportHandler);",
            "featuresModule.use(earnHandler);\nfeaturesModule.use(reportHandler);",
        )
        p.write_text(t)
        print("dist features index wired")
    else:
        print("dist features already wired")

    p = ROOT / "dist/admin/index.js"
    t = p.read_text()
    if "adminCoinSellsHandler" not in t:
        t = t.replace(
            'import { adminReportsHandler } from "./reports.js";\n',
            'import { adminReportsHandler } from "./reports.js";\nimport { adminCoinSellsHandler } from "./coinSells.js";\n',
        )
        t = t.replace(
            "adminModule.use(adminReportsHandler);",
            "adminModule.use(adminCoinSellsHandler);\nadminModule.use(adminReportsHandler);",
        )
        p.write_text(t)
        print("dist admin index wired")
    else:
        print("dist admin already wired")


def patch_dist_menu() -> None:
    p = ROOT / "dist/handlers/menu.js"
    t = p.read_text()
    if 'btnAll("EARN")' in t:
        print("dist menu already has EARN")
        return
    needle = (
        'menuHandler.hears(btnAll("DIAMONDS"), async (ctx) => {\n'
        "    const user = await requireRegistered(ctx);\n"
        "    if (!user)\n"
        "        return;\n"
        "    const lang = langOf(user);\n"
        "    await ctx.reply(coinsShopIntroText(lang, user.diamonds), {\n"
        "        reply_markup: coinsShopKeyboard(user.lastDailyCoinAt, lang),\n"
        "    });\n"
        "});\n"
    )
    insert = needle + (
        "\n"
        'menuHandler.hears(btnAll("EARN"), async (ctx) => {\n'
        "    const user = await requireRegistered(ctx);\n"
        "    if (!user)\n"
        "        return;\n"
        "    const lang = langOf(user);\n"
        '    const { earnIntroText, userHasOpenSell } = await import("../services/coinSell.js");\n'
        '    const { InlineKeyboard } = await import("grammy");\n'
        '    const { MIN_SELL_COINS } = await import("../data/packages.js");\n'
        "    const balance = user.diamonds ?? 0;\n"
        "    const pending = await userHasOpenSell(user.id);\n"
        "    const canSell = balance >= MIN_SELL_COINS && !pending;\n"
        "    const kb = new InlineKeyboard();\n"
        "    if (canSell) {\n"
        '        kb.text(lang === "en" ? "💵 Sell my balance" : "💵 فروش موجودی", "earn:sell")\n'
        "            .success()\n"
        "            .row();\n"
        "    }\n"
        "    else if (pending) {\n"
        '        kb.text(lang === "en" ? "⏳ Payout pending review" : "⏳ در انتظار بررسی ادمین", "earn:close").row();\n'
        "    }\n"
        '    kb.text(lang === "en" ? "↩️ Close" : "↩️ بستن", "earn:close");\n'
        "    await ctx.reply(earnIntroText(lang, balance), { reply_markup: kb });\n"
        "});\n"
    )
    if needle not in t:
        # show nearby for debug
        idx = t.find('btnAll("DIAMONDS")')
        print("DIAMONDS idx", idx)
        print(repr(t[idx - 40 : idx + 280]))
        raise SystemExit("dist menu needle missing")
    p.write_text(t.replace(needle, insert, 1))
    print("dist menu EARN added")


def main() -> None:
    write_src_indexes()
    compile_modules()
    wire_dist_indexes()
    patch_dist_menu()
    for rel in [
        "dist/services/coinSell.js",
        "dist/features/earn.js",
        "dist/admin/coinSells.js",
        "dist/admin/auth.js",
    ]:
        path = ROOT / rel
        assert path.exists(), path
        print("ok", rel, path.stat().st_size)


if __name__ == "__main__":
    main()
