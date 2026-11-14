#!/usr/bin/env bash
# Checks a migration's access rules on a throwaway local Postgres:
#   scripts/db/check-rls.sh <psql connection args...>
# e.g. scripts/db/check-rls.sh -h /tmp -p 54329 -U postgres
# Creates and drops the database "rls_check". Needs psql and a server you may create databases on.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
psql "$@" -v ON_ERROR_STOP=1 -q -c "drop database if exists rls_check" -c "create database rls_check"
psql "$@" -d rls_check -v ON_ERROR_STOP=1 -q -f "$here/supabase-stub.sql"
psql "$@" -d rls_check -v ON_ERROR_STOP=1 -q -f "$root/supabase/migrations/20261114000100_reference_library.sql"
psql "$@" -d rls_check -v ON_ERROR_STOP=1 -q -f "$here/reference-rls.sql"
psql "$@" -v ON_ERROR_STOP=1 -q -c "drop database rls_check"
