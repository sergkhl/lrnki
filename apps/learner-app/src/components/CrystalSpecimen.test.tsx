import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { CrystalSpecimen } from "./CrystalSpecimen";
import { mineralSpecimenSpec } from "@/learn/mineralSpecimen";

// U1 rendering contract (D1): ghost outline → rising fill → full color + gloss is the
// observable state language — never color alone. (Jest gotcha: one render per test.)

const NODE = "node-specimen";

test("a collected specimen renders the full fill, every facet, and the gloss", async () => {
  await render(<CrystalSpecimen derivedNodeId={NODE} difficulty={0.9} growthFraction={1} state="collected" />);
  expect(screen.getByTestId("specimen-fill")).toBeTruthy();
  expect(screen.getAllByTestId("specimen-facet")).toHaveLength(mineralSpecimenSpec("diamond").facets.length);
  expect(screen.getByTestId("specimen-gloss")).toBeTruthy();
  expect(screen.getByLabelText("Collected crystal")).toBeTruthy();
});

test("a growing specimen shows the faint full outline with a partial fill and no gloss", async () => {
  await render(<CrystalSpecimen derivedNodeId={NODE} difficulty={0.1} growthFraction={0.5} state="growing" />);
  expect(screen.getByTestId("specimen-outline")).toBeTruthy();
  expect(screen.getByTestId("specimen-fill")).toBeTruthy();
  expect(screen.queryAllByTestId("specimen-gloss")).toHaveLength(0);
  expect(screen.getByLabelText("Growing crystal")).toBeTruthy();
});

test("a ghost slot renders outline-only and never a fill or gloss", async () => {
  await render(<CrystalSpecimen derivedNodeId={NODE} difficulty={0.1} growthFraction={1} state="ghost" ariaLabel="Known ground" />);
  expect(screen.getByTestId("specimen-ghost")).toBeTruthy();
  expect(screen.queryAllByTestId("specimen-fill")).toHaveLength(0);
  expect(screen.queryAllByTestId("specimen-gloss")).toHaveLength(0);
  expect(screen.getByLabelText("Known ground")).toBeTruthy();
});

test("growth zero renders only the teasing outline — the fill region is degenerate", async () => {
  await render(<CrystalSpecimen derivedNodeId={NODE} difficulty={0.1} growthFraction={0} state="growing" />);
  expect(screen.getByTestId("specimen-outline")).toBeTruthy();
  expect(screen.queryAllByTestId("specimen-fill")).toHaveLength(0);
});
