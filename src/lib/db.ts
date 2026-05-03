import { PrismaClient } from "@prisma/client";

/**
 * Fields whose value must never be re-cased or trimmed: hashes have an exact
 * binary identity that any normalisation would corrupt.
 */
const NEVER_NORMALIZE = new Set(["passwordHash", "tokenHash", "ipHash"]);

/** Field names whose value should be lower-cased after trimming. */
const LOWERCASE_FIELDS = new Set(["email", "newEmail", "oldEmail"]);

function normalizeValue(key: string, value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (NEVER_NORMALIZE.has(key)) return value;
  const trimmed = value.trim();
  return LOWERCASE_FIELDS.has(key) ? trimmed.toLowerCase() : trimmed;
}

/**
 * Normalise the values inside a Prisma `data` / `create` / `update` payload
 * in place: trim strings, additionally lower-case email-like fields, skip
 * hash fields. Handles both the shorthand form `{ name: "x" }` and the
 * scalar-update form `{ name: { set: "x" } }`.
 */
export function normalizeWriteData(data: unknown): void {
  if (!data || typeof data !== "object") return;
  if (Array.isArray(data)) {
    for (const row of data) normalizeWriteData(row);
    return;
  }
  const obj = data as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    // Scalar-update form: { name: { set: "x" } }
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.prototype.hasOwnProperty.call(value, "set")
    ) {
      const wrapper = value as { set?: unknown };
      wrapper.set = normalizeValue(key, wrapper.set);
      continue;
    }
    obj[key] = normalizeValue(key, value);
  }
}

function buildClient() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  return client.$extends({
    query: {
      $allModels: {
        async create({ args, query }) {
          normalizeWriteData(args.data);
          return query(args);
        },
        async update({ args, query }) {
          normalizeWriteData(args.data);
          return query(args);
        },
        async updateMany({ args, query }) {
          normalizeWriteData(args.data);
          return query(args);
        },
        async upsert({ args, query }) {
          normalizeWriteData(args.create);
          normalizeWriteData(args.update);
          return query(args);
        },
        async createMany({ args, query }) {
          normalizeWriteData(args.data);
          return query(args);
        },
      },
    },
  });
}

type ExtendedClient = ReturnType<typeof buildClient>;

const globalForPrisma = globalThis as unknown as { prisma?: ExtendedClient };

export const prisma: ExtendedClient = globalForPrisma.prisma ?? buildClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
