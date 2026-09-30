#!/usr/bin/env python3
"""Patch schema/packages/buttons/keyboard for earn/sell-coins feature."""
from pathlib import Path

ROOT = Path("/opt/patogh-bot")


def update_schema(path: Path) -> None:
    text = path.read_text()
    if "CoinSellRequest" in text:
        print(f"schema already has CoinSellRequest: {path}")
        return
    needle = '  reportsReceived   UserReport[]   @relation("ReportsReceived")\n}'
    insert = (
        '  reportsReceived   UserReport[]   @relation("ReportsReceived")\n'
        "  coinSellRequests  CoinSellRequest[]\n}"
    )
    if needle not in text:
        raise SystemExit(f"User relation needle missing in {path}")
    text = text.replace(needle, insert, 1)
    model = """

/// درخواست فروش سکه توسط کاربر (تسویه به کارت بانکی)
model CoinSellRequest {
  id          Int       @id @default(autoincrement())
  userId      Int
  user        User      @relation(fields: [userId], references: [id])
  coins       Int
  /// نرخ تومان به‌ازای هر سکه در زمان ثبت (ثابت ادمین: COIN_SELL_PRICE_TOMAN)
  rateToman   Int
  amountToman Int
  /// شماره کارت ۱۶ رقمی (فقط رقم)
  cardNumber  String
  /// open | paid | rejected
  status      String    @default("open")
  adminNote   String?
  createdAt   DateTime  @default(now())
  reviewedAt  DateTime?

  @@index([status, createdAt])
  @@index([userId])
}
"""
    path.write_text(text.rstrip() + model + "\n")
    print(f"updated {path}")


def update_packages() -> None:
    pkg = ROOT / "src/data/packages.ts"
    pt = pkg.read_text()
    if "COIN_SELL_PRICE_TOMAN" in pt:
        print("packages.ts already has sell rate")
        return
    old = "export const COIN_PRICE_TOMAN = 2_000;\nexport const COIN_PRICE_STARS = 1;\n"
    new = """export const COIN_PRICE_TOMAN = 2_000;
export const COIN_PRICE_STARS = 1;

/**
 * نرخ فروش سکه به ریال (کسب درآمد) — قابل تنظیم ادمین از همین ثابت.
 * خرید: COIN_PRICE_TOMAN | فروش: COIN_SELL_PRICE_TOMAN
 * حداقل موجودی برای ثبت درخواست: MIN_SELL_COINS
 */
export const COIN_SELL_PRICE_TOMAN = 1_000;
export const MIN_SELL_COINS = 50;
"""
    if old not in pt:
        raise SystemExit("packages needle missing")
    pkg.write_text(pt.replace(old, new, 1))
    print("packages.ts updated")


def update_buttons() -> None:
    btn = ROOT / "src/i18n/buttons.ts"
    bt = btn.read_text()
    if '| "EARN"' in bt or "EARN:" in bt:
        print("buttons already has EARN")
        return
    bt = bt.replace(
        '| "DIAMONDS"\n  | "ANON_LINK"',
        '| "DIAMONDS"\n  | "EARN"\n  | "ANON_LINK"',
    )
    bt = bt.replace(
        '    DIAMONDS: "سکه 💰",\n    ANON_LINK:',
        '    DIAMONDS: "سکه 💰",\n    EARN: "کسب درآمد 💵",\n    ANON_LINK:',
    )
    bt = bt.replace(
        '    DIAMONDS: "Coins 💰",\n    ANON_LINK:',
        '    DIAMONDS: "Coins 💰",\n    EARN: "Earn money 💵",\n    ANON_LINK:',
    )
    btn.write_text(bt)
    print("buttons.ts updated")


def update_keyboard() -> None:
    kb = ROOT / "src/keyboards/main.ts"
    kt = kb.read_text()
    marker = 'btn(L, "EARN")'
    if marker in kt:
        print("mainKeyboard already has EARN")
        return
    old = """    .text(btn(L, "GUIDE"))
    .text(btn(L, "PROFILE"))
    .text(btn(L, "DIAMONDS"))
    .row()
    .text(btn(L, "REFERRAL"))
    .row()"""
    new = """    .text(btn(L, "GUIDE"))
    .text(btn(L, "PROFILE"))
    .text(btn(L, "DIAMONDS"))
    .row()
    .text(btn(L, "EARN"))
    .text(btn(L, "REFERRAL"))
    .row()"""
    if old not in kt:
        raise SystemExit("mainKeyboard needle missing")
    kb.write_text(kt.replace(old, new, 1))
    print("mainKeyboard updated")


def main() -> None:
    for path in [ROOT / "schema.prisma", ROOT / "prisma/schema.prisma"]:
        update_schema(path)
    update_packages()
    update_buttons()
    update_keyboard()
    print("phase1 done")


if __name__ == "__main__":
    main()
