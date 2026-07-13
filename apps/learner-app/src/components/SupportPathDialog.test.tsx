import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { PortalHost } from "@rn-primitives/portal";
import type { ScaffoldDetourView } from "@lrnki/application/projection";
import { SupportPathDialog, dialogStateForDetour, type SupportPathDialogState } from "./SupportPathDialog";
import { learnerTerm } from "@/learn/vocabulary";

async function renderDialog(
  state: SupportPathDialogState,
  handlers: Partial<{ onOpenChange: jest.Mock; onRequest: jest.Mock; onRetry: jest.Mock; onDismiss: jest.Mock; onOpenPath: jest.Mock }> = {},
  error: string | null = null
) {
  await render(
    <>
      <SupportPathDialog
        open
        onOpenChange={handlers.onOpenChange ?? jest.fn()}
        term="magma viscosity"
        state={state}
        error={error}
        onRequest={handlers.onRequest}
        onRetry={handlers.onRetry}
        onDismiss={handlers.onDismiss}
        onOpenPath={handlers.onOpenPath}
      />
      <PortalHost />
    </>
  );
}

test("available offers Add support path and Keep exploring only (R9)", async () => {
  const onRequest = jest.fn();
  await renderDialog({ kind: "available" }, { onRequest });
  expect(screen.getByText("“magma viscosity”")).toBeTruthy();
  expect(screen.queryByTestId("support-path-open")).toBeNull();
  expect(screen.queryByTestId("support-path-retry")).toBeNull();
  await fireEvent.press(screen.getByTestId("support-path-request"));
  expect(onRequest).toHaveBeenCalled();
});

test("requesting blocks dismissal and a second submission until the request settles", async () => {
  const onOpenChange = jest.fn();
  const onRequest = jest.fn();
  await renderDialog({ kind: "requesting" }, { onOpenChange, onRequest });
  await fireEvent.press(screen.getByLabelText("Close"));
  expect(onOpenChange).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByTestId("support-path-request"));
  expect(onRequest).not.toHaveBeenCalled();
});

test("generating shows broad progress and allows Keep exploring (R9)", async () => {
  const onOpenChange = jest.fn();
  await renderDialog({ kind: "generating", phase: "checking" }, { onOpenChange });
  expect(screen.getByText(learnerTerm("supportPhaseChecking"))).toBeTruthy();
  await fireEvent.press(screen.getByLabelText(learnerTerm("supportProgressClose")));
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

test("failed offers recovery: Retry and Dismiss (R9/R16)", async () => {
  const onRetry = jest.fn();
  const onDismiss = jest.fn();
  await renderDialog({ kind: "failed" }, { onRetry, onDismiss });
  await fireEvent.press(screen.getByTestId("support-path-retry"));
  expect(onRetry).toHaveBeenCalled();
  await fireEvent.press(screen.getByLabelText(learnerTerm("supportDismiss")));
  expect(onDismiss).toHaveBeenCalled();
});

test("Covers AE5/R10: ready provides Open support path AND Keep exploring, and no lesson content", async () => {
  const onOpenPath = jest.fn();
  const onOpenChange = jest.fn();
  await renderDialog({ kind: "ready", complete: false }, { onOpenPath, onOpenChange });
  expect(screen.getByText(learnerTerm("supportReadyBody"))).toBeTruthy();
  await fireEvent.press(screen.getByTestId("support-path-open"));
  expect(onOpenPath).toHaveBeenCalled();
  await fireEvent.press(screen.getByLabelText(learnerTerm("supportProgressClose")));
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

test("a restored already-ready detour maps straight to ready — never a generating flash", () => {
  const detour = (status: ScaffoldDetourView["status"], complete = false): ScaffoldDetourView => ({
    detourId: "d1",
    parentDerivedNodeId: "p",
    term: "magma",
    status,
    steps: [],
    completedStepCount: 0,
    totalStepCount: 0,
    firstIncompleteStepId: null,
    complete,
    phase: status === "generating" ? "building" : null
  });
  expect(dialogStateForDetour(detour("ready", true))).toEqual({ kind: "ready", complete: true });
  expect(dialogStateForDetour(detour("failed"))).toEqual({ kind: "failed" });
  expect(dialogStateForDetour(detour("generating"))).toEqual({ kind: "generating", phase: "building" });
  // Projection not refreshed yet: broad progress until polling lands.
  expect(dialogStateForDetour(undefined)).toEqual({ kind: "generating", phase: null });
});

test("a refused request surfaces retryable copy in place without closing (R9)", async () => {
  await renderDialog({ kind: "available" }, {}, learnerTerm("termRequestFailed"));
  expect(screen.getByText(learnerTerm("termRequestFailed"))).toBeTruthy();
  expect(screen.getByTestId("support-path-request")).toBeTruthy();
});
