# 08 · LLM evaluation and model routing

## Role of the LLM

Explanation only. The engine decides the status, numbers and plan. The template report is complete on its own; an LLM may rewrite it for a player, coach or parent.

## Contract

- Input: a compact payload (status, headline, metrics, plan, limits, evidence ids).
- Output: JSON matching `REPORT_JSON_SCHEMA` (structured output).
- Validator (`validateReport`) rejects:
  - unknown citations;
  - numbers that don't match the payload at the stated precision;
  - uncited numbers;
  - contradictions of the analysis status (for example, a score on a rejected shot);
  - medical language.
- Two attempts, then the template report is used.

## Routes

| Route | Model | Role | Status |
|---|---|---|---|
| anthropic | claude-sonnet-5-5 | Default report writer | Implemented (needs `ANTHROPIC_API_KEY`) |
| openai | gpt-6.1-sol | Bake-off candidate | Not wired |
| openai-economy | gpt-6-luna | Economy route after passing the bar | Not wired |
| gemini | gemini-3.5-flash-lite | Qualitative video reviewer, never measurement | Not wired |
| qwen / deepseek | — | Low-cost benchmarks; privacy review first | Not wired |

## Evaluation harness

`src/engine/llm/eval.ts` scores any provider on the same payloads. It reports:

- schema validity;
- the share of reports with zero violations;
- violations by type;
- mean latency;
- estimated cost.

## Promotion bar

A route becomes default only with: 100% schema-valid, ≥ 98% zero-violation reports, 0 status contradictions, 0 medical language across the fixture set plus 50 real payloads.
