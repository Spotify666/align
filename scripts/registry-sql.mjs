// Prints SQL that publishes the current engine registry snapshot. Registry rows are
// written only by migrations (never by clients), so a hash can't be pre-claimed.
//   node scripts/registry-sql.mjs > supabase/migrations/<ts>_registry_<hash8>.sql
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url);
const r = await jiti.import("../src/engine/registry.ts");
const f = await jiti.import("../src/engine/frontal.ts");
const b = await jiti.import("../src/engine/backfoot-defs.ts");
const content = JSON.stringify({ thresholds: r.THRESHOLDS, metrics: r.METRICS, frontal_metrics: f.FRONTAL_METRICS, frontal_ungraded: f.FRONTAL_UNGRADED, frontal_withheld: f.FRONTAL_WITHHELD, bfd_metric_version: b.BFD_METRIC_VERSION, bfd_metrics: b.BFD_METRICS }).replaceAll("'", "''");
console.log(`insert into public.registry_versions (hash, engine_version, metric_version, content)
values ('${r.REGISTRY_HASH}', '${r.ENGINE_VERSION}', '${r.METRIC_VERSION}', '${content}'::jsonb)
on conflict (hash) do nothing;`);
