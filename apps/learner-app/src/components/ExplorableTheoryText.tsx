import { Text } from "@/ui";
import { termSupportActionLabel } from "@/learn/vocabulary";

// Inline Explorable Term discovery for theory prose (plan 2026-07-13-002 U3, KTD3/KTD4;
// R5-R6). A PURE run builder segments the section text around the first accepted
// occurrence of each assigned term; the render then nests pressable term runs inside one
// body Text. Highlights are EXACT slices of the source string — no normalization, no
// case-insensitive or fuzzy matching — so the prose stays byte-for-byte readable (AE2).

export type TermRun = {
  text: string;
  // The exact term this run highlights, or null for plain prose between highlights.
  term: string | null;
};

// Build the accepted highlight runs (KTD3): consider only the terms given (the caller
// filters by section), reserve LONGER ranges before shorter overlapping ones, keep at
// most the FIRST non-overlapping occurrence of each term, then emit runs in source
// order. Ties on length keep the caller's term order (deterministic).
export function buildTermRuns(text: string, terms: readonly string[]): TermRun[] {
  const reserved: { start: number; end: number; term: string }[] = [];
  const byLength = terms
    .map((term, index) => ({ term, index }))
    .filter((entry) => entry.term.length > 0)
    .sort((a, b) => b.term.length - a.term.length || a.index - b.index);
  for (const { term } of byLength) {
    // First occurrence that does not overlap an already-reserved (longer) range; later
    // repeats of the term stay plain (R5).
    let from = 0;
    while (from <= text.length - term.length) {
      const start = text.indexOf(term, from);
      if (start < 0) break;
      const end = start + term.length;
      if (!reserved.some((range) => start < range.end && end > range.start)) {
        reserved.push({ start, end, term });
        break;
      }
      from = start + 1;
    }
  }
  reserved.sort((a, b) => a.start - b.start);

  const runs: TermRun[] = [];
  let cursor = 0;
  for (const range of reserved) {
    if (range.start > cursor) runs.push({ text: text.slice(cursor, range.start), term: null });
    runs.push({ text: text.slice(range.start, range.end), term: range.term });
    cursor = range.end;
  }
  if (cursor < text.length || runs.length === 0) runs.push({ text: text.slice(cursor), term: null });
  return runs;
}

// Theory prose with tappable first-occurrence term highlights (R6). Each term run is a
// nested Text with button semantics, the exact term in its accessible name, and a dotted
// underline as the non-color cue; the post-content Support Paths panel remains the
// large-target equivalent (KTD4). List items and generated Support Step prose do not
// pass through here (R5).
export function ExplorableTheoryText({
  text,
  terms,
  onPressTerm
}: Readonly<{ text: string; terms: readonly string[]; onPressTerm: (term: string) => void }>) {
  const runs = buildTermRuns(text, terms);
  return (
    <Text variant="body">
      {runs.map((run, index) =>
        run.term === null ? (
          <Text key={index} variant="body">
            {run.text}
          </Text>
        ) : (
          <Text
            key={index}
            variant="body"
            accessibilityRole="button"
            accessibilityLabel={termSupportActionLabel(run.term)}
            onPress={() => onPressTerm(run.term as string)}
            suppressHighlighting
            className="font-medium"
            style={{ textDecorationLine: "underline", textDecorationStyle: "dotted" }}
            testID={`theory-term-${run.term}`}
          >
            {run.text}
          </Text>
        )
      )}
    </Text>
  );
}
