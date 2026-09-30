import { prisma } from "../db/prisma.js";
import { getAdminIds } from "../lib/admin.js";
import type { Api } from "grammy";

export const REPORT_REASONS = {
  ads: "تبلیغات سایت‌ها / ربات‌ها / کانال‌ها",
  immoral: "ارسال محتوای غیر اخلاقی",
  harassment: "ایجاد مزاحمت",
  privacy: "پخش شماره موبایل یا اطلاعات شخصی",
  insult: "کلمات توهین‌آمیز",
  wrong_gender: "جنسیت اشتباه در پروفایل",
  other: "دیگر موارد",
} as const;

export type ReportReasonKey = keyof typeof REPORT_REASONS;

export function isReportReason(v: string): v is ReportReasonKey {
  return v in REPORT_REASONS;
}

export function reasonLabel(reason: string): string {
  return REPORT_REASONS[reason as ReportReasonKey] ?? reason;
}

export async function countOpenReports(): Promise<number> {
  return prisma.userReport.count({ where: { status: "open" } });
}

export async function listOpenReports(limit = 20) {
  return prisma.userReport.findMany({
    where: { status: "open" },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      reporter: {
        select: {
          id: true,
          displayName: true,
          userCode: true,
          username: true,
          gender: true,
          age: true,
        },
      },
      reported: {
        select: {
          id: true,
          displayName: true,
          userCode: true,
          username: true,
          gender: true,
          age: true,
          telegramId: true,
        },
      },
    },
  });
}

export async function getReportById(id: number) {
  return prisma.userReport.findUnique({
    where: { id },
    include: {
      reporter: true,
      reported: true,
    },
  });
}

export async function createUserReport(input: {
  reporterUserId: number;
  reportedUserId: number;
  reason: ReportReasonKey;
  details?: string | null;
}): Promise<
  | { ok: true; reportId: number; duplicate?: boolean }
  | { ok: false; reason: "self" | "missing" | "cooldown" }
> {
  if (input.reporterUserId === input.reportedUserId) {
    return { ok: false, reason: "self" };
  }
  const target = await prisma.user.findUnique({
    where: { id: input.reportedUserId },
  });
  if (!target || target.deletedAt) {
    return { ok: false, reason: "missing" };
  }

  // جلوگیری از اسپم: یک گزارش باز مشابه در ۲۴ ساعت
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const existing = await prisma.userReport.findFirst({
    where: {
      reporterUserId: input.reporterUserId,
      reportedUserId: input.reportedUserId,
      reason: input.reason,
      status: "open",
      createdAt: { gte: since },
    },
  });
  if (existing) {
    return { ok: true, reportId: existing.id, duplicate: true };
  }

  const details =
    input.reason === "other"
      ? (input.details?.trim() || null)
      : input.details?.trim()
        ? input.details.trim().slice(0, 1000)
        : null;

  const row = await prisma.userReport.create({
    data: {
      reporterUserId: input.reporterUserId,
      reportedUserId: input.reportedUserId,
      reason: input.reason,
      details,
      status: "open",
    },
  });
  return { ok: true, reportId: row.id };
}

export async function markReportStatus(
  id: number,
  status: "reviewed" | "dismissed",
  note?: string | null,
) {
  return prisma.userReport.update({
    where: { id },
    data: {
      status,
      reviewedAt: new Date(),
      reviewedNote: note?.trim() || null,
    },
  });
}

function briefUser(u: {
  id: number;
  displayName: string | null;
  userCode: string | null;
  username?: string | null;
}) {
  const name = u.displayName?.trim() || `user_${u.userCode ?? u.id}`;
  const un = u.username ? ` @${u.username}` : "";
  const code = u.userCode ? ` /user_${u.userCode}` : "";
  return `${name}${un} (#${u.id}${code})`;
}

export async function notifyAdminsNewReport(
  api: Api,
  reportId: number,
): Promise<void> {
  const report = await getReportById(reportId);
  if (!report) return;
  const text = [
    "🚩 گزارش تخلف جدید",
    "",
    `شماره: #${report.id}`,
    `دلیل: ${reasonLabel(report.reason)}`,
    report.details ? `توضیح: ${report.details}` : null,
    "",
    `گزارش‌دهنده: ${briefUser(report.reporter)}`,
    `متخلف: ${briefUser(report.reported)}`,
    "",
    "از پنل ادمین → گزارش تخلفات ببین.",
  ]
    .filter((x) => x != null)
    .join("\n");

  for (const adminId of getAdminIds()) {
    await api.sendMessage(adminId, text).catch(() => undefined);
  }
}
