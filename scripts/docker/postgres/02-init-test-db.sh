#!/bin/bash
set -euo pipefail

# Browser e2e tests TRUNCATE the application schema between cases. Keep that
# destructive reset off the dev database by giving the test suite its own
# database in the same instance (same isolation rationale as the litellm DB).
psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}" <<-EOSQL
	CREATE DATABASE lrnki_test;
EOSQL
