#!/usr/bin/env bash
# Checks the migrations' access rules on a throwaway local Postgres:
#   scripts/db/check-rls.sh <psql connection args...>
# e.g. scripts/db/check-rls.sh -h /tmp -p 54329 -U postgres
# Creates and drops the database "rls_check". Needs psql and a server you may create databases on.
# Applies the core schema and its access rules, the reference library, the coach workspace and
# the guardian rule for players under 18
# (retention is left out: it needs pg_cron), then runs each check file.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
run() { psql "$@" -v ON_ERROR_STOP=1 -q; }
run "$@" -c "drop database if exists rls_check" -c "create database rls_check"
run "$@" -d rls_check -f "$here/supabase-stub.sql"
for m in 20261001000100_core_schema 20261001000200_security 20261114000100_reference_library 20261114000200_coach_workspace 20261114000300_guardian_consent; do
  run "$@" -d rls_check -f "$root/supabase/migrations/$m.sql"
done
for c in reference-rls coach-rls guardian-rls; do
  run "$@" -d rls_check -f "$here/$c.sql"
done
run "$@" -c "drop database rls_check"
