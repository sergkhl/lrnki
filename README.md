# Lrnki Greenfield Scaffold

A minimal scaffold for building a Learner-Neutral Core Concept Graph from curated source resources.

## Included

- `apps/admin-lab`: minimal Next.js graph exploration lab
- `apps/kg-worker`: graph-builder worker entrypoint scaffold
- `packages/domain-core`: learner-neutral concepts, claims, evidence, and graph versions
- `packages/ports`: explicit application boundaries
- `packages/application`: concept-first graph-build orchestration skeleton
- `packages/infrastructure-ingestion`: structured text and HTML parser adapters
- `packages/infrastructure-litellm`: forced named tool-call gateway
- `packages/infrastructure-postgres`: PostgreSQL schema and initial migration with JSONB artifacts and JSON_TABLE inspection view
- `packages/infrastructure-storage-local`: local curated-source object store adapter
- `packages/infrastructure-rdf-export`: JSON-LD export sidecar
- `packages/quality-lab`: oracle-reference and fixture contracts

## Commands

```bash
cp .env.example .env
docker compose up -d postgres litellm
pnpm install
pnpm db:migrate
pnpm dev
```

The generated scaffold intentionally does not include a lockfile. Generate it with `pnpm install` in a network-enabled environment.

Run the quality checks:

```bash
pnpm check
```

## Scope

This scaffold intentionally excludes learner-state persistence, assessment-bank generation, course planning, learner-facing UI, OCR, multimodal interpretation, and automatic ontology import.
