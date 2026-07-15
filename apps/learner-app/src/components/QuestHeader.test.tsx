import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QuestHeader } from "./QuestHeader";
import { buildTrailView } from "@lrnki/application/projection";
import { sessionFixture } from "@/learn/sessionFixture";
import { learnerTerm } from "@/learn/vocabulary";

// U1 compact honesty (test scenario 4): the header's vista door announces the exact
// crystal count with a universal icon — no detailed specimen below 40 px.

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 }
};

async function renderHeader() {
  const session = sessionFixture();
  const trail = buildTrailView(session);
  const onOpenVista = jest.fn();
  await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <QuestHeader
        session={session}
        trail={trail}
        expeditionTitle="Rust ownership"
        onJumpToSection={jest.fn()}
        onOpenVista={onOpenVista}
      />
    </SafeAreaProvider>
  );
  return { trail, onOpenVista };
}

test("the vista door shows the exact crystal count and no miniature specimen", async () => {
  const { trail } = await renderHeader();
  const collected = trail.concepts.filter((concept) => concept.state === "mastered" && !concept.isKnownSkipped).length;
  expect(screen.getByText(`${collected}/${trail.concepts.length}`)).toBeTruthy();
  // The legacy sub-40 px glyph is gone: no shard polygons render in the header.
  expect(screen.queryAllByTestId("shard-static")).toHaveLength(0);
  expect(screen.queryAllByTestId("facet-grown")).toHaveLength(0);
});

test("the door keeps its accessible open action", async () => {
  const { onOpenVista } = await renderHeader();
  await fireEvent.press(screen.getByLabelText(learnerTerm("vistaOpen")));
  expect(onOpenVista).toHaveBeenCalledTimes(1);
});
