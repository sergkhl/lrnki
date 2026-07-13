import type { StudySession } from "@lrnki/application/projection";
import type { TrailView } from "@lrnki/application/projection";
import { learnerTerm } from "./vocabulary";

// Goal-gradient copy (plan 2026-07-10-001 U2). The layer purpose is stored in PLAIN
// register (ADR-0033); these helpers theme it into expedition language at render and own
// the mechanical fail-open template for an enrichment without a purpose row.

// The merged header/terminus summit line: "Summit: {label} — {purpose}", falling back to
// the mechanical template "Summit: {label} — {n} legs, {m} crystals" (design decision 2).
export function summitLine(input: {
  summitLabel: string;
  layerPurpose: string | null;
  legCount: number;
  crystalCount: number;
}): string {
  const prefix = `${learnerTerm("summitPrefix")}: ${input.summitLabel}`;
  const purpose = input.layerPurpose?.trim();
  if (purpose) return `${prefix} — ${purpose}`;
  return `${prefix} — ${input.legCount} ${input.legCount === 1 ? "leg" : "legs"}, ${input.crystalCount} ${input.crystalCount === 1 ? "crystal" : "crystals"}`;
}

// True when the trail is in its final leg with work remaining — the header eyebrow swaps
// to the summit-push copy (U2). A finished trail returns false (the push is over).
export function isSummitPush(trail: TrailView): boolean {
  if (trail.sections.length === 0) return false;
  const lastIndex = trail.sections[trail.sections.length - 1].sectionIndex;
  return trail.currentSectionIndex === lastIndex && trail.masteredCount < trail.totalClusters;
}

// The leg banner's advance-visible goal ("Leg 2 · 5 crystals guard Bayes' theorem") or its
// completed state ("Leg 2 · Bayes' theorem secured").
export function legBannerLine(input: { sectionIndex: number; conceptCount: number; masteredCount: number; milestoneLabel: string }): string {
  const ordinal = `${learnerTerm("section")} ${input.sectionIndex + 1}`;
  if (input.masteredCount >= input.conceptCount) {
    return `${ordinal} · ${input.milestoneLabel} ${learnerTerm("legSecured")}`;
  }
  const guarding = input.conceptCount - input.masteredCount;
  const noun = guarding === 1 ? "crystal" : "crystals";
  const verb = guarding === 1 ? learnerTerm("legGuardVerbSingular") : learnerTerm("legGuardVerb");
  return `${ordinal} · ${guarding} ${noun} ${verb} ${input.milestoneLabel}`;
}

// The trail-terminus line under the summit visual: remaining crystals to the summit, or
// the reached state.
export function terminusLine(trail: TrailView): string {
  const remaining = trail.totalClusters - trail.masteredCount;
  if (remaining <= 0) return learnerTerm("terminusReached");
  if (remaining === 1) return learnerTerm("terminusRemainingSingular");
  return learnerTerm("terminusRemainingTemplate").replace("{count}", String(remaining));
}

// Journal teaser (2-line clamp at render): the themed purpose, or null when no purpose row
// exists — the card's existing progress line is the mechanical fallback there.
export function purposeTeaser(session: Pick<StudySession, "layerPurpose">): string | null {
  const purpose = session.layerPurpose?.trim();
  return purpose ? purpose : null;
}
