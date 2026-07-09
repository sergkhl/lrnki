import { useMemo, useState } from "react";
import { shuffleIds } from "./shuffle";

// Shuffles an item list once per mount (not per render) while keeping an id-keyed lookup Map
// for O(1) render access. Shared by every activity body that renders its options/statements/
// tiles in a randomized, per-mount-stable order (rule 18) instead of re-deriving this pair of
// hooks at each call site.
export function useShuffledLookup<T, Id extends string>(items: T[], idOf: (item: T) => Id): { orderedIds: Id[]; byId: Map<Id, T> } {
  const byId = useMemo(() => new Map(items.map((item) => [idOf(item), item] as const)), [items]);
  const [orderedIds] = useState(() => shuffleIds(items.map(idOf)));
  return { orderedIds, byId };
}
