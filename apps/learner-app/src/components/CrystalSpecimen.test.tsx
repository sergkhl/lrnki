import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { CrystalSpecimen } from "./CrystalSpecimen";
import { mineralHabitFor, mineralSpecimenSpec } from "@/learn/mineralSpecimen";

// U1 rendering contract (test scenarios 2, 5): which facets render grown vs pending vs
// ghost is the observable state language — never color alone.

const NODE = "node-specimen";
const SECTION = { sectionIndex: 0, sectionPositionIndex: 0 };
const SPEC = mineralSpecimenSpec(mineralHabitFor(SECTION), NODE);

test("a collected specimen renders every facet grown with the shared highlight", async () => {
  await render(<CrystalSpecimen derivedNodeId={NODE} {...SECTION} growthFraction={1} state="collected" />);
  expect(screen.getAllByTestId("facet-grown")).toHaveLength(SPEC.facets.length);
  expect(screen.queryAllByTestId("facet-pending")).toHaveLength(0);
  expect(screen.getByTestId("facet-highlight")).toBeTruthy();
  expect(screen.getByLabelText("Collected crystal")).toBeTruthy();
});

test("a partially grown specimen shows grown facets over the faint pending silhouette", async () => {
  await render(<CrystalSpecimen derivedNodeId={NODE} {...SECTION} growthFraction={0.5} state="growing" />);
  const grown = screen.getAllByTestId("facet-grown");
  const pending = screen.getAllByTestId("facet-pending");
  expect(grown.length).toBeGreaterThan(0);
  expect(grown.length).toBeLessThan(SPEC.facets.length);
  expect(grown.length + pending.length).toBe(SPEC.facets.length);
  expect(screen.queryAllByTestId("facet-highlight")).toHaveLength(0);
});

test("a ghost slot renders outline-only facets and never a collected fill or highlight", async () => {
  await render(<CrystalSpecimen derivedNodeId={NODE} {...SECTION} growthFraction={1} state="ghost" ariaLabel="Known ground" />);
  expect(screen.getAllByTestId("facet-ghost")).toHaveLength(SPEC.facets.length);
  expect(screen.queryAllByTestId("facet-grown")).toHaveLength(0);
  expect(screen.queryAllByTestId("facet-highlight")).toHaveLength(0);
  expect(screen.getByLabelText("Known ground")).toBeTruthy();
});

test("growth zero renders only the pending silhouette", async () => {
  await render(<CrystalSpecimen derivedNodeId={NODE} {...SECTION} growthFraction={0} state="growing" />);
  expect(screen.queryAllByTestId("facet-grown")).toHaveLength(0);
  expect(screen.getAllByTestId("facet-pending")).toHaveLength(SPEC.facets.length);
});
