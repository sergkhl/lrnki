import assert from "node:assert/strict";
import test from "node:test";
import { currentOperationContext, runWithOperationContext } from "./operationContext";
import { installNodeOperationContext } from "./operationContextNode";

installNodeOperationContext();

const context = (operationId: string) => ({
  operationId,
  operationType: "extraction",
  allowedTimelineStages: new Set(["document-load", "concept-discovery"]),
  allowedNeuralStages: new Set(["concept-discovery"])
});

test("returns the active operation context inside a scope", async () => {
  const active = context("op-1");
  await runWithOperationContext(active, async () => {
    await Promise.resolve();
    assert.equal(currentOperationContext(), active);
  });
});

test("returns undefined outside a scope", () => {
  assert.equal(currentOperationContext(), undefined);
});

test("keeps interleaved async scopes isolated", async () => {
  const release = Promise.withResolvers<void>();
  const firstContext = context("op-1");
  const secondContext = context("op-2");
  const first = runWithOperationContext(firstContext, async () => {
    await release.promise;
    return currentOperationContext();
  });
  const second = runWithOperationContext(secondContext, async () => {
    release.resolve();
    await Promise.resolve();
    return currentOperationContext();
  });

  assert.deepEqual(await Promise.all([first, second]), [firstContext, secondContext]);
});

test("nested scopes shadow and restore the outer context", async () => {
  const outer = context("op-1");
  const inner = context("op-2");
  await runWithOperationContext(outer, async () => {
    assert.equal(currentOperationContext(), outer);
    await runWithOperationContext(inner, async () => {
      assert.equal(currentOperationContext(), inner);
    });
    assert.equal(currentOperationContext(), outer);
  });
});
