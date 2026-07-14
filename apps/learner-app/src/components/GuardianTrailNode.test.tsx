import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { RecallScopeStatus } from "@lrnki/application/projection";
import { GuardianTrailNode } from "./GuardianTrailNode";
import { learnerTerm } from "@/learn/vocabulary";

function scope(overrides: Partial<RecallScopeStatus> = {}): RecallScopeStatus {
  return {
    scopeKind: "section",
    anchorDerivedNodeId: "anchor-1",
    anchorLabel: "Borrowing",
    sectionIndex: 0,
    eligibleItemCount: 4,
    state: "available",
    ...overrides
  };
}

async function renderNode(scopeView: RecallScopeStatus, sectionComplete = true) {
  const onEnter = jest.fn(() => Promise.resolve());
  await render(<GuardianTrailNode scope={scopeView} sectionComplete={sectionComplete} onEnter={onEnter} />);
  return { onEnter };
}

test("an available Leg scope offers Face the Guardian and delegates entry (F5)", async () => {
  const view = scope();
  const { onEnter } = await renderNode(view);
  expect(screen.getByText(learnerTerm("guardianFace"))).toBeTruthy();
  await fireEvent.press(screen.getByText(learnerTerm("guardianTitle")));
  expect(onEnter).toHaveBeenCalledWith(view);
});

test("an active scope resumes the durable challenge (AE7: active after refetch)", async () => {
  await renderNode(scope({ state: "active", activeChallengeId: "c1" }));
  expect(screen.getByText(learnerTerm("guardianResume"))).toBeTruthy();
});

test("a won scope is the permanent formation node AND the rematch entry (KTD3)", async () => {
  const view = scope({ state: "won", wonChallengeId: "c-won" });
  const { onEnter } = await renderNode(view);
  expect(screen.getByText(`${learnerTerm("guardianNodeWon")} · ${learnerTerm("guardianRematch")}`)).toBeTruthy();
  await fireEvent.press(screen.getByText(learnerTerm("guardianTitle")));
  expect(onEnter).toHaveBeenCalledWith(view);
});

test("a zero-item Leg surfaces explicit unavailability only once the Leg is complete — never auto-fusing (AE6)", async () => {
  const { onEnter } = await renderNode(scope({ state: "unavailable", eligibleItemCount: 0, reason: "no_eligible_items" }), true);
  expect(screen.getByText(learnerTerm("guardianUnavailable"))).toBeTruthy();
  await fireEvent.press(screen.getByText(learnerTerm("guardianTitle")));
  expect(onEnter).not.toHaveBeenCalled();
});

test("an unavailable scope on an unfinished Leg renders nothing", async () => {
  await renderNode(scope({ state: "unavailable", eligibleItemCount: 0, reason: "no_eligible_items" }), false);
  expect(screen.queryByText(learnerTerm("guardianTitle"))).toBeNull();
});

test("the locked summit names its unlock rule and stays disabled (AE8)", async () => {
  const { onEnter } = await renderNode(scope({ scopeKind: "enrichment", sectionIndex: null, state: "locked" }));
  expect(screen.getByText(learnerTerm("guardianSummitTitle"))).toBeTruthy();
  expect(screen.getByText(learnerTerm("guardianSummitLocked"))).toBeTruthy();
  await fireEvent.press(screen.getByText(learnerTerm("guardianSummitTitle")));
  expect(onEnter).not.toHaveBeenCalled();
});
