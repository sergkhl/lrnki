import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LessonSections } from "./LessonSections";

test("LessonSections renders list items and emphasizes the first matching key term", () => {
  const html = renderToStaticMarkup(
    <LessonSections
      lesson={{
        derivedNodeId: "n1",
        canonicalLabel: "Ownership",
        sections: [{
          kind: "applications",
          text: "Ownership helps track moves.",
          keyTerms: ["Ownership"],
          items: ["Ownership identifies one current owner.", "Moves transfer that owner."],
          groundingProvenance: "generated",
          isSourceCited: false
        }]
      }}
    />
  );

  assert.match(html, /<ul/);
  assert.match(html, /<li/);
  assert.match(html, /<mark/);
  assert.match(html, /identifies one current owner/);
  assert.match(html, /Moves transfer that owner/);
});
