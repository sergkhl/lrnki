import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { CrystalFormationScene } from "./CrystalFormationScene";
import { composeCrystalFormation, type FormationConceptInput, type FormationInput } from "@/learn/crystalFormationLayout";

const WIDTH = 390;

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

function layoutOf(over: Partial<FormationInput>) {
  return composeCrystalFormation(
    {
      concepts: [concept("a", 0, "mastered"), concept("b", 1, "locked")],
      sections: [
        { sectionIndex: 0, milestoneLabel: "First Ridge", state: "complete", recallScope: null },
        { sectionIndex: 1, milestoneLabel: "Second Ridge", state: "locked", recallScope: null }
      ],
      enrichmentScope: null,
      nextDerivedNodeId: null,
      ...over
    },
    WIDTH
  );
}

// The stack: one panel per Leg with its own caption (identity + honest state) and exact counts,
// closed by the summit strip. No spine, no header masks, no peak.
test("the cavern stacks captioned Leg panels and the awaiting summit strip", async () => {
  const layout = layoutOf({});
  await render(
    <CrystalFormationScene
      layout={layout}
      focus={{ kind: "leg", sectionIndex: 0 }}
      contextualizingRewardKey={null}
      selectedNodeId={null}
      onSelectNode={() => undefined}
    />
  );

  expect(screen.getByTestId("cavern-ground")).toBeTruthy();
  expect(screen.getByText("Leg 1 · Guardian has nothing to test yet")).toBeTruthy();
  expect(screen.getByText("Leg 2 · Fogged leg")).toBeTruthy();
  expect(screen.getByText("1 of 1 ground complete · 1 crystal")).toBeTruthy();
  // The two Legs render their own panels: one reachable (charted), one fogged (locked cells).
  expect(screen.getByTestId("cavern-panel-guardian_ready")).toBeTruthy();
  expect(screen.getByTestId("cavern-panel-future")).toBeTruthy();
  expect(screen.getByTestId("cavern-summit-awaiting")).toBeTruthy();
  expect(screen.queryByTestId("cavern-summit-seated")).toBeNull();
  expect(screen.getByTestId("formation-focus-leg-0")).toBeTruthy();
});

// The keystone is earned, never previewed: only a durable summit win seats it.
test("a summit win seats the keystone in the summit strip", async () => {
  const layout = layoutOf({
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
  });
  await render(
    <CrystalFormationScene
      layout={layout}
      focus={{ kind: "summit" }}
      contextualizingRewardKey="summit"
      selectedNodeId={null}
      onSelectNode={() => undefined}
    />
  );
  expect(screen.getByTestId("formation-focus-summit")).toBeTruthy();
  expect(screen.getByTestId("cavern-summit-seated")).toBeTruthy();
  expect(screen.getByLabelText(/Keystone seated/)).toBeTruthy();
  expect(screen.getByText("0 of 2 legs sealed.", { exact: false })).toBeTruthy();
});

// KTD9: a panel offers its own Guardian only where the host owns entry. The Vista passes a
// handler; the reward card and the capstone inset never do.
test("Guardian rows appear only when the host owns entry", async () => {
  const layout = layoutOf({
    sections: [
      {
        sectionIndex: 0,
        milestoneLabel: "First Ridge",
        state: "complete",
        recallScope: {
          scopeKind: "section",
          anchorDerivedNodeId: "a",
          anchorLabel: "First Ridge",
          sectionIndex: 0,
          eligibleItemCount: 3,
          state: "available"
        }
      },
      { sectionIndex: 1, milestoneLabel: "Second Ridge", state: "locked", recallScope: null }
    ]
  });
  await render(
    <CrystalFormationScene
      layout={layout}
      focus={null}
      contextualizingRewardKey={null}
      selectedNodeId={null}
      onSelectNode={() => undefined}
      onEnterGuardian={async () => undefined}
    />
  );
  expect(screen.getByTestId("cavern-guardian-a")).toBeTruthy();
  expect(screen.getByLabelText(/Crystal Guardian: First Ridge/)).toBeTruthy();
});
