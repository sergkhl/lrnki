import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { PortalHost } from "@rn-primitives/portal";
import type { RecallScopeStatus } from "@lrnki/application/projection";
import { GuardianArrivalDialog } from "./GuardianArrivalDialog";
import { learnerTerm } from "@/learn/vocabulary";

const legScope: RecallScopeStatus = {
  scopeKind: "section",
  anchorDerivedNodeId: "anchor-1",
  anchorLabel: "Borrowing",
  sectionIndex: 0,
  eligibleItemCount: 4,
  state: "available"
};

async function renderDialog(scope: RecallScopeStatus) {
  const onFace = jest.fn();
  const onDismiss = jest.fn();
  await render(
    <>
      <GuardianArrivalDialog scope={scope} open onFace={onFace} onDismiss={onDismiss} />
      <PortalHost />
    </>
  );
  return { onFace, onDismiss };
}

test("the arrival offer names the scope and either enters the fight or returns without blocking (F1)", async () => {
  const { onFace, onDismiss } = await renderDialog(legScope);
  expect(screen.getByText(learnerTerm("guardianArrivalTitle"))).toBeTruthy();
  expect(screen.getByText("Borrowing")).toBeTruthy();
  expect(screen.getByText(learnerTerm("guardianArrivalBody"))).toBeTruthy();
  await fireEvent.press(screen.getByText(learnerTerm("guardianArrivalLater")));
  expect(onDismiss).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByText(learnerTerm("guardianFace")));
  expect(onFace).toHaveBeenCalledTimes(1);
});

test("the summit arrival uses the Expedition Guardian copy (F6)", async () => {
  await renderDialog({ ...legScope, scopeKind: "enrichment", sectionIndex: null, anchorLabel: "Tides" });
  expect(screen.getByText(learnerTerm("guardianArrivalSummitBody"))).toBeTruthy();
});
