#!/usr/bin/env bash
# Repeatable demo-seed (plan 2026-06-20-002, U2). Produces ONE coherent full-manifest
# state from an empty database: a published graph version, one enrichment carrying
# difficulties + study items, and a few named demo learners whose adaptive paths render the
# neutral/adapted graph pair (R1-R4). It is disposable orchestration over the stable
# worker CLI (KTD5) and hard-resets every run (AGENTS rules 8/9). Real LiteLLM calls
# (extraction, enrichment, difficulty, cards, synthesis) run, so it needs the .env key
# and a reachable Postgres + LiteLLM; any model/service outage fails the seed loudly
# rather than seeding a partial state.
set -euo pipefail

DB_URL="${DATABASE_URL:-postgresql://lrnki:lrnki@localhost:5432/lrnki}"
export DATABASE_URL="$DB_URL"

# Scalar query helper: one value, no headers/alignment, whitespace trimmed.
psql_scalar() {
  psql "$DB_URL" -tA -v ON_ERROR_STOP=1 -c "$1" | tr -d '[:space:]'
}

step() { printf '\n=== %s ===\n' "$1"; }

step "1/8 reset database (DROP SCHEMA + migrate)"
scripts/reset-db.sh

step "2/8 register fixtures from manifest"
pnpm worker:kg register-from-manifest

step "3/8 run extraction over all registered sources (real LLM calls)"
pnpm worker:kg run-extraction --all

step "4/8 resolve latest succeeded extraction run per source"
# One run per source (the most recent succeeded), so the published version spans the
# full manifest. Read into a bash array of run IDs for the build command.
mapfile -t RUN_IDS < <(psql "$DB_URL" -tA -v ON_ERROR_STOP=1 -c \
  "SELECT DISTINCT ON (source_resource_id) run_id
   FROM extraction_runs
   WHERE status = 'succeeded'
   ORDER BY source_resource_id, started_at DESC")
if [ "${#RUN_IDS[@]}" -eq 0 ]; then
  echo "! no succeeded extraction runs to publish — extraction failed; aborting." >&2
  exit 1
fi
echo "   publishing ${#RUN_IDS[@]} run(s): ${RUN_IDS[*]}"

step "5/8 build (publish) the full-manifest graph version"
pnpm worker:kg build-graph-version "${RUN_IDS[@]}"
GRAPH_VERSION_ID="$(psql_scalar \
  "SELECT graph_version_id FROM graph_versions WHERE status = 'published' ORDER BY published_at DESC LIMIT 1")"
if [ -z "$GRAPH_VERSION_ID" ]; then
  echo "! no published graph version found after build; aborting." >&2
  exit 1
fi
echo "   published graph version: $GRAPH_VERSION_ID"

step "6/8 enrich the published version (DAG + difficulties + rationale)"
pnpm worker:kg enrich-graph-version "$GRAPH_VERSION_ID"
ENRICHMENT_ID="$(psql_scalar \
  "SELECT enrichment_id FROM graph_enrichments
   WHERE graph_version_id = '$GRAPH_VERSION_ID' AND status = 'succeeded'
   ORDER BY started_at DESC LIMIT 1")"
if [ -z "$ENRICHMENT_ID" ]; then
  echo "! no succeeded enrichment found after enrich; aborting." >&2
  exit 1
fi
echo "   enrichment: $ENRICHMENT_ID"

step "7/8 generate the Study Item Bank for the enrichment (real LLM calls)"
pnpm worker:kg generate-study-items "$ENRICHMENT_ID"

step "8/8 seed demo learners over goal anchors"
# Pick goal anchors STRUCTURALLY, not by fixture-specific name (AGENTS rule 17): the
# highest certain-prerequisite-in-degree anchor from each of the two richest domains.
# This yields goals with clear prerequisite chains regardless of which sources were
# extracted, so a non-deterministic reseed still produces renderable adaptive paths.
mapfile -t GOAL_NODES < <(psql "$DB_URL" -tA -v ON_ERROR_STOP=1 -c \
  "SELECT derived_node_id FROM (
     SELECT DISTINCT ON (n.declared_domain)
            n.derived_node_id, n.declared_domain, count(e.*) AS prereq_count
     FROM derived_graph_nodes n
     JOIN inferred_prerequisite_edges e
       ON e.dependent_derived_node_id = n.derived_node_id AND e.enrichment_id = n.enrichment_id
     WHERE n.enrichment_id = '$ENRICHMENT_ID' AND n.node_kind = 'anchor' AND NOT e.uncertain
     GROUP BY n.declared_domain, n.derived_node_id
     ORDER BY n.declared_domain, prereq_count DESC, n.canonical_label
   ) per_domain
   ORDER BY prereq_count DESC
   LIMIT 2")
if [ "${#GOAL_NODES[@]}" -eq 0 ]; then
  echo "! no anchor has a certain prerequisite edge — the DAG is too sparse to seed a" >&2
  echo "  meaningful adaptive path. Inspect the enrichment before reseeding; aborting." >&2
  exit 1
fi

SEEDED_REFS=()
INDEX=0
for GOAL_NODE in "${GOAL_NODES[@]}"; do
  INDEX=$((INDEX + 1))
  GOAL_CONCEPT="$(psql_scalar \
    "SELECT concept_id FROM derived_graph_nodes WHERE derived_node_id = '$GOAL_NODE'")"
  GOAL_LABEL="$(psql "$DB_URL" -tA -v ON_ERROR_STOP=1 -c \
    "SELECT canonical_label FROM derived_graph_nodes WHERE derived_node_id = '$GOAL_NODE'")"
  EMPTY_REF="demo-empty-${INDEX}"
  SEEDED_REF="demo-seeded-${INDEX}"
  echo
  echo "   goal ${INDEX}: ${GOAL_LABEL} (anchor concept ${GOAL_CONCEPT})"

  # Empty learner: no responses → adapted overlay equals neutral (AE1).
  echo "   -> empty learner ${EMPTY_REF} (adapted == neutral)"
  pnpm worker:kg compute-adaptive-path "$ENRICHMENT_ID" "$GOAL_CONCEPT" "$EMPTY_REF"

  # Seeded learner: synthesize responses toward the goal (badged synthetic), then a
  # mastered/frontier/locked split appears in the adapted overlay (AE2/AE3).
  echo "   -> seeded learner ${SEEDED_REF} (synthetic responses → mastered/frontier/locked split)"
  pnpm worker:kg synthesize-responses "$ENRICHMENT_ID" "$GOAL_NODE" "$SEEDED_REF"
  pnpm worker:kg compute-adaptive-path "$ENRICHMENT_ID" "$GOAL_CONCEPT" "$SEEDED_REF"

  SEEDED_REFS+=("$EMPTY_REF" "$SEEDED_REF")
done

step "seed complete"
echo "Published graph version : $GRAPH_VERSION_ID"
echo "Enrichment              : $ENRICHMENT_ID"
echo "Demo learners           : ${SEEDED_REFS[*]}"
echo
echo "Open a learner at: /admin/lab/learner-loop/<learnerStateRef>"
