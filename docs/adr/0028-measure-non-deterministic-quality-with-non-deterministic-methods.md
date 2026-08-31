# Measure judgment-based authored quality with direct judgment

Status: Accepted

## Decision

Judgment-based properties—teaching sufficiency, semantic source support, difficulty, route coherence,
Support usefulness, and challenge appropriateness—are evaluated by direct inspection and real use.
Reviewers record agreement, uncertainty, and `FIX_FIRST` findings rather than replacing those
questions with a deterministic proxy that pretends one semantic answer is mechanically known.

Deterministic code may veto only provable structural guarantees. [ADR-0013](0013-verify-quality-by-real-source-inspection.md)
owns the source-inspection boundary.

## Context

Authored content is deterministic as data, but its quality is still a human judgment. Treating word
counts, overlap, or other surface measures as truth would hide uncertainty instead of measuring it.
