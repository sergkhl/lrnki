import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { PortalHost } from "@rn-primitives/portal";
import type { ScaffoldDetourView } from "@lrnki/application/projection";
import { ScaffoldProgressDialog } from "./ScaffoldProgressDialog";
import { learnerTerm } from "@/learn/vocabulary";

function detour(overrides: Partial<ScaffoldDetourView> = {}): ScaffoldDetourView {
  return { detourId: "d1", parentDerivedNodeId: "p", term: "borrow checker", status: "generating", steps: [], completedStepCount: 0, totalStepCount: 0, firstIncompleteStepId: null, complete: false, phase: "preparing", ...overrides };
}

async function renderDialog(view: ScaffoldDetourView | undefined, onOpenChange = jest.fn()) {
  await render(
    <>
      <ScaffoldProgressDialog detour={view} open onOpenChange={onOpenChange} />
      <PortalHost />
    </>
  );
  return onOpenChange;
}

test("generating shows a broad themed phase sentence (R15, KTD8)", async () => {
  await renderDialog(detour({ phase: "checking" }));
  expect(screen.getByText(learnerTerm("supportPhaseChecking"))).toBeTruthy();
  expect(screen.getByText("“borrow checker”")).toBeTruthy();
});

test("Covers AE7-adjacent: ready reflects readiness in place, not a toast (R17)", async () => {
  await renderDialog(detour({ status: "ready" }));
  expect(screen.getByText(learnerTerm("supportReadyBody"))).toBeTruthy();
});

test("a failed generation reports failure without losing the parent activity", async () => {
  await renderDialog(detour({ status: "failed" }));
  expect(screen.getByText(learnerTerm("supportFailedBody"))).toBeTruthy();
});

test("the learner can close and continue elsewhere (R15)", async () => {
  const onOpenChange = await renderDialog(detour());
  await fireEvent.press(screen.getByLabelText(learnerTerm("supportProgressClose")));
  expect(onOpenChange).toHaveBeenCalledWith(false);
});
