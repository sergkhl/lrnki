import assert from "node:assert/strict";
import test from "node:test";
import { crystalSpec, visibleShards } from "./crystalGeometry";

test("crystalSpec is deterministic: same seed and difficulty produce identical geometry", () => {
  const a = crystalSpec("node-abc", 0.5);
  const b = crystalSpec("node-abc", 0.5);
  assert.deepEqual(a, b);
});

test("crystalSpec gives distinct concepts distinct formations", () => {
  const a = crystalSpec("node-abc", 0.5);
  const b = crystalSpec("node-xyz", 0.5);
  assert.notDeepEqual(a.shards.map((shard) => shard.points), b.shards.map((shard) => shard.points));
  assert.notEqual(a.hue, b.hue);
});

test("crystalSpec scales shard count with difficulty band (3..7)", () => {
  assert.equal(crystalSpec("n", 0).shards.length, 3);
  assert.equal(crystalSpec("n", 1).shards.length, 7);
  for (const difficulty of [0, 0.25, 0.5, 0.75, 1]) {
    const count = crystalSpec("n", difficulty).shards.length;
    assert.ok(count >= 3 && count <= 7, `difficulty ${difficulty} → ${count} shards`);
  }
});

test("crystalSpec keeps every hue inside the journal cohesion band", () => {
  for (const key of ["a", "b", "c", "ownership", "borrowing", "0f3c", "long-derived-node-id-value"]) {
    const spec = crystalSpec(key, 0.5);
    assert.ok(Math.abs(spec.hue - 172) <= 20, `hue ${spec.hue} for ${key} outside 172±20`);
  }
});

test("crystalSpec keeps shard geometry inside the viewBox with bases on the bedrock", () => {
  const spec = crystalSpec("bounds-check", 1);
  for (const shard of spec.shards) {
    for (const [x, y] of shard.points) {
      assert.ok(x >= 0 && x <= 100, `x ${x} out of viewBox`);
      assert.ok(y >= 0 && y <= 100, `y ${y} out of viewBox`);
    }
  }
});

test("visibleShards grows monotonically and reserves the final shard for mastery", () => {
  const spec = crystalSpec("growth", 1);
  let previous = 0;
  for (let step = 0; step <= 10; step += 1) {
    const fraction = step / 10;
    const count = visibleShards(spec, fraction).length;
    assert.ok(count >= previous, `growth shrank at ${fraction}`);
    if (fraction > 0 && fraction < 1) {
      assert.ok(count >= 1, `no shard at partial growth ${fraction}`);
      assert.ok(count < spec.shards.length, `crystal finished early at ${fraction}`);
    }
    previous = count;
  }
  assert.equal(visibleShards(spec, 0).length, 0);
  assert.equal(visibleShards(spec, 1).length, spec.shards.length);
});

test("visibleShards returns shards in center-out reveal order", () => {
  const spec = crystalSpec("reveal-order", 1);
  const revealed = visibleShards(spec, 1);
  assert.deepEqual(revealed.map((shard) => shard.revealIndex), revealed.map((_, index) => index));
});
