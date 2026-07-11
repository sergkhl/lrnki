import { beforeEach, expect, jest, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { useReducedMotion } from "react-native-reanimated";
import { CrystalGlyph } from "./CrystalGlyph";
import { crystalSpec, visibleShards } from "@/learn/crystalGeometry";

// U5 assembly semantics (test scenarios 2, 5-7): which shards render through the
// one-shot assembling group vs the static polygon is the observable contract. The Jest
// Reanimated mock resolves timings immediately, so final states are always present.

const NODE = "node-assembly";
const DIFFICULTY = 0.5;
const SPEC = crystalSpec(NODE, DIFFICULTY);

beforeEach(() => {
  (useReducedMotion as jest.Mock).mockReturnValue(false);
});

test("a mastered crystal renders every shard statically with its glint when not assembling", async () => {
  await render(<CrystalGlyph derivedNodeId={NODE} difficulty={DIFFICULTY} growthFraction={1} state="mastered" />);
  expect(screen.getAllByTestId("shard-static")).toHaveLength(SPEC.shards.length);
  expect(screen.queryAllByTestId("shard-assembling")).toHaveLength(0);
  expect(screen.getByTestId("glint-static")).toBeTruthy();
});

test("the mastery reveal assembles every shard from the bedrock and flares the glint once", async () => {
  await render(<CrystalGlyph derivedNodeId={NODE} difficulty={DIFFICULTY} growthFraction={1} state="mastered" assemble />);
  expect(screen.getAllByTestId("shard-assembling")).toHaveLength(SPEC.shards.length);
  expect(screen.queryAllByTestId("shard-static")).toHaveLength(0);
  expect(screen.getByTestId("glint-flare")).toBeTruthy();
});

test("a known-skipped ghost crystal never assembles even when asked to (scenario 7)", async () => {
  await render(<CrystalGlyph derivedNodeId={NODE} difficulty={DIFFICULTY} growthFraction={1} state="mastered" ghost assemble />);
  expect(screen.queryAllByTestId("shard-assembling")).toHaveLength(0);
  expect(screen.getAllByTestId("shard-static")).toHaveLength(SPEC.shards.length);
});

test("reduced motion renders the assembled final state with no facet sequencing (scenario 2)", async () => {
  (useReducedMotion as jest.Mock).mockReturnValue(true);
  await render(<CrystalGlyph derivedNodeId={NODE} difficulty={DIFFICULTY} growthFraction={1} state="mastered" assemble />);
  expect(screen.queryAllByTestId("shard-assembling")).toHaveLength(0);
  expect(screen.getAllByTestId("shard-static")).toHaveLength(SPEC.shards.length);
  expect(screen.getByTestId("glint-static")).toBeTruthy();
});

test("a growthFraction rise reveals only the newly earned shards once (scenarios 5-6)", async () => {
  const tree = await render(
    <CrystalGlyph derivedNodeId={NODE} difficulty={DIFFICULTY} growthFraction={0.3} state="frontier" />
  );
  expect(screen.queryAllByTestId("shard-assembling")).toHaveLength(0);

  await tree.rerender(
    <CrystalGlyph derivedNodeId={NODE} difficulty={DIFFICULTY} growthFraction={0.6} state="frontier" />
  );
  const before = visibleShards(SPEC, 0.3).length;
  const after = visibleShards(SPEC, 0.6).length;
  expect(after).toBeGreaterThan(before);
  expect(screen.getAllByTestId("shard-assembling")).toHaveLength(after - before);
  expect(screen.getAllByTestId("shard-static")).toHaveLength(before);

  // An unchanged re-render keeps the same reveal batch — never a wider replay.
  await tree.rerender(
    <CrystalGlyph derivedNodeId={NODE} difficulty={DIFFICULTY} growthFraction={0.6} state="frontier" />
  );
  expect(screen.getAllByTestId("shard-assembling")).toHaveLength(after - before);
});

test("a fresh mount of a partial crystal renders statically — growth never replays on return (scenario 6)", async () => {
  await render(<CrystalGlyph derivedNodeId={NODE} difficulty={DIFFICULTY} growthFraction={0.6} state="frontier" />);
  expect(screen.queryAllByTestId("shard-assembling")).toHaveLength(0);
  expect(screen.getAllByTestId("shard-static")).toHaveLength(visibleShards(SPEC, 0.6).length);
});
