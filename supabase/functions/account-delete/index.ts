// Self-service account deletion: removes every stored object for the caller,
// then deletes the auth user (all rows cascade). Requires the caller's JWT.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const BUCKETS = ["tracks", "evidence", "raw-video"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "not signed in" }, 401);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let removed = 0;
  for (const bucket of BUCKETS) {
    // Objects are stored as <uid>/<analysis id>/<file>.
    const { data: folders } = await admin.storage.from(bucket).list(user.id, { limit: 1000 });
    for (const folder of folders ?? []) {
      const prefix = `${user.id}/${folder.name}`;
      const { data: files } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
      const paths = (files ?? []).map((f) => `${prefix}/${f.name}`);
      if (folder.id) paths.push(prefix);
      if (paths.length) {
        await admin.storage.from(bucket).remove(paths);
        removed += paths.length;
      }
    }
  }
  await admin.from("audit_log").insert({ actor_id: null, subject_owner: null, action: "account_deleted", subject_type: "user", subject_id: user.id, detail: { objects_removed: removed } });
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return json({ error: error.message }, 500);
  return json({ deleted: true, objectsRemoved: removed });
});
