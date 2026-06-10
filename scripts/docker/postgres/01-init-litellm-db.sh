#!/bin/bash
set -euo pipefail

# LiteLLM runs Prisma post-migration sanity checks against its DATABASE_URL.
# Keep proxy state in a dedicated database so it cannot drop lrnki app tables.
psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}" <<-EOSQL
	CREATE DATABASE litellm;
EOSQL
