#!/bin/sh
set -eu

schema_state="$(
  psql -X -v ON_ERROR_STOP=1 -Atqc "
    SELECT CASE
      WHEN to_regclass('public.source_resources') IS NULL
       AND to_regclass('public.operation_runs') IS NULL
        THEN 'empty'
      WHEN to_regclass('public.source_resources') IS NOT NULL
       AND to_regclass('public.operation_runs') IS NOT NULL
        THEN 'initialized'
      ELSE 'partial'
    END
  "
)"

case "$schema_state" in
  empty)
    exec psql -X -v ON_ERROR_STOP=1 -f /migration.sql
    ;;
  initialized)
    echo "Application schema is already initialized."
    ;;
  *)
    echo "Application schema is partially initialized; reset it before starting the stack." >&2
    exit 1
    ;;
esac
