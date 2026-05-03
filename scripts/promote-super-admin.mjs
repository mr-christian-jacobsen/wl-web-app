#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: pnpm promote-admin <email>");
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user found with email ${email}`);
    process.exit(2);
  }
  if (user.isSuperAdmin) {
    console.log(`${email} is already a super admin (id=${user.id})`);
    process.exit(0);
  }
  const updated = await prisma.user.update({
    where: { email },
    data: { isSuperAdmin: true },
    select: { id: true, email: true, name: true, isSuperAdmin: true },
  });
  console.log(`Promoted: ${JSON.stringify(updated)}`);
} finally {
  await prisma.$disconnect();
}
