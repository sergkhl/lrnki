#!/bin/bash
# Remove disposable gate learner(s) and all learner-scoped children (FK-safe order), keyed by a
# LIKE pattern passed as $1. Shared graph enrichments/study_items are NOT touched.
#   Usage: e2e-realuse/cleanup-learner.sh 'gate-u6-signup%'
#          e2e-realuse/cleanup-learner.sh 'gate-u6-explorer'
# Loads DATABASE_URL from the repo-root .env (AGENTS rule 14).
set -euo pipefail
PATTERN="${1:?usage: cleanup-learner.sh '<learner_ref LIKE pattern>'}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"
set -a; . ./.env; set +a
psql "$DATABASE_URL" -v p="$PATTERN" <<'SQL'
DELETE FROM recall_challenge_events e USING recall_challenges c
  WHERE e.challenge_id = c.challenge_id AND c.learner_state_ref LIKE :'p';
DELETE FROM recall_challenge_lineup l USING recall_challenges c
  WHERE l.challenge_id = c.challenge_id AND c.learner_state_ref LIKE :'p';
DELETE FROM recall_challenges WHERE learner_state_ref LIKE :'p';
DELETE FROM learner_scaffold_steps s USING learner_scaffold_detours d
  WHERE s.detour_id = d.detour_id AND d.learner_state_ref LIKE :'p';
DELETE FROM learner_scaffold_detours WHERE learner_state_ref LIKE :'p';
DELETE FROM response_log WHERE learner_state_ref LIKE :'p';
DELETE FROM lesson_reads WHERE learner_state_ref LIKE :'p';
DELETE FROM calibration_verdicts WHERE learner_state_ref LIKE :'p';
DELETE FROM learner_awards WHERE learner_ref LIKE :'p';
DELETE FROM learner_expeditions WHERE learner_state_ref LIKE :'p';
DELETE FROM learner_sessions WHERE learner_ref LIKE :'p';
DELETE FROM learners WHERE learner_ref LIKE :'p';
SELECT 'remaining_learners' AS what, count(*) AS n FROM learners WHERE learner_ref LIKE :'p';
SQL
