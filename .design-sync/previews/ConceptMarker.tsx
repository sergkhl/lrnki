import { ConceptMarker, Text, __previewBuildTrailView, __previewSessionFixture } from "@lrnki/learner-app";

const session = __previewSessionFixture();
const trail = __previewBuildTrailView(session);
const concept = trail.concepts[0];

const row: React.CSSProperties = { display: "flex", gap: 32, alignItems: "flex-start", flexWrap: "wrap" };
const cell: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center", gap: 8 };

/** The concept cartouche on the expedition map — the label and state for one concept,
 * with its checkpoints strung beneath it. It sits on the parchment ground, so it is
 * always rendered inside a map surface rather than on a card. */
export function OnTheMap() {
  return (
    <div className="bg-map-parchment p-4 rounded-card">
      <div style={row}>
        <ConceptMarker concept={concept} session={session} />
      </div>
    </div>
  );
}

/** A concept the learner has already mastered, and one still uncharted — the two ends
 * of the state axis this marker renders. */
export function MasteredAndUncharted() {
  return (
    <div className="bg-map-parchment p-4 rounded-card">
      <div style={row}>
        <div style={cell}>
          <ConceptMarker concept={{ ...concept, state: "mastered" }} session={session} />
          <Text variant="caption">mastered</Text>
        </div>
        <div style={cell}>
          <ConceptMarker concept={{ ...concept, state: "locked", isKnownSkipped: false }} session={session} />
          <Text variant="caption">uncharted</Text>
        </div>
      </div>
    </div>
  );
}
