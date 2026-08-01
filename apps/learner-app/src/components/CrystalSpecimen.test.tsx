import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { CrystalSpecimen } from "./CrystalSpecimen";
import { CRYSTAL_CAP_Y, crystalSpec } from "@/learn/crystalLibrary";
import { growthCutY } from "@/learn/mineralSpecimen";

// U2 rendering contract (KTD7): the slot's own material fills the whole silhouette and the
// full-colour collected material rises over it from the bedrock. Two passes, one geometry,
// one clip — and the ladder never rests on colour alone: fill height and gloss presence
// carry it in greyscale too. (Jest gotcha: one render per test.)

const NODE = "node-specimen";

test("a collected crystal renders the full-colour pass over its slot with every facet", async () => {
  await render(
    <CrystalSpecimen species="band5" derivedNodeId={NODE} material="collected" growthFraction={1} />
  );
  expect(screen.getByTestId("specimen-body")).toBeTruthy();
  expect(screen.getByTestId("specimen-fill")).toBeTruthy();
  expect(screen.getAllByTestId("specimen-fill-facet")).toHaveLength(crystalSpec("band5").facets.length);
  expect(screen.getAllByTestId("specimen-fill-gloss")).toHaveLength(crystalSpec("band5").gloss.length);
  expect(screen.getByLabelText("Collected crystal")).toBeTruthy();
});

test("a partly grown crystal shows the slot material with the collected fill risen part-way", async () => {
  await render(
    <CrystalSpecimen species="band1" derivedNodeId={NODE} material="open" growthFraction={0.5} />
  );
  const body = screen.getByTestId("specimen-body");
  const fill = screen.getByTestId("specimen-fill");
  // The slot fills the WHOLE silhouette; the risen region stops exactly at the growth cut.
  expect(topOf(body)).toBe(CRYSTAL_CAP_Y);
  expect(topOf(fill)).toBe(growthCutY(crystalSpec("band1"), 0.5));
  // Two material resolutions of one geometry — never the same fill drawn twice.
  expect(fill.props.fill).not.toEqual(body.props.fill);
  expect(screen.getByLabelText("Growing crystal")).toBeTruthy();
});

test("a fogged slot renders stone silhouette only — no collected fill and no gloss at all", async () => {
  await render(
    <CrystalSpecimen species="band3" derivedNodeId={NODE} material="fogged" growthFraction={1} ariaLabel="Known ground" />
  );
  expect(screen.getByTestId("specimen-body")).toBeTruthy();
  expect(screen.queryAllByTestId("specimen-fill")).toHaveLength(0);
  // Fogged carries no gloss, so the ladder's first step survives greyscale (WCAG F73).
  expect(screen.queryAllByTestId("specimen-body-gloss")).toHaveLength(0);
  expect(screen.getByLabelText("Known ground")).toBeTruthy();
});

test("growth zero renders the slot alone — the risen region is degenerate", async () => {
  await render(
    <CrystalSpecimen species="band4" derivedNodeId={NODE} material="next" growthFraction={0} />
  );
  expect(screen.getByTestId("specimen-body")).toBeTruthy();
  expect(screen.getAllByTestId("specimen-body-gloss").length).toBeGreaterThan(0);
  expect(screen.queryAllByTestId("specimen-fill")).toHaveLength(0);
});

test("the rim light and occlusion contour frame every material exactly once", async () => {
  await render(
    <CrystalSpecimen species="keystone" derivedNodeId={NODE} material="next" growthFraction={0.3} />
  );
  expect(screen.getAllByTestId("specimen-contour")).toHaveLength(1);
  expect(screen.getAllByTestId("specimen-rim")).toHaveLength(1);
});

// KTD3, and the mitigation R9 is bought with: SVG ids are document-global on web (two
// surfaces showing the same concept at two growth values would collide) and gradients /
// patterns / filters head the react-native-svg Android divergence class. Plain fill and
// stroke opacity are safe and are all the library uses.
test("no SVG id, gradient, pattern, filter, or Defs exists anywhere in the crystal library", () => {
  const sources = ["../learn/crystalLibrary.ts", "../learn/crystalLibrary.data.ts", "./CrystalSpecimen.tsx"].map(
    // Comments are stripped first: the modules NAME these constructs to forbid them, and the
    // rule is about emitted markup, not prose.
    (relative) => readFileSync(resolve(__dirname, relative), "utf8").replace(/^\s*\/\/.*$/gm, "")
  );
  for (const source of sources) {
    for (const forbidden of [/<Defs/, /<ClipPath/, /Gradient/, /<Pattern/, /<Filter/, /url\(#/, /\bid=/]) {
      expect(source).not.toMatch(forbidden);
    }
  }
});

// react-native-svg compiles <Polygon> to a host path, so geometry is asserted through `d`.
function topOf(node: { props: { d?: string } }): number {
  const numbers = (node.props.d ?? "").match(/[\d.]+/g)?.map(Number) ?? [];
  return Math.min(...numbers.filter((_, index) => index % 2 === 1));
}
