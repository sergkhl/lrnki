# Serve inspection through read-model ports and learner projection through application use-cases

Status: Accepted

## Decision

Pure inspection surfaces use read-only ports that return finished **Inspection Read Models**. The
storage adapter owns queries and row stitching; UI code does not embed SQL or JSON_TABLE access.

Learner-facing projections combine persisted reads with adaptation compute such as mastery
composition, node classification, frontier selection, and path projection. They are application
use-cases rather than read-model ports, so all consuming UIs share one orchestration boundary.

Source interfaces own the current location and exact shape of both boundaries.

Neither boundary exposes raw persistence rows to UI code. Valid absence may return `undefined`; real
database errors propagate to the application error boundary. Environment-specific demo or empty
fallbacks remain UI-shell concerns.

## Context

Inspection is a storage projection, while learner projection is read-and-compute orchestration. A
single generic read layer would either add shallow application pass-throughs or duplicate adaptation
logic in each UI. The split preserves inward dependencies and assigns each responsibility once.
