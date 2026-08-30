// The Recall Challenge ward budget (plan 2026-07-13-003 R2): how many crystals one scope's
// Guardian can ever hold. It lives in its own module because two modules depend on it and
// neither owns the other — `recallChallenge.ts` truncates lineup selection to it, while the
// Expedition Route Plan uses the same bound for maximum Leg Concepts. One source of truth, no
// re-export shim.
//
// The budget is what makes the Leg split a COUNTING guarantee rather than a tuned threshold:
// a lineup draws exclusively from current Study Items, so a Leg holding more itemful concepts
// than its Guardian has wards provably leaves at least the excess untested.
export const SECTION_LINEUP_MAX = 5;
export const ENRICHMENT_LINEUP_MAX = 7;
