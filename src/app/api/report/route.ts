import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { generateReport } from "@/engine/llm/contract";
import { anthropicProvider } from "@/lib/llm/anthropic";
import { burstLimiter, callerIp, sameOrigin } from "@/lib/rate-limit";
import type { AnalysisPayload } from "@/engine/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  audience: z.enum(["player", "coach", "parent", "analyst"]).default("player"),
  payload: z.object({ schema: z.literal("align.analysis/1"), analysis_status: z.string(), result_hash: z.string() }).passthrough(),
});

// Each rewrite may call the model: a few per minute per caller is plenty for a person.
const limit = burstLimiter(6);
// The same request (byte for byte) gets the same answer: kept on this instance, newest last.
const answers = new Map<string, unknown>();
const ANSWERS_KEPT = 500;

// Writes the report text. The model only explains the typed payload; any output
// that fails the contract is discarded and the deterministic template is returned.
export async function POST(req: NextRequest) {
  if (!sameOrigin(req.headers)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const raw = await req.text();
  if (raw.length > 300_000) return NextResponse.json({ error: "payload too large" }, { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid payload" }, { status: 400 });

  const key = createHash("sha256").update(raw).digest("hex");
  const known = answers.get(key);
  if (known) return NextResponse.json(known);
  const ip = callerIp(req.headers);
  if (ip && limit.over(ip)) return NextResponse.json({ error: "too many requests" }, { status: 429, headers: { "Retry-After": "60" } });

  const provider = anthropicProvider();
  const result = await generateReport(parsed.data.payload as unknown as AnalysisPayload, provider, parsed.data.audience);
  const body = {
    configured: !!provider,
    report: result.report,
    fellBackToTemplate: result.fellBackToTemplate,
    rejectedAttempts: result.rejected.length,
  };
  // Only a model's accepted answer is worth keeping; the template is instant anyway.
  if (provider && !result.fellBackToTemplate) {
    if (answers.size >= ANSWERS_KEPT) answers.delete(answers.keys().next().value!);
    answers.set(key, body);
  }
  return NextResponse.json(body);
}
