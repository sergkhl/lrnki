import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SectionOverview } from "./SectionOverview";
import { buildTrailView } from "@/learn/trailView";
import { sessionFixture } from "@/learn/sessionFixture";
import { learnerTerm } from "@/learn/vocabulary";
import type { TrailSectionView } from "@/learn/trailView";

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 }
};

function renderOverview(onJump = jest.fn()) {
  const view = buildTrailView(sessionFixture());
  const lockedSection: TrailSectionView = {
    ...view.sections[0],
    sectionIndex: 1,
    milestoneLabel: "Beyond the ridge",
    state: "locked",
    gatingLabels: ["Ownership"]
  };
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <SectionOverview
        sections={[...view.sections, lockedSection]}
        concepts={view.concepts}
        currentSectionIndex={view.currentSectionIndex}
        onJump={onJump}
      />
    </SafeAreaProvider>
  ).then(() => onJump);
}

test("the sheet names a locked gate and keeps the locked row inert", async () => {
  const onJump = await renderOverview();
  await fireEvent.press(screen.getByLabelText(learnerTerm("sectionOverview")));
  expect(screen.getByText(new RegExp(learnerTerm("gatedBy")))).toBeTruthy();
  await fireEvent.press(screen.getByLabelText(/Beyond the ridge/));
  expect(onJump).not.toHaveBeenCalled();
});

test("an unlocked section jumps and closes the sheet", async () => {
  const onJump = await renderOverview();
  await fireEvent.press(screen.getByLabelText(learnerTerm("sectionOverview")));
  await fireEvent.press(screen.getByLabelText(/Ownership/));
  expect(onJump).toHaveBeenCalledWith(0);
  expect(screen.queryByTestId("bottom-sheet")).toBeNull();
});
