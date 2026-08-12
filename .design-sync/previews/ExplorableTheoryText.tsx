import { Card, ExplorableTheoryText, Text } from "@lrnki/learner-app";

const page: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 12, maxWidth: 560 };

// Note the lower-case first mention: matching is an EXACT slice, so a sentence-initial
// "Magma viscosity" would not match the assigned term "magma viscosity".
const THEORY =
  "A melt's magma viscosity governs how far it travels before it ever reaches the surface. " +
  "A silica-rich melt resists flow, so pressure accumulates until the conduit fails; " +
  "a basaltic melt drains steadily and erupts far more quietly. Where subduction drives " +
  "the melt, water lowers the melting point and the resulting magma carries both volatiles " +
  "and silica — the combination behind the most explosive eruptions on record.";

/** Theory prose with the first occurrence of each assigned term made tappable.
 * Highlights are EXACT slices of the source string — no normalization, no fuzzy
 * matching — so the prose stays byte-for-byte readable. */
export function InLesson() {
  return (
    <div style={page}>
      <Card>
        <Text variant="title">Why some eruptions are explosive</Text>
        <ExplorableTheoryText
          text={THEORY}
          terms={["magma viscosity", "subduction", "volatiles"]}
          onPressTerm={() => {}}
        />
      </Card>
    </div>
  );
}

/** Only the FIRST non-overlapping occurrence of each term highlights; later repeats
 * stay plain prose, and longer terms reserve their range before shorter ones. */
export function FirstOccurrenceOnly() {
  return (
    <div style={page}>
      <Card>
        <ExplorableTheoryText
          text={
            "Ownership transfers when the borrow ends. A borrow that outlives its owner is " +
            "rejected at compile time, which is why ownership is checked before the borrow is."
          }
          terms={["ownership", "borrow"]}
          onPressTerm={() => {}}
        />
      </Card>
    </div>
  );
}

/** With no assigned terms the component is plain body copy — the same type scale
 * as `<Text variant="body">`, so lesson sections can render it unconditionally. */
export function NoTerms() {
  return (
    <div style={page}>
      <Card>
        <ExplorableTheoryText
          text="A conduit that cools faster than it drains will seal itself, and the next pulse of melt has to break through the plug."
          terms={[]}
          onPressTerm={() => {}}
        />
      </Card>
    </div>
  );
}
