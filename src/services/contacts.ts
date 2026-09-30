import type { Context } from "grammy";
import { prisma } from "../db/prisma.js";
import { formatNum } from "../data/packages.js";
import { ensureUserCode } from "../db/users.js";
import { langOf } from "../i18n/index.js";
import { openInlineUserList } from "./inlineList.js";

export async function isInContacts(ownerUserId: number, contactUserId: number) {
  const row = await prisma.contact.findUnique({
    where: {
      ownerUserId_contactUserId: {
        ownerUserId,
        contactUserId,
      },
    },
  });
  return Boolean(row);
}

export async function addContact(ownerUserId: number, contactUserId: number) {
  if (ownerUserId === contactUserId) return "self" as const;
  const target = await prisma.user.findUnique({ where: { id: contactUserId } });
  if (!target || target.deletedAt || !target.registered) return "missing" as const;
  if (target.telegramId >= 9000000000n) return "demo" as const;

  const existing = await prisma.contact.findUnique({
    where: {
      ownerUserId_contactUserId: { ownerUserId, contactUserId },
    },
  });
  if (existing) return "exists" as const;

  await prisma.contact.create({
    data: { ownerUserId, contactUserId },
  });
  return "ok" as const;
}

export async function removeContact(ownerUserId: number, contactUserId: number) {
  const res = await prisma.contact.deleteMany({
    where: { ownerUserId, contactUserId },
  });
  return res.count > 0;
}

export async function countContacts(ownerUserId: number) {
  return prisma.contact.count({ where: { ownerUserId } });
}

export async function loadContactsPaged(ownerUserId: number) {
  const rows = await prisma.contact.findMany({
    where: {
      ownerUserId,
      contact: { deletedAt: null, registered: true },
    },
    orderBy: { createdAt: "desc" },
    include: { contact: true },
  });

  const out = [];
  for (const row of rows) {
    const u = row.contact;
    if (!u) continue;
    if (!u.userCode) await ensureUserCode(u.id, u.userCode);
    const fresh = await prisma.user.findUnique({ where: { id: u.id } });
    if (!fresh?.userCode) continue;
    out.push(fresh);
  }
  return out;
}

/** لیست مخاطبین — Inline Query */
export async function sendContactsList(
  ctx: Context,
  ownerUserId: number,
  _page = 0,
  _edit = false,
) {
  const owner = await prisma.user.findUnique({ where: { id: ownerUserId } });
  const lang = langOf(owner);
  const n = await countContacts(ownerUserId);

  if (!n) {
    await ctx.reply(
      lang === "en"
        ? [
            "👥 Contacts",
            "",
            "You haven't added anyone yet.",
            "Use «➕ Add to contacts» on profiles or during chat.",
          ].join("\n")
        : [
            "👥 مخاطبین",
            "",
            "هنوز کسی را به مخاطبین اضافه نکردی.",
            "از پروفایل افراد یا وسط چت دکمه «➕ افزودن به مخاطبین» را بزن.",
          ].join("\n"),
    );
    return;
  }

  await openInlineUserList(ctx, {
    viewerUserId: ownerUserId,
    kind: "contacts",
    title:
      lang === "en"
        ? `👥 Contacts (${formatNum(n)})`
        : `👥 مخاطبین (${formatNum(n)})`,
    lang,
  });
}
