import {
  CheckpointCircle,
  Text,
  __previewBuildTrailView,
  __previewSessionFixture
} from "@lrnki/learner-app";

// Real projection output — the same pair every component test uses — rather than a
// hand-written literal that would drift from the view model.
const trail = __previewBuildTrailView(__previewSessionFixture());
const concept = trail.concepts[0];
const stop = concept.stops[0];

const row: React.CSSProperties = { display: "flex", gap: 28, alignItems: "flex-start", flexWrap: "wrap" };
const cell: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center", gap: 8 };

/** One checkpoint on the expedition trail. State is the whole visual language here:
 * `locked` is faded ink on the deeper parchment wash and is inert; `available` is an
 * ink ring on the card surface; `complete` is sealed. The guided next stop additionally
 * carries its label. */
export function States() {
  return (
    <div className="bg-map-parchment p-4 rounded-card">
      <div style={row}>
        {[
          { state: "locked" as const, isNext: false, label: "locked" },
          { state: "available" as const, isNext: false, label: "available" },
          { state: "available" as const, isNext: true, label: "next (guided)" },
          { state: "complete" as const, isNext: false, label: "complete" }
        ].map(({ state, isNext, label }) => (
          <div key={label} style={cell}>
            <CheckpointCircle stop={{ ...stop, state, isNext }} concept={concept} onSelect={() => {}} />
            <Text variant="caption">{label}</Text>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Checkpoint kinds carry different marks — theory is the lesson stop, the study kinds
 * are recall, and `capstone` closes the concept. */
export function Kinds() {
  return (
    <div className="bg-map-parchment p-4 rounded-card">
      <div style={row}>
        {(["theory", "capstone"] as const).map((kind) => (
          <div key={kind} style={cell}>
            <CheckpointCircle
              stop={{ ...stop, kind, state: "available", isNext: false }}
              concept={concept}
              onSelect={() => {}}
            />
            <Text variant="caption">{kind}</Text>
          </div>
        ))}
      </div>
    </div>
  );
}
