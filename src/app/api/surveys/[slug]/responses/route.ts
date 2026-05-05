import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { parseOptions, stepTypeRequiresOptions } from "@/lib/step-types";
import { isValidSurveySlug } from "@/lib/survey-slug";
import { hashIp, ipFromHeaders } from "@/lib/usage";
import { submitResponseSchema } from "@/lib/validators";

/**
 * Public submission endpoint — no auth. Looks the survey up by its
 * 6-char `publicSlug` (not its cuid id) so survey URLs can't be used
 * to enumerate IDs. Only accepts answers for published surveys. The
 * submitted IP is stored as a truncated SHA-256 hash (see `hashIp`)
 * so admins can spot abuse without keeping the raw address. We do
 * not currently rate-limit per-IP at this layer; do that at the
 * proxy or add a short-window check here if abuse appears.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!isValidSurveySlug(slug)) {
    return NextResponse.json({ error: "Survey not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = submitResponseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const survey = await prisma.survey.findUnique({
    where: { publicSlug: slug },
    select: {
      id: true,
      published: true,
      steps: {
        orderBy: { position: "asc" },
        select: { id: true, type: true, title: true, options: true },
      },
    },
  });
  if (!survey || !survey.published) {
    return NextResponse.json({ error: "Survey not found" }, { status: 404 });
  }
  const surveyId = survey.id;

  // Build a stepId → step lookup so we can validate each answer against
  // the step's type, and keep submission ordering stable.
  const stepById = new Map(survey.steps.map((s) => [s.id, s]));
  const submitted = new Map<string, string | string[]>();
  for (const a of parsed.data.answers) {
    if (!stepById.has(a.stepId)) {
      return NextResponse.json(
        { error: `Unknown step "${a.stepId}"` },
        { status: 400 },
      );
    }
    submitted.set(a.stepId, a.value);
  }

  const valuesByStep: { stepId: string; valueText: string }[] = [];
  for (const step of survey.steps) {
    const raw = submitted.get(step.id);
    if (raw === undefined) {
      return NextResponse.json(
        { error: `Missing answer for "${step.title}"` },
        { status: 400 },
      );
    }
    const valueText = encodeAnswer(step, raw);
    if (valueText.kind === "err") {
      return NextResponse.json({ error: valueText.error }, { status: 400 });
    }
    valuesByStep.push({ stepId: step.id, valueText: valueText.value });
  }

  const ip = ipFromHeaders(req.headers);
  const ua = req.headers.get("user-agent");

  const created = await prisma.surveyResponse.create({
    data: {
      surveyId,
      ipHash: hashIp(ip),
      userAgent: ua ?? null,
      answers: { create: valuesByStep },
    },
    select: { id: true },
  });

  return NextResponse.json({ id: created.id }, { status: 201 });
}

type EncodeResult = { kind: "ok"; value: string } | { kind: "err"; error: string };

function encodeAnswer(
  step: { id: string; type: string; title: string; options: string | null },
  raw: string | string[],
): EncodeResult {
  const labelFor = (errMsg: string) => `${errMsg} for "${step.title}"`;

  if (step.type === "multi_choice") {
    const arr = Array.isArray(raw) ? raw : [raw];
    const allowed = new Set(parseOptions(step.options));
    for (const v of arr) {
      if (!allowed.has(v)) return { kind: "err", error: labelFor("Invalid choice") };
    }
    // De-dup while preserving order.
    const seen = new Set<string>();
    const dedup = arr.filter((v) => (seen.has(v) ? false : (seen.add(v), true)));
    return { kind: "ok", value: dedup.join("\n") };
  }

  // From here every type expects a single string.
  if (Array.isArray(raw)) {
    return { kind: "err", error: labelFor("Expected a single value") };
  }
  const trimmed = raw.trim();

  if (stepTypeRequiresOptions(step.type)) {
    const allowed = new Set(parseOptions(step.options));
    if (!allowed.has(trimmed)) {
      return { kind: "err", error: labelFor("Invalid choice") };
    }
    return { kind: "ok", value: trimmed };
  }

  if (step.type === "rating") {
    if (!/^[1-5]$/.test(trimmed)) {
      return { kind: "err", error: labelFor("Rating must be 1–5") };
    }
    return { kind: "ok", value: trimmed };
  }

  if (step.type === "yes_no") {
    if (trimmed !== "yes" && trimmed !== "no") {
      return { kind: "err", error: labelFor("Expected yes or no") };
    }
    return { kind: "ok", value: trimmed };
  }

  if (step.type === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return { kind: "err", error: labelFor("Expected an ISO date (YYYY-MM-DD)") };
    }
    return { kind: "ok", value: trimmed };
  }

  // short_text / long_text / unknown — accept any non-empty string.
  if (trimmed.length === 0) {
    return { kind: "err", error: labelFor("Answer required") };
  }
  return { kind: "ok", value: trimmed };
}
