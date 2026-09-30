import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

/**
 * DB bootstrap hooks. SQLite used WAL/FK pragmas; Postgres needs none of those.
 * Kept so call sites stay stable across providers.
 */
export async function configureDatabase(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  if (url.startsWith("file:") || url.includes("sqlite")) {
    try {
      await prisma.$executeRawUnsafe("PRAGMA journal_mode=WAL");
      await prisma.$executeRawUnsafe("PRAGMA foreign_keys=ON");
      await prisma.$executeRawUnsafe("PRAGMA busy_timeout=5000");
      await prisma.$executeRawUnsafe("PRAGMA synchronous=NORMAL");
    } catch {
      /* ignore */
    }
  }
  // Postgres: ensure we're connected; optional statement timeout later
}

/** @deprecated use configureDatabase */
export const configureSqlite = configureDatabase;
