# Blockers

_No unresolved blockers._

The Docling mixed-format ingestion blocker is resolved: the `docling` service builds and runs
(`docker compose up -d docling`, healthy on :5001), and the version-pinned `DoclingStructuredDocumentParser`
ingests PDFs end-to-end (Gate 2 fixture #4, run `9b92bd64`). DOCX/PPTX fixtures #5–#6 still need real
curated source files — tracked in TODO, not a blocker (the adapter already supports their formats).
