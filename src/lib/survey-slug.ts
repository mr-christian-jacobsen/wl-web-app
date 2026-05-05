import { randomBytes } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

const ALPHA = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SLUG_LENGTH = 6;

const SLUG_REGEX = /^[a-zA-Z]{6}$/;

/**
 * 6-char `[a-zA-Z]` handle used as the public URL segment for a
 * survey. 52^6 ≈ 19.7B combinations — collisions are very rare in
 * practice; `createSurveyWithUniqueSlug` retries on the unique-index
 * violation.
 *
 * Uses `randomBytes` + modulo, which biases the trailing four letters
 * (a..d) by ~25%. That's acceptable for URL handles where we already
 * accept a small statistical anti-enumeration margin in exchange for
 * brevity.
 */
export function generateSurveySlug(): string {
  const buf = randomBytes(SLUG_LENGTH);
  let out = "";
  for (let i = 0; i < SLUG_LENGTH; i++) {
    out += ALPHA[buf[i]! % ALPHA.length];
  }
  return out;
}

export function isValidSurveySlug(value: string): boolean {
  return SLUG_REGEX.test(value);
}

const MAX_SLUG_ATTEMPTS = 8;

/**
 * Creates a Survey row, retrying on `publicSlug` unique-index
 * collisions. Throws after `MAX_SLUG_ATTEMPTS` consecutive collisions
 * — at that point either the RNG is broken or we're out of slug space,
 * and silently picking a longer/different slug would hide the real
 * problem.
 */
export async function createSurveyWithUniqueSlug<TSelect extends Prisma.SurveySelect>(args: {
  data: Omit<Prisma.SurveyUncheckedCreateInput, "publicSlug">;
  select: TSelect;
}): Promise<Prisma.SurveyGetPayload<{ select: TSelect }>> {
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    try {
      return (await prisma.survey.create({
        data: { ...args.data, publicSlug: generateSurveySlug() },
        select: args.select,
      })) as Prisma.SurveyGetPayload<{ select: TSelect }>;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        Array.isArray(err.meta?.target) &&
        (err.meta.target as string[]).includes("publicSlug")
      ) {
        continue;
      }
      throw err;
    }
  }
  throw new Error("Could not allocate a unique survey slug after multiple attempts");
}
