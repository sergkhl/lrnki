import { CrystalGuardian, Text } from "@lrnki/learner-app";

const row: React.CSSProperties = { display: "flex", gap: 24, alignItems: "flex-end", flexWrap: "wrap" };
const cell: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 };

/** The Guardian that must be bested to seal a leg. Its shield is the recall attempt
 * budget: `shieldRemaining` falls as answers miss, and the figure visibly loses cover. */
export function ShieldState() {
  return (
    <div style={row}>
      {[
        { shieldRemaining: 3, label: "Full shield" },
        { shieldRemaining: 2, label: "One lost" },
        { shieldRemaining: 1, label: "Last cover" },
        { shieldRemaining: 0, label: "Shield gone" }
      ].map(({ shieldRemaining, label }) => (
        <div key={label} style={cell}>
          <CrystalGuardian
            scopeKind="section"
            phase="active"
            wardTotal={4}
            wardsRemaining={4}
            shieldRemaining={shieldRemaining}
            shieldTotal={3}
            size={120}
          />
          <Text variant="caption">{label}</Text>
        </div>
      ))}
    </div>
  );
}

/** `wardsRemaining` counts the wards still standing between the learner and the seal —
 * it falls as each recall ward is answered. */
export function WardsFalling() {
  return (
    <div style={row}>
      {[4, 2, 0].map((wardsRemaining) => (
        <div key={wardsRemaining} style={cell}>
          <CrystalGuardian
            scopeKind="section"
            phase="active"
            wardTotal={4}
            wardsRemaining={wardsRemaining}
            shieldRemaining={3}
            shieldTotal={3}
            size={120}
          />
          <Text variant="caption">{wardsRemaining} of 4 wards</Text>
        </div>
      ))}
    </div>
  );
}

/** `recovery` is the phase after a miss — the Guardian is regaining its footing and the
 * surface is not accepting an answer. `enrichment` scope is the whole-expedition Guardian
 * rather than a single leg's. */
export function PhaseAndScope() {
  return (
    <div style={row}>
      <div style={cell}>
        <CrystalGuardian
          scopeKind="section"
          phase="recovery"
          wardTotal={4}
          wardsRemaining={3}
          shieldRemaining={2}
          shieldTotal={3}
          size={120}
        />
        <Text variant="caption">section · recovery</Text>
      </div>
      <div style={cell}>
        <CrystalGuardian
          scopeKind="enrichment"
          phase="active"
          wardTotal={6}
          wardsRemaining={6}
          shieldRemaining={3}
          shieldTotal={3}
          size={120}
        />
        <Text variant="caption">enrichment · active</Text>
      </div>
    </div>
  );
}
