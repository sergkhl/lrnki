import { SectionOverview, __previewBuildTrailView, __previewSessionFixture } from "@lrnki/learner-app";

const page: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 12, width: 460 };

const trail = __previewBuildTrailView(__previewSessionFixture());
const base = trail.sections[0];

// The fixture composes a single-section expedition; the extra legs below reuse that real
// TrailSectionView shape with the states a multi-leg expedition actually reaches, so the
// component is exercised across its whole state axis rather than one row.
const sections = [
  { ...base, sectionIndex: 0, milestoneLabel: "Melt and magma", state: "complete" as const, conceptCount: 4, masteredCount: 4, stopsComplete: 12, stopsTotal: 12 },
  { ...base, sectionIndex: 1, milestoneLabel: "Eruption style", state: "available" as const, conceptCount: 5, masteredCount: 2, stopsComplete: 7, stopsTotal: 15 },
  { ...base, sectionIndex: 2, milestoneLabel: "Volcanic hazards", state: "locked" as const, conceptCount: 3, masteredCount: 0, stopsComplete: 0, stopsTotal: 9, gatingLabels: ["Eruption style"] }
];

/** The leg index for an expedition: one row per section with its progress, the current
 * leg marked, and a locked leg naming what gates it. Tapping a row scrolls the trail to
 * that section's first concept. */
export function Legs() {
  return (
    <div style={page}>
      <SectionOverview
        sections={sections}
        concepts={trail.concepts}
        currentSectionIndex={1}
        onJump={() => {}}
      />
    </div>
  );
}

/** At the start of an expedition nothing is sealed yet and the first leg is current. */
export function JustSetOut() {
  return (
    <div style={page}>
      <SectionOverview
        sections={sections.map((s, i) => ({
          ...s,
          state: i === 0 ? ("available" as const) : ("locked" as const),
          masteredCount: 0,
          stopsComplete: 0
        }))}
        concepts={trail.concepts}
        currentSectionIndex={0}
        onJump={() => {}}
      />
    </div>
  );
}
