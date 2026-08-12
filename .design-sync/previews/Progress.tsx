import { Progress, Text } from "@lrnki/learner-app";

const col: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 16, width: 380 };

/** A determinate bar: the gem-toned fill on the parchment track. `fraction` is clamped
 * to 0–1, so a caller can pass a raw ratio without guarding it. */
export function Determinate() {
  return (
    <div style={col}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Text variant="label">Just set out</Text>
        <Progress fraction={0} accessibilityLabel="Expedition progress" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Text variant="label">Halfway along the leg</Text>
        <Progress fraction={0.5} accessibilityLabel="Leg progress" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Text variant="label">Leg sealed</Text>
        <Progress fraction={1} accessibilityLabel="Leg complete" />
      </div>
    </div>
  );
}

/** `fraction={null}` is the INDETERMINATE state — work is in flight but its extent is
 * unknown. It is what Support Path generation and Guardian preparation render, paired
 * with a live-region label. */
export function Indeterminate() {
  return (
    <div style={col}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Text variant="label">Preparing your Support Path</Text>
        <Progress fraction={null} accessibilityLabel="Preparing your Support Path" />
        <Text variant="caption">Grounding the term against your sources.</Text>
      </div>
    </div>
  );
}
