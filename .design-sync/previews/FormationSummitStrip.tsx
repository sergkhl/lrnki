import { FormationSummitStrip, Text } from "@lrnki/learner-app";

const col: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 16, width: 460 };
const cell: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };

/** The strip that closes a Crystal Formation: the expedition's summit keystone and how
 * many legs have been sealed beneath it. The keystone only seats once every leg's
 * Guardian has been bested. */
export function SealingProgress() {
  return (
    <div style={col}>
      {[
        { sealedLegCount: 0, label: "No legs sealed yet" },
        { sealedLegCount: 2, label: "Two of four legs sealed" },
        { sealedLegCount: 4, keystoneSeated: true, label: "All legs sealed — keystone seated" }
      ].map(({ sealedLegCount, keystoneSeated = false, label }) => (
        <div key={label} style={cell}>
          <Text variant="caption">{label}</Text>
          <FormationSummitStrip
            summit={{ species: "summitWard", keystoneSeated, crystalSize: 72, legCount: 4, sealedLegCount }}
            width={420}
          />
        </div>
      ))}
    </div>
  );
}

/** A short expedition — the strip scales to the leg count rather than a fixed grid. */
export function ShortExpedition() {
  return (
    <div style={col}>
      <FormationSummitStrip
        summit={{ species: "keystone", keystoneSeated: true, crystalSize: 72, legCount: 2, sealedLegCount: 2 }}
        width={420}
      />
    </div>
  );
}
