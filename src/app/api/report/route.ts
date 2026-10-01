import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { generateReport } from "@/engine/llm/contract";
import { anthropicProvider } from "@/lib/llm/anthropic";
import type { AnalysisPayload } from "@/engine/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  audience: z.enum(["player", "coach", "parent", "analyst"]).default("player"),
  payload: z.object({ schema: z.literal("align.analysis/1"), analysis_status: z.string(), result_hash: z.string() }).passthrough(),
});

// Writes the report text. The model only explains the typed payload; any output
// that fails the contract is discarded and the deterministic template is returned.
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const raw = await req.text();
  if (raw.length > 300_000) return NextResponse.json({ error: "payload too large" }, { status: 413 });
  const parsed = Body.safeParse(JSON.parse(raw));
  if (!parsed.success) return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  const provider = anthropicProvider();
  const result = await generateReport(parsed.data.payload as unknown as AnalysisPayload, provider, parsed.data.audience);
  return NextResponse.json({
    configured: !!provider,
    report: result.report,
    fellBackToTemplate: result.fellBackToTemplate,
    rejectedAttempts: result.rejected.length,
  });
}
