---
name: ship-align
description: Release Align to production — checks, registry migration, PR, CI, merge, production verification, and one short message to the athlete. Use whenever a change is ready to go live.
---

# Ship

1. `npm run lint && npm run typecheck && npm test && npm run build` — all clean.
2. If `REGISTRY_HASH` changed: `node scripts/registry-sql.mjs > supabase/migrations/<ts>_registry_<label>.sql`,
   apply the same SQL to Supabase `uwhgahpsivwkvxmbchmk` (apply_migration), re-run tests.
   New tables: RLS on, policies for owner/shared access, then `get_advisors` (security).
3. Real-media matrix passed (`real-media-eval`), results compared with the previous build.
4. `docs/context.md` updated (ask, what was done, what is open). Skills updated if the model or
   process changed.
5. Commit on the session branch (attribution lines at the end; no model identifiers), push,
   open a PR to `main` (body ends with the Claude Code footer), wait for CI green, merge with
   the 40-character head SHA. Never force-push.
6. Verify production: the Vercel deployment for the merge commit is READY, then load
   https://align-lab.vercel.app and https://alynn.vercel.app (200, new build), and run one real
   clip through production if the change touched analysis.
7. Tell the athlete once, briefly, what is live and what is still open. Don't make them ask.
