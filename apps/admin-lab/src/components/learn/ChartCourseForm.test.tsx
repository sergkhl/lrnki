import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ChartCourseForm, nextChartCourseSubmitStep } from "./ChartCourseForm";

test("chart course form renders topic-first copy and no course-data paste prompt", () => {
  const html = renderToStaticMarkup(
    <ChartCourseForm
      learnerStateRef="admin"
      inferDomainAction={async () => ({ ok: true, declaredDomain: "Learning Science" })}
      createExpeditionAction={async () => undefined}
    />
  );

  assert.match(html, /Topic/);
  assert.match(html, /Declared Domain/);
  assert.match(html, /Optional field of study/);
  assert.doesNotMatch(html, /Course data/);
  assert.doesNotMatch(html, /Paste your course data/);
});

test("chart course submit flow creates immediately when the learner supplied a domain", () => {
  assert.equal(nextChartCourseSubmitStep({
    topic: "spaced practice",
    declaredDomain: "Learning Science",
    domainConfirmationRevealed: false
  }), "create");
});

test("chart course submit flow infers before creation when domain is blank", () => {
  assert.equal(nextChartCourseSubmitStep({
    topic: "spaced practice",
    declaredDomain: "",
    domainConfirmationRevealed: false
  }), "infer");
});

test("chart course submit flow blocks empty topic and blank confirmed domain", () => {
  assert.equal(nextChartCourseSubmitStep({
    topic: "",
    declaredDomain: "Learning Science",
    domainConfirmationRevealed: false
  }), "blocked");
  assert.equal(nextChartCourseSubmitStep({
    topic: "spaced practice",
    declaredDomain: "",
    domainConfirmationRevealed: true
  }), "blocked");
});
