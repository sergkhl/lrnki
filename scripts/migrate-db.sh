#!/usr/bin/env bash
# Resolve the host environment and invoke the one programmatic application-schema migrator.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=scripts/lib/require-database-url.sh
. scripts/lib/require-database-url.sh

pnpm --filter @lrnki/infrastructure-postgres run db:migrate
