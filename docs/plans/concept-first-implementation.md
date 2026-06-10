# Concept-First Implementation Sequence

1. Register immutable curated resources and normalize source blocks.
2. Generate document-level concept candidates.
3. Admit `core`, `optional`, `reject`, and `quarantine` candidates.
4. Extract typed claims conditioned on admitted concepts.
5. Verify evidence quotes deterministically.
6. Refine aliases, homographs, contradictions, and edge confidence explicitly.
7. Build and publish complete immutable graph versions atomically.
8. Inspect sources, runs, candidates, claims, and graph versions in Admin Lab.
9. Add measured embedding, MMR, parser-comparison, and RDF-validation experiments.
10. Add learner projection only after static graph quality gates pass.
