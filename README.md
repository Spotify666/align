# Align

Cricket shot analysis that confirms the shot before it grades it. Starting with the **front-foot defence**.

Live: https://align-lab.vercel.app

## How it works

1. Record a front-foot defence side-on, in slow motion.
2. Align checks the recording, tracks the body on your phone, and asks you to tap the ball and bat on a few frames.
3. It decides whether it was a defence, a different shot, or not clear enough to say. Only a confirmed defence is measured and scored.
4. You get one priority, up to two drills, and a PDF.

Video stays on the device unless you choose to save it.

## Develop

```bash
npm ci
npm run dev        # http://localhost:3000
npm run check      # lint, typecheck, unit tests
npm run build      # fetches MediaPipe assets, then builds
```

Optional env: `ANTHROPIC_API_KEY` enables the AI rewrite of reports. Supabase URL and publishable key have public defaults in `src/lib/supabase/config.ts`.

Visual QA: `CHROMIUM_PATH=… node scripts/qa-screens.mjs http://localhost:3000 out/`
End-to-end: `CHROMIUM_PATH=… node tests/e2e/capture-flow.mjs http://localhost:3000 clip.webm out/e2e`

If you change thresholds or metrics in `src/engine/registry.ts`, publish the new registry with a migration: `node scripts/registry-sql.mjs`. A test enforces this.

## Docs

| | |
|---|---|
| [00 Current-state audit](docs/00-current-state-audit.md) | [06 Content and voice](docs/06-content-voice.md) |
| [01 PRD](docs/01-prd.md) | [07 Design system](docs/07-design-system.md) |
| [02 Shot ontology and FFD policy](docs/02-shot-ontology-and-ffd-policy.md) | [08 LLM eval and routing](docs/08-llm-eval-and-routing.md) |
| [03 Architecture and schema](docs/03-architecture-and-schema.md) | [09 Privacy, retention, consent](docs/09-privacy-retention-consent.md) |
| [04 Data, annotation, validation](docs/04-data-annotation-validation.md) | [10 Phased plan](docs/10-phased-plan.md) |
| [05 Sitemap and flows](docs/05-sitemap-and-flows.md) | |
