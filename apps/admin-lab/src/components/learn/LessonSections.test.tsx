import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LessonSections } from "./LessonSections";

test("LessonSections renders section text verbatim with list items and no highlight markup", () => {
  const html = renderToStaticMarkup(
    <LessonSections
      lesson={{
        derivedNodeId: "n1",
        canonicalLabel: "Ownership",
        sections: [{
          kind: "applications",
          text: "Ownership helps track moves.",
          items: ["Ownership identifies one current owner.", "Moves transfer that owner."],
          groundingProvenance: "generated",
          isSourceCited: false
        }]
      }}
    />
  );

  assert.match(html, /<ul/);
  assert.match(html, /<li/);
  assert.doesNotMatch(html, /<mark/, "key-term highlighting is removed end-to-end (R11)");
  assert.match(html, /Ownership helps track moves\./);
  assert.match(html, /identifies one current owner/);
  assert.match(html, /Moves transfer that owner/);
});
