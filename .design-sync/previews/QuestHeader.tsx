import { QuestHeader, __previewBuildTrailView, __previewSessionFixture } from "@lrnki/learner-app";

const page: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 12, width: 520 };

const session = __previewSessionFixture();
const trail = __previewBuildTrailView(session);

/** The expedition's persistent header: the title in the IM Fell English map face, the
 * "leg k of n" indicator taken from the trail's current section, and the two ways out —
 * jumping to a section, or opening the Crystal Vista. */
export function OnTheTrail() {
  return (
    <div style={page}>
      <QuestHeader
        session={session}
        trail={trail}
        expeditionTitle="Why some eruptions are explosive"
        onJumpToSection={() => {}}
        onOpenVista={() => {}}
      />
    </div>
  );
}

/** A long expedition title truncates rather than pushing the controls off the surface. */
export function LongTitle() {
  return (
    <div style={page}>
      <QuestHeader
        session={session}
        trail={trail}
        expeditionTitle="Why some eruptions are explosive and others drain quietly away over weeks"
        onJumpToSection={() => {}}
        onOpenVista={() => {}}
      />
    </div>
  );
}
