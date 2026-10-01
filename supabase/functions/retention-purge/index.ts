// Deletes expired media (raw video by default after 14 days) through the Storage
// API, then removes the rows and writes an audit entry. Called daily by pg_cron.
// verify_jwt is off because pg_cron authenticates with a Vault-held shared secret,
// checked below before anything runs.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: authorised } = await admin.rpc("verify_cron_secret", { candidate: req.headers.get("x-cron-secret") ?? "" });
  if (authorised !== true) return new Response("forbidden", { status: 403 });

  const { data: expired, error } = await admin
    .from("media_objects")
    .select("id, bucket, path, owner_id")
    .lte("expires_at", new Date().toISOString())
    .limit(500);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const byBucket = new Map<string, typeof expired>();
  for (const row of expired ?? []) byBucket.set(row.bucket, [...(byBucket.get(row.bucket) ?? []), row]);

  let purged = 0;
  for (const [bucket, rows] of byBucket) {
    const { error: rmError } = await admin.storage.from(bucket).remove(rows!.map((r) => r.path));
    if (rmError) continue;
    await admin.from("media_objects").delete().in("id", rows!.map((r) => r.id));
    await admin.from("audit_log").insert(
      rows!.map((r) => ({ actor_id: null, subject_owner: r.owner_id, action: "retention_purge", subject_type: "media", subject_id: r.path, detail: { bucket } })),
    );
    purged += rows!.length;
  }
  return new Response(JSON.stringify({ purged }), { headers: { "Content-Type": "application/json" } });
});
