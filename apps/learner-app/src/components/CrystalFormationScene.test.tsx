import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { CrystalFormationScene } from "./CrystalFormationScene";
import { composeCrystalFormation, type FormationConceptInput } from "@/learn/crystalFormationLayout";

function concept(id: string, sectionIndex: number, state: "mastered" | "frontier" | "locked"): FormationConceptInput {
  return {
    derivedNodeId: id,
    label: `Mineral ${id}`,
    difficulty: 0.2,
    state,
    isKnownSkipped: false,
    sectionIndex,
    sectionPositionIndex: 0,
    growthFraction: state === "mastered" ? 1 : 0,
    isMilestone: true,
    isSummit: false,
    gist: null
  };
}

test("the full scene renders separated Legs, a winding spine, and a terminus", async () => {
  const layout = composeCrystalFormation({
    concepts: [concept("a", 0, "mastered"), concept("b", 1, "locked")],
    sections: [
      { sectionIndex: 0, milestoneLabel: "First Ridge", state: "complete", recallScope: null },
      { sectionIndex: 1, milestoneLabel: "Second Ridge", state: "locked", recallScope: null }
    ],
    edges: [],
    enrichmentScope: null
  });

  await render(
    <CrystalFormationScene
      layout={layout}
      width={358}
      focus={{ kind: "leg", sectionIndex: 0 }}
      contextualizingRewardKey={null}
      selectedNodeId={null}
      onSelectNode={() => undefined}
    />
  );

  expect(screen.getByLabelText(/Leg 1: First Ridge/)).toBeTruthy();
  expect(screen.getByLabelText(/Leg 2: Second Ridge/)).toBeTruthy();
  expect(screen.getByLabelText("Summit terminus — Crown awaits.")).toBeTruthy();
  expect(screen.getByText("Leg 1 · Guardian has nothing to test yet")).toBeTruthy();
  expect(screen.getByText("1 of 1 ground complete · 1 crystal")).toBeTruthy();
  expect(screen.getAllByTestId("formation-spine-segment")).toHaveLength(2);
  expect(screen.getByTestId("formation-focus-leg-0")).toBeTruthy();
  expect(screen.queryByTestId("fusion-aura")).toBeNull();
  expect(screen.queryByTestId("summit-keystone-floating")).toBeNull();
});

test("summit reward focus crops the shared ascent to the crown and nearest Leg", async () => {
  const layout = composeCrystalFormation({
    concepts: [concept("a", 0, "mastered"), concept("b", 1, "mastered")],
    sections: [
      { sectionIndex: 0, milestoneLabel: "First Ridge", state: "complete", recallScope: null },
      { sectionIndex: 1, milestoneLabel: "Summit Ridge", state: "complete", recallScope: null }
    ],
    edges: [],
    enrichmentScope: null
  });
  await render(
    <CrystalFormationScene
      layout={layout}
      width={358}
      focus={{ kind: "summit" }}
      contextualizingRewardKey="summit"
      cropToFocus
      selectedNodeId={null}
      onSelectNode={() => undefined}
    />
  );
  expect(screen.getByTestId("formation-focused-viewport")).toBeTruthy();
  expect(screen.getByTestId("formation-focus-summit")).toBeTruthy();
});
