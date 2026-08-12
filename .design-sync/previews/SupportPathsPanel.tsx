import { Card, SupportPathsPanel, Text } from "@lrnki/learner-app";

const page: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 12, width: 460 };

const available = (term: string) => ({ term, sectionKind: null, support: { kind: "available" as const } });

/** The post-content panel of Explorable Terms: one row per term with an icon-only
 * action at the large-target size. It is the accessible equivalent of the inline
 * tappable term runs in `ExplorableTheoryText`. */
export function Panel() {
  return (
    <div style={page}>
      <Card className="gap-3 p-4">
        <Text variant="label">Explorable terms in this section</Text>
        <SupportPathsPanel
          terms={[available("magma viscosity"), available("subduction"), available("volatiles")]}
          busyTerm={null}
          onSelect={() => {}}
        />
      </Card>
    </div>
  );
}

/** `busyTerm` marks the single row whose Support Path is being requested — the rest
 * stay interactive. */
export function OneBusy() {
  return (
    <div style={page}>
      <Card className="gap-3 p-4">
        <SupportPathsPanel
          terms={[available("magma viscosity"), available("subduction"), available("volatiles")]}
          busyTerm="subduction"
          onSelect={() => {}}
        />
      </Card>
    </div>
  );
}

/** Long terms wrap rather than shrinking the action target, and short or non-Latin
 * terms keep the same row height. */
export function LongAndShortTerms() {
  return (
    <div style={page}>
      <Card className="gap-3 p-4">
        <SupportPathsPanel
          terms={[
            available("a very long explorable term label that must wrap without shrinking the action target"),
            available("φ"),
            available("ssthresh")
          ]}
          busyTerm={null}
          onSelect={() => {}}
        />
      </Card>
    </div>
  );
}
