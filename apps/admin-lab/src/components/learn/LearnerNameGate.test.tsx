import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LearnerNameGate } from "./LearnerNameGate";

test("LearnerNameGate renders one name/PIN form with login and register submit buttons", () => {
  const html = renderToStaticMarkup(<LearnerNameGate />);

  assert.equal((html.match(/<form /g) ?? []).length, 1);
  assert.equal((html.match(/name="learnerStateRef"/g) ?? []).length, 1);
  assert.equal((html.match(/name="pin"/g) ?? []).length, 1);
  assert.match(html, /value="enter"[\s\S]*name="intent"/);
  assert.match(html, /value="create"[\s\S]*name="intent"/);
});

test("LearnerNameGate pre-fills the refused learner ref", () => {
  const html = renderToStaticMarkup(<LearnerNameGate defaultName="Alex" error="wrong_pin" />);

  assert.match(html, /Alex/);
  assert.match(html, /That PIN/);
});
