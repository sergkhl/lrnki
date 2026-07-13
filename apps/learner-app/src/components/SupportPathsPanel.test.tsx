import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ExplorableTermView } from "@lrnki/application/projection";
import { SupportPathsPanel } from "./SupportPathsPanel";
import { termSupportActionLabel } from "@/learn/vocabulary";

function available(term: string): ExplorableTermView {
  return { term, sectionKind: null, support: { kind: "available" } };
}

test("a five-row panel renders every term label and five icon-only actions (R2/R8)", async () => {
  const onSelect = jest.fn();
  const terms = [
    available("magma viscosity"),
    available("subduction"),
    available("a very long explorable term label that must wrap without shrinking the action target"),
    available("φ"),
    available("ssthresh")
  ];
  await render(<SupportPathsPanel terms={terms} busyTerm={null} onSelect={onSelect} />);
  for (const entry of terms) {
    expect(screen.getByText(entry.term)).toBeTruthy();
    expect(screen.getByLabelText(termSupportActionLabel(entry.term))).toBeTruthy();
  }
  await fireEvent.press(screen.getByTestId("support-path-add-subduction"));
  expect(onSelect).toHaveBeenCalledWith("subduction");
});

test("Covers AE3/AE8: active-detour terms are omitted; an empty available list renders nothing", async () => {
  const terms: ExplorableTermView[] = [
    { term: "ownership", sectionKind: null, support: { kind: "generating", detourId: "d1", phase: "preparing" } },
    { term: "borrowing", sectionKind: null, support: { kind: "ready", detourId: "d2", complete: false } }
  ];
  await render(<SupportPathsPanel terms={terms} busyTerm={null} onSelect={jest.fn()} />);
  expect(screen.queryByTestId("support-paths-panel")).toBeNull();
});

test("a busy term blocks every action so a double press cannot double-submit (R4)", async () => {
  const onSelect = jest.fn();
  await render(
    <SupportPathsPanel terms={[available("magma"), available("lava")]} busyTerm="magma" onSelect={onSelect} />
  );
  await fireEvent.press(screen.getByTestId("support-path-add-magma"));
  await fireEvent.press(screen.getByTestId("support-path-add-lava"));
  expect(onSelect).not.toHaveBeenCalled();
});
