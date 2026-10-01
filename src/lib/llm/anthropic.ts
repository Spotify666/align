import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { REPORT_JSON_SCHEMA, type ReportProvider } from "@/engine/llm/contract";

const MODEL = "claude-sonnet-5-5";

/** Claude report adapter. Structured JSON output, server-side refusal fallback. */
export function anthropicProvider(): ReportProvider | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic();
  return {
    id: "anthropic",
    model: MODEL,
    async generate(system, user) {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 8000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: { type: "json_schema", schema: REPORT_JSON_SCHEMA } },
        system,
        messages: [{ role: "user", content: user }],
      });
      if (response.stop_reason === "refusal") throw new Error(`Model declined (${response.stop_details?.category ?? "unknown"})`);
      if (response.stop_reason === "max_tokens") throw new Error("Report truncated at max_tokens");
      const text = response.content.find((b) => b.type === "text");
      if (!text || text.type !== "text") throw new Error("No text block in response");
      return JSON.parse(text.text);
    },
  };
}
