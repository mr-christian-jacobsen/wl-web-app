#!/usr/bin/env node
/**
 * One-off: marks any pre-existing user as email-verified by setting
 * emailVerifiedAt to their createdAt. Safe to re-run (idempotent).
 *
 * Run after upgrading past the email-verification migration:
 *   pnpm backfill-verified
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
try {
  const candidates = await prisma.user.findMany({
    where: { emailVerifiedAt: null },
    select: { id: true, email: true, createdAt: true },
  });
  if (candidates.length === 0) {
    console.log("Nothing to do — all users already have emailVerifiedAt set.");
    process.exit(0);
  }
  for (const u of candidates) {
    await prisma.user.update({
      where: { id: u.id },
      data: { emailVerifiedAt: u.createdAt },
    });
    console.log(`✓ ${u.email}`);
  }
  console.log(`Marked ${candidates.length} user(s) as verified.`);
} finally {
  await prisma.$disconnect();
}
