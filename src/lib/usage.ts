import { createHash } from "node:crypto";

import { UAParser } from "ua-parser-js";

import { prisma } from "@/lib/db";

const SESSION_GAP_MS = 30 * 60_000;

export type ParsedClientInfo = {
  os: string | null;
  osVersion: string | null;
  browser: string | null;
  browserVersion: string | null;
  deviceType: string;
};

export function parseUserAgent(ua: string | null | undefined): ParsedClientInfo {
  if (!ua) {
    return { os: null, osVersion: null, browser: null, browserVersion: null, deviceType: "other" };
  }
  const r = new UAParser(ua).getResult();
  return {
    os: r.os.name ?? null,
    osVersion: r.os.version ?? null,
    browser: r.browser.name ?? null,
    browserVersion: r.browser.version ?? null,
    deviceType: r.device.type ?? "desktop",
  };
}

export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  // SHA-256 truncated; enough to de-duplicate without storing the actual address.
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

export function ipFromHeaders(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return headers.get("x-real-ip");
}

export type HeartbeatInput = {
  userId: string;
  userAgent: string | null;
  ipHash: string | null;
  screenWidth?: number;
  screenHeight?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  timezone?: string;
  language?: string;
};

/**
 * Record a heartbeat. If the user has an active UsageSession with the same
 * userAgent within the inactivity window, extend it. Otherwise start a new one.
 */
export async function recordHeartbeat(input: HeartbeatInput) {
  const cutoff = new Date(Date.now() - SESSION_GAP_MS);
  const existing = await prisma.usageSession.findFirst({
    where: {
      userId: input.userId,
      userAgent: input.userAgent ?? undefined,
      lastActiveAt: { gte: cutoff },
      endedAt: null,
    },
    orderBy: { lastActiveAt: "desc" },
  });

  if (existing) {
    return prisma.usageSession.update({
      where: { id: existing.id },
      data: {
        lastActiveAt: new Date(),
        // Refresh client-reported fields in case the window resized etc.
        viewportWidth: input.viewportWidth ?? existing.viewportWidth,
        viewportHeight: input.viewportHeight ?? existing.viewportHeight,
      },
    });
  }

  const parsed = parseUserAgent(input.userAgent);
  return prisma.usageSession.create({
    data: {
      userId: input.userId,
      userAgent: input.userAgent,
      ipHash: input.ipHash,
      ...parsed,
      screenWidth: input.screenWidth ?? null,
      screenHeight: input.screenHeight ?? null,
      viewportWidth: input.viewportWidth ?? null,
      viewportHeight: input.viewportHeight ?? null,
      timezone: input.timezone ?? null,
      language: input.language ?? null,
    },
  });
}
