# Rolling back the database changes of Batches 5–7

Not migrations: nothing here runs on its own. Each file undoes one migration of
`supabase/migrations`. Run them newest first, and only the ones needed:

| File | Undoes | What is lost |
|---|---|---|
| `20261114000300_guardian_consent.down.sql` | The guardian rule for players under 18 | Nothing stored. **Coaches linked to a player under 18 see that player's shots again without a parent's agreement**: roll back only with the owner's decision |
| `20261114000200_coach_workspace.down.sql` | Squads, assessments, assignments | Every squad, coach assessment and assignment (export them from `/coach` first). The audit rows they wrote stay |
| `20261114000100_reference_library.down.sql` | The reference library tables (after the coach workspace: an assignment may point to a reference) | Every recorded reference and its permission record |

The app keeps working without them: `/library` reads "couldn't be reached", the coach page's
new parts fail to load, and nothing an analysis stores is touched (`analyses` and the tables
of `20261001…` are never changed by these files).

Rehearsed on a local Postgres: `scripts/db/check-rls.sh --rollback <psql args>` applies every
migration, runs the checks, then these files newest first, and checks what is left
(`scripts/db/rollback-check.sql`).

For the app itself: Vercel → the project → Deployments → the previous production deployment →
"Promote to Production" (or `NEXT_PUBLIC_UI=1` for the first design).
