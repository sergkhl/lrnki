import assert from "node:assert/strict";
import test from "node:test";
import { GenerationClaimLostError } from "@lrnki/application";
import { reportGenerationAttemptError } from "./generationSupervisor";

test("claim loss is reported as an expected warning without an error stack", () => {
  const warnings: unknown[][] = [];
  const errors: unknown[][] = [];
  const originalWarn = console.warn;
  const originalError = console.error;
  console.warn = (...args) => warnings.push(args);
  console.error = (...args) => errors.push(args);
  try {
    reportGenerationAttemptError("Learner topic", new GenerationClaimLostError("lost"));
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
  }

  assert.deepEqual(warnings, [["Learner topic generation claim lost; a newer attempt is authoritative."]]);
  assert.deepEqual(errors, []);
});

test("unexpected generation errors retain the original error log", () => {
  const errors: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args);
  const failure = new Error("model failed");
  try {
    reportGenerationAttemptError("Learner topic", failure);
  } finally {
    console.error = originalError;
  }

  assert.deepEqual(errors, [["Learner topic generation attempt failed.", failure]]);
});
