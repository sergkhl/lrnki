import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LearnerNameGate, gateErrorMessage } from "./LearnerNameGate";

test("LearnerNameGate renders one name/PIN form with login and register submit buttons", () => {
  const html = renderToStaticMarkup(<LearnerNameGate onEntered={() => undefined} />);

  assert.equal((html.match(/<form /g) ?? []).length, 1);
  assert.equal((html.match(/name="learnerStateRef"/g) ?? []).length, 1);
  assert.equal((html.match(/name="pin"/g) ?? []).length, 1);
});

test("gate maps every session refusal code to themed copy", () => {
  assert.match(gateErrorMessage("wrong_pin"), /PIN/);
  assert.match(gateErrorMessage("invalid_pin"), /4–8/);
  assert.match(gateErrorMessage("name_taken"), /taken/);
  assert.match(gateErrorMessage("rate_limited"), /try again/i);
});
