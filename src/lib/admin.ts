export function getAdminIds(): number[] {
  const raw = process.env.ADMIN_IDS ?? "";
  return raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export function isAdmin(telegramId: number): boolean {
  return getAdminIds().includes(telegramId);
}
