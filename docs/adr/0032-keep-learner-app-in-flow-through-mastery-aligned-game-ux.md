# Keep the Learner App in flow through mastery-aligned game UX

Status: Accepted

## Decision

The Learner App keeps each visible goal, challenge, reward, and recovery path aligned with mastery of
the current expedition. The application orchestrator owns learner-specific pacing and game state;
Derived Graph Layers, Concept Lessons, and Study Item Banks remain learner-neutral and are consumed
through application use-cases rather than persistence adapters.

An expedition is a layer-wide trail with a derived summit. Prerequisite satisfaction, not section
order, determines which stops are playable. The trail must remain completable and paced: derivation
cannot create an unwinnable reward scope or an unsatisfiable gate, and section boundaries represent
recognizable milestones rather than arbitrary cuts.

Mastery uses one completion rule across projection, progress, and rewards: required lesson reading and
all current activity segments must be complete, while an explicit known calibration may master
immediately. Sparse generation must be represented honestly; missing data cannot silently become
mastery.

Recall Challenges are earned retrieval checks over already-passed neutral items. Their stakes are
corrective rather than punitive, their evidence never changes acquisition mastery, and postponing one
may delay its reward but never the next prerequisite-valid learning stop.

Any proposal to use graded evidence as acquisition-mastery evidence triggers a new architectural and
product review. That trigger does not authorize changing mastery semantics by itself.

Automatic support follows a ladder from clearer feedback through retries and sequencing before
creating learner-scoped content. An explicit Explorable Term request may open a Scaffold Detour
immediately because that branch cannot earn neutral progress or rewards
([ADR-0037](0037-persist-learner-scoped-scaffold-detours.md)).

Learner interaction is mobile-first and accessible. State cannot rely on color alone, reduced-motion
preferences receive equivalent information, haptics are event-bound and semantic, and decorative or
social presentation may not become a parallel objective. Themed copy remains downstream under
[ADR-0033](0033-plain-identifiers-single-themed-vocabulary-mapping.md).

## Context

Learner-specific adaptation must stay downstream of the neutral graph, but that separation alone does
not guarantee a coherent learning game. This policy keeps delight, pacing, and recovery subordinate to
learning progress.
