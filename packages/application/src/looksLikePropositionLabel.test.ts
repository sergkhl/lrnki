import assert from "node:assert/strict";
import test from "node:test";
import { looksLikePropositionLabel } from "@lrnki/domain-core";

// Proposition-shaped labels are Claims, not Concepts, and must be demoted.
test("flags proposition-shaped labels", () => {
  for (const label of [
    "Division of Labour Limited by the Extent of the Market",
    "Price is Determined by Supply and Demand",
    "Output Depends on Capital",
    "Growth is Constrained by the Extent of the Market"
  ]) {
    assert.equal(looksLikePropositionLabel(label), true, label);
  }
});

// Real fixture core labels are nominal concepts and must never be demoted.
test("does not flag nominal concept labels", () => {
  for (const label of [
    "Division of Labour",
    "DNA replication",
    "Meselson and Stahl experiment",
    "Rust move semantics",
    "Variable Scope (Rust)",
    "complementary base pairing",
    "semi-conservative replication model",
    "double helix structure of DNA",
    "Instructor-Aligned Knowledge Graphs",
    "Temporal Signal",
    "Productive Powers of Labour",
    "Memory Safety",
    "Ownership (Rust)"
  ]) {
    assert.equal(looksLikePropositionLabel(label), false, label);
  }
});
