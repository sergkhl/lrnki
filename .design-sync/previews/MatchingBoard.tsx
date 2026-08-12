import { MatchingBoard, SupportPathsPanel } from "@lrnki/learner-app";

const page: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 12, width: 520 };

const item = {
  studyItemId: "si-matching-1",
  derivedNodeId: "n1",
  question: "Match each melt to what it does on the way up.",
  groundingProvenance: "source_cep" as const,
  prompts: [
    { promptId: "p1", text: "Silica-rich melt" },
    { promptId: "p2", text: "Basaltic melt" },
    { promptId: "p3", text: "Subduction-driven melt" }
  ],
  matches: [
    { matchId: "m1", text: "Resists flow until the conduit fails" },
    { matchId: "m2", text: "Drains steadily and erupts quietly" },
    { matchId: "m3", text: "Carries both volatiles and silica" }
  ],
  explorableTerms: []
};

/** The pairing surface for a matching study item: prompts on one side, candidate matches
 * on the other, one pair attempted at a time. `onAttempt` resolves true for a correct
 * pair, and `onComplete` fires once every prompt is matched. */
export function Board() {
  return (
    <div style={page}>
      <MatchingBoard
        item={item}
        result={null}
        disabled={false}
        onAttempt={async () => true}
        onComplete={async () => {}}
      />
    </div>
  );
}

/** Grounding provenance is the board's one visible content axis: an item traced to a
 * source carries the grounded mark beside the question, a `generated` item does not.
 * (`disabled` freezes interaction but has no visual treatment, so it is not shown here.) */
export function Grounding() {
  return (
    <div style={page}>
      <MatchingBoard
        item={{ ...item, groundingProvenance: "source_cep" }}
        result={null}
        disabled={false}
        onAttempt={async () => true}
        onComplete={async () => {}}
      />
      <MatchingBoard
        item={{ ...item, studyItemId: "si-matching-2", groundingProvenance: "generated" }}
        result={null}
        disabled={false}
        onAttempt={async () => true}
        onComplete={async () => {}}
      />
    </div>
  );
}

/** `supportSlot` hangs a support affordance beneath the board — in the learner app this
 * is the Explorable Terms panel — without the board needing to know what it is. */
export function WithSupportSlot() {
  return (
    <div style={page}>
      <MatchingBoard
        item={item}
        result={null}
        disabled={false}
        supportSlot={
          <SupportPathsPanel
            terms={[
              { term: "volatiles", sectionKind: null, support: { kind: "available" } },
              { term: "conduit", sectionKind: null, support: { kind: "available" } }
            ]}
            busyTerm={null}
            onSelect={() => {}}
          />
        }
        onAttempt={async () => true}
        onComplete={async () => {}}
      />
    </div>
  );
}
