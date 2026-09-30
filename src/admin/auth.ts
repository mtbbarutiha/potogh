import { isAdmin } from "../lib/admin.js";

export function adminOnly(ctx: { from?: { id: number } | undefined }) {
  return ctx.from != null && isAdmin(ctx.from.id);
}
