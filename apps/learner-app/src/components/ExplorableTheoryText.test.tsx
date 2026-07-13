import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ExplorableTheoryText, buildTermRuns } from "./ExplorableTheoryText";
import { termSupportActionLabel } from "@/learn/vocabulary";

function concat(runs: ReturnType<typeof buildTermRuns>): string {
  return runs.map((run) => run.text).join("");
}

test("Covers AE2: first exact occurrence only — later repeats stay plain", () => {
  const text = "Magma rises. Magma cools into rock. The magma is gone.";
  const runs = buildTermRuns(text, ["Magma"]);
  expect(runs.filter((run) => run.term === "Magma")).toHaveLength(1);
  // The exact-match rule is case-sensitive: the lowercase "magma" is untouched.
  expect(runs[0]).toEqual({ text: "Magma", term: "Magma" });
  expect(concat(runs)).toBe(text);
});

test("Covers AE2: the longer term wins an overlap; the shorter finds a later free occurrence", () => {
  const text = "The magma viscosity controls flow, and viscosity controls eruption style.";
  const runs = buildTermRuns(text, ["viscosity", "magma viscosity"]);
  const highlighted = runs.filter((run) => run.term !== null);
  expect(highlighted.map((run) => run.term)).toEqual(["magma viscosity", "viscosity"]);
  // The shorter term's highlight is its first NON-overlapping occurrence, after the longer range.
  expect(text.indexOf("viscosity controls eruption")).toBeGreaterThan(0);
  expect(concat(runs)).toBe(text);
});

test("a shorter term fully shadowed by a longer range gets no highlight", () => {
  const text = "The borrow checker enforces lifetimes.";
  const runs = buildTermRuns(text, ["borrow", "borrow checker"]);
  expect(runs.filter((run) => run.term !== null).map((run) => run.term)).toEqual(["borrow checker"]);
  expect(concat(runs)).toBe(text);
});

test("Unicode terms and punctuation boundaries survive byte-for-byte (AE2)", () => {
  const text = "El término “razón áurea” (φ ≈ 1.618) aparece aquí; razón áurea otra vez.";
  const runs = buildTermRuns(text, ["razón áurea", "φ"]);
  expect(runs.filter((run) => run.term === "razón áurea")).toHaveLength(1);
  expect(runs.filter((run) => run.term === "φ")).toHaveLength(1);
  expect(concat(runs)).toBe(text);
});

test("no fuzzy or case-insensitive matching: an absent exact term highlights nothing", () => {
  const text = "Ownership moves on assignment.";
  const runs = buildTermRuns(text, ["ownership", "move semantics"]);
  expect(runs).toEqual([{ text, term: null }]);
});

test("empty text yields one empty plain run and never throws", () => {
  expect(buildTermRuns("", ["term"])).toEqual([{ text: "", term: null }]);
});

test("a highlighted term announces button semantics with the exact term and opens the dialog callback (R6)", async () => {
  const onPressTerm = jest.fn();
  await render(
    <ExplorableTheoryText text="Subduction drives volcanism." terms={["Subduction"]} onPressTerm={onPressTerm} />
  );
  const term = screen.getByLabelText(termSupportActionLabel("Subduction"));
  expect(term.props.accessibilityRole).toBe("button");
  await fireEvent.press(term);
  expect(onPressTerm).toHaveBeenCalledWith("Subduction");
});
