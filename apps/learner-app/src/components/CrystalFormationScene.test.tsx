import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { CrystalFormationScene } from "./CrystalFormationScene";
import { composeCrystalFormation, type FormationConceptInput } from "@/learn/crystalFormationLayout";

const WIDTH = 358;

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

test("the full scene renders islands, laid-out headers, the spine, and the empty keystone", async () => {
  const layout = composeCrystalFormation(
    {
      concepts: [concept("a", 0, "mastered"), concept("b", 1, "locked")],
      sections: [
        { sectionIndex: 0, milestoneLabel: "First Ridge", state: "complete", recallScope: null },
        { sectionIndex: 1, milestoneLabel: "Second Ridge", state: "locked", recallScope: null }
      ],
      enrichmentScope: null
    },
    WIDTH
  );

  await render(
    <CrystalFormationScene
      layout={layout}
      focus={{ kind: "leg", sectionIndex: 0 }}
      contextualizingRewardKey={null}
      selectedNodeId={null}
      onSelectNode={() => undefined}
    />
  );

  expect(screen.getByLabelText(/Leg 1: First Ridge/)).toBeTruthy();
  expect(screen.getByLabelText(/Leg 2: Second Ridge/)).toBeTruthy();
  expect(screen.getByLabelText("Summit peak — Keystone awaits.")).toBeTruthy();
  expect(screen.getByTestId("formation-summit-keystone-empty")).toBeTruthy();
  expect(screen.queryByTestId("formation-summit-keystone")).toBeNull();
  expect(screen.getByText("Leg 1 · Guardian has nothing to test yet")).toBeTruthy();
  expect(screen.getByText("1 of 1 ground complete · 1 crystal")).toBeTruthy();
  expect(screen.getAllByTestId("formation-spine-segment")).toHaveLength(2);
  expect(screen.getByTestId("formation-focus-leg-0")).toBeTruthy();
});

test("a seated keystone renders gold at the peak; summit reward focus crops the ascent", async () => {
  const layout = composeCrystalFormation(
    {
      concepts: [concept("a", 0, "mastered"), concept("b", 1, "mastered")],
      sections: [
        { sectionIndex: 0, milestoneLabel: "First Ridge", state: "complete", recallScope: null },
        { sectionIndex: 1, milestoneLabel: "Summit Ridge", state: "complete", recallScope: null }
      ],
      enrichmentScope: {
        scopeKind: "enrichment",
        anchorDerivedNodeId: "b",
        anchorLabel: "Summit Ridge",
        sectionIndex: null,
        eligibleItemCount: 3,
        state: "won",
        wonChallengeId: "summit-first"
      }
    },
    WIDTH
  );
  await render(
    <CrystalFormationScene
      layout={layout}
      focus={{ kind: "summit" }}
      contextualizingRewardKey="summit"
      cropToFocus
      selectedNodeId={null}
      onSelectNode={() => undefined}
    />
  );
  expect(screen.getByTestId("formation-focused-viewport")).toBeTruthy();
  expect(screen.getByTestId("formation-focus-summit")).toBeTruthy();
  expect(screen.getByTestId("formation-summit-keystone")).toBeTruthy();
  expect(screen.getByLabelText("Summit peak — Keystone seated.")).toBeTruthy();
});
