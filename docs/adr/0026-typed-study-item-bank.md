# Define the typed Study Item Bank and learner-response identity

Status: Accepted

## Decision

The learner loop uses `derived_node_id` as its subject identity. Mastery, calibration, learner paths,
and study-item coverage key to the node in one Derived Graph Layer, whether that node is an anchor or
an Enrichment Node. Asserted `concept_id` remains a separate identity available only for anchors.

The learner-neutral **Study Item Bank** is a typed discriminated union keyed by `itemType`.
Implemented item payloads are `option_select`, `matching`, and `impostor`.

A per-node Study Item Blueprint stage runs inside the existing `study_items` operation. It decides
which item types to generate for the node and assigns each generated type a distinct assessed facet.
Declined types are persisted as rejected study-item rows, not as a separate capability map. Exact
payload fields are owned by source types and their persisted shapes by the internal Drizzle schema
([ADR-0039](./0039-own-persisted-shape-in-code-first-drizzle-schema.md)).

Blueprints have a sparse default. A deterministic structural pre-gate vetoes only provable
impossibilities from the Concept Lesson substrate: no lesson means no item type; matching requires
enough distinct grounded fragments to form pairs; impostor requires enough truth fragments to test a
false statement. The neural blueprint may decline additional types for semantic suitability, and
blueprint failures fall back to the pre-gate survivors rather than generating every type. Sparse item
sets are valid Study Item Banks, with every declined type recorded as an inspectable rejection.

Learner-facing Study Session views never serialize answer keys. The client receives option ids,
statement ids, and matching tile ids needed for interaction; grading re-resolves the server-side key
from persisted current items.

The impostor item shape single-sources the planted lie. Generation returns three cited truths plus
one lie payload; the application inserts that lie into the four statement positions, and persistence
stores `reveal`, `lie_source`, and `sibling_label` on the keyed lie statement row. The item itself
does not duplicate lie metadata. This keeps the learner-facing reveal, grading key, and persisted
statement identity bound to the same lie object.

Study items preserve grounding provenance:

- `source_cep` for anchor evidence;
- `source_mentioned` for rescued evidence; and
- `generated` for Generated Grounding Bundle passages.

Source citations retain source identifiers and verbatim evidence. Generated citations identify
generated grounding and never masquerade as source quotes.

Study responses are auto-graded from server-side keys:

- `option_select` keys the one correct option.
- `matching` keys each prompt to one match tile and grades one completed board from the submitted
  attempt trace. A zero-mispair board records `correct`; a cleared board with mispairs records
  `partial` with fractional score for inspection.
- `impostor` keys the one planted lie among three grounded truths.

All item types append graded Response Log entries through one grading-neutral path; a node's mastery
folds across all graded observations at one threshold regardless of item type. `partial` is a graded
outcome below the mastery threshold and may remain replayable in learner projections.

A node with a Concept Lesson and no current study items is still masterable downstream: the Study
Session projection treats the persisted lesson read as completion for that itemless node. This does
not write a Response Log row and does not change the graded-only response contract. A node with
neither lesson nor current items may be treated as complete by projection only when it is explicitly
recorded as lesson-absent, so sparse generation cannot deadlock dependents while silent missing data
does not become mastery.

Each type's deterministic guard enforces only structural and provenance guarantees. Option-select
keys exactly one correct option; matching enforces pair count, distinct normalized prompt/match text,
non-self matches, and citation verification; impostor keys exactly one lie, verifies each grounded
truth against its cited grounding, and makes a source-cited impostor unrepresentable.

A citation resolves through a deterministic ladder, not an all-or-nothing string match: the cited
passage with a verbatim quote; the same quote verified verbatim against a *different* **generated**
passage, which repairs a mis-addressed id without ever minting a `source` citation; and — for the
key-verified types only — the whole cited generated passage when the quote verifies nowhere. An
unknown passage id always rejects, and a **source** passage always requires its verbatim quote. No
similarity heuristic appears at any rung.

**Study Item Key Verification** then checks the answer key of every option-select and impostor item.
One cross-family judgment per item classifies *every* candidate answer as true, false, or unclear for
the target node in its Declared Domain — grounding passages and siblings as context, all candidates
visible at once — and a deterministic rule enforces answer-key uniqueness: an impostor is admitted
only when the keyed lie is judged false **and** no other statement is; an option-select only when no
distractor is judged true **and** the key is not judged false. `unclear` is never a veto. A vetoed
item gets one regeneration informed by the offending candidate, then one further verification.

Verifying only the key cannot observe a second true option or a second false statement, so the
lie-only judge this supersedes was structurally blind to items that mark a learner wrong for the
right answer. The third resolution rung and this verification are **interlocked**: forgiving a quote
the generator never reproduced is admissible only where a judge checks the claim it no longer
anchors, which is why matching — deliberately unverified, because its failure mode is prompt
ambiguity across pairs and needs a different question shape — resolves through the verbatim rungs
alone.

Unavailability stays asymmetric, decided by harm rather than symmetry. An impostor drops, because a
true "lie" teaches a falsehood while a missing impostor is the designed safe state. An option-select
passes through unverified — its status quo, and the node's only primary activity — unless it was
admitted through the third rung, in which case it has no mechanical anchor either and drops too.
Distractor plausibility, matching anti-cueing, blueprint quality, and broader teaching quality remain
real-use inspection responsibilities.

Calibration is a separate self-report surface keyed directly to derived nodes, not a study-item
card. A learner records a mutable binary calibration verdict for a derived node. The application
composes those verdicts with the graded Response Log and surfaces disagreement rather than hiding it
behind a precedence rule.

The Response Log port is append-only and graded-only. Corrections append another graded observation;
an explicit operator reset is a separate administrative operation. Learner history remains scoped to
one Derived Graph Layer until stable cross-enrichment learner-facing identity is designed.

A Response Log observation's subject/item identity is a discriminated **neutral-or-scaffold**
reference over mutually exclusive foreign keys: the neutral `(study_item_id, derived_node_id)` pair
this ADR defines, or a single `scaffold_step_id`. This ADR owns only the neutral side; the scaffold
side, and the rule that every neutral mastery/calibration/leaderboard/journal fold consumes neutral
observations only, are owned by [ADR-0037](0037-persist-learner-scoped-scaffold-detours.md). One
append-only monotonic sequence per learner still spans both scopes.

## Context

A concept-only item identity excluded rescued and minted nodes from recall, while a single untyped
card could not support multiple study mechanics. Separating derived-node subject identity, typed item
identity, calibration verdicts, and graded observations keeps learner state downstream and makes
grounding provenance explicit.
