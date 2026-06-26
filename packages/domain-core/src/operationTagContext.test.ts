import assert from "node:assert/strict";
import test from "node:test";
import { currentOperationTag, runWithOperationTag } from "./operationTagContext";
import { installNodeOperationTagContext } from "./operationTagContextNode";

installNodeOperationTagContext();

test("returns the active operation tag inside a scope", async () => {
  await runWithOperationTag("op-1", async () => {
    await Promise.resolve();
    assert.equal(currentOperationTag(), "op-1");
  });
});

test("returns undefined outside a scope", () => {
  assert.equal(currentOperationTag(), undefined);
});

test("keeps interleaved async scopes isolated", async () => {
  const release = Promise.withResolvers<void>();
  const first = runWithOperationTag("op-1", async () => {
    await release.promise;
    return currentOperationTag();
  });
  const second = runWithOperationTag("op-2", async () => {
    release.resolve();
    await Promise.resolve();
    return currentOperationTag();
  });

  assert.deepEqual(await Promise.all([first, second]), ["op-1", "op-2"]);
});

test("nested scopes shadow and restore the outer tag", async () => {
  await runWithOperationTag("op-1", async () => {
    assert.equal(currentOperationTag(), "op-1");
    await runWithOperationTag("op-2", async () => {
      assert.equal(currentOperationTag(), "op-2");
    });
    assert.equal(currentOperationTag(), "op-1");
  });
});
