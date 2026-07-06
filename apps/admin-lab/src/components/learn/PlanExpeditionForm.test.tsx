import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PlanExpeditionForm, canPlanExpedition } from "./PlanExpeditionForm";

test("plan expedition form renders single-topic copy and no domain confirmation", () => {
  const html = renderToStaticMarkup(
    <PlanExpeditionForm
      learnerStateRef="admin"
      createExpeditionAction={async () => undefined}
    />
  );

  assert.match(html, /Topic/);
  assert.match(html, /Plan expedition/);
  assert.doesNotMatch(html, /Declared Domain/);
  assert.doesNotMatch(html, /Optional field of study/);
  assert.doesNotMatch(html, /Course data/);
  assert.doesNotMatch(html, /Paste your course data/);
});

test("plan expedition form renders server-picked example topic chips", () => {
  const html = renderToStaticMarkup(
    <PlanExpeditionForm
      learnerStateRef="admin"
      createExpeditionAction={async () => undefined}
      exampleTopics={["Game Theory", "Rust ownership"]}
    />
  );

  assert.match(html, /Game Theory/);
  assert.match(html, /Rust ownership/);
});

test("plan expedition submit flow blocks an empty topic", () => {
  assert.equal(canPlanExpedition(""), false);
  assert.equal(canPlanExpedition("   "), false);
});

test("plan expedition submit flow allows a non-empty topic", () => {
  assert.equal(canPlanExpedition("spaced practice"), true);
});
