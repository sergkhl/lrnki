import { SupportPathNode, Text } from "@lrnki/learner-app";

const col: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 12, width: 420 };

const detour = (over: Record<string, unknown> = {}) => ({
  detourId: "d1",
  parentDerivedNodeId: "n1",
  term: "subduction",
  status: "ready" as const,
  steps: [],
  completedStepCount: 0,
  totalStepCount: 3,
  firstIncompleteStepId: "s1",
  complete: false,
  phase: null,
  ...over
});

/** One Support Path detour as it appears on the trail: the term it grounds and how far
 * along it the learner is. A detour is added to a single expedition and sits beside the
 * main trail rather than on it. */
export function Progress() {
  return (
    <div style={col}>
      <SupportPathNode detour={detour()} onPress={() => {}} />
      <SupportPathNode detour={detour({ term: "magma viscosity", completedStepCount: 2 })} onPress={() => {}} />
    </div>
  );
}

/** A finished detour reads as complete and stops advertising a next step. */
export function Complete() {
  return (
    <div style={col}>
      <SupportPathNode
        detour={detour({
          term: "volatiles",
          completedStepCount: 3,
          totalStepCount: 3,
          firstIncompleteStepId: null,
          complete: true
        })}
        onPress={() => {}}
      />
      <Text variant="caption">All three steps done — the detour rejoins the main trail.</Text>
    </div>
  );
}
