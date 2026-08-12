import { CrystalSpecimen, Text } from "@lrnki/learner-app";

const row: React.CSSProperties = { display: "flex", gap: 20, alignItems: "flex-end", flexWrap: "wrap" };
const cell: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 };

/** The four materials are the progression ladder and the primary axis of this component:
 * `fogged` is unlit ground, `open` is available, `next` is the single current study
 * target, `collected` is mastered. A material swap re-derives every facet fill
 * mechanically from the species' authored 4-colour ramp. Only `fogged` changes hue —
 * it desaturates to stone. The lit three separate by GLOSS and facet contrast, which
 * climb steadily (gloss 0.12 → 0.2 → 0.42), so they read as one stone gaining light
 * rather than three different stones. Rendered large here because that is a subtle axis. */
export function Materials() {
  return (
    <div style={row}>
      {(["fogged", "open", "next", "collected"] as const).map((material) => (
        <div key={material} style={cell}>
          <CrystalSpecimen
            species="band2"
            derivedNodeId={`n-${material}`}
            material={material}
            growthFraction={1}
            size={140}
            ariaLabel={`Ownership — ${material}`}
          />
          <Text variant="caption">{material}</Text>
        </div>
      ))}
    </div>
  );
}

/** The five concept species are the banded stones a leg's concepts are cut from —
 * one per band, so neighbouring concepts stay visually distinct on the formation. */
export function ConceptSpecies() {
  return (
    <div style={row}>
      {(["band1", "band2", "band3", "band4", "band5"] as const).map((species) => (
        <div key={species} style={cell}>
          <CrystalSpecimen
            species={species}
            derivedNodeId={`n-${species}`}
            material="collected"
            growthFraction={1}
            size={88}
            ariaLabel={species}
          />
          <Text variant="caption">{species}</Text>
        </div>
      ))}
    </div>
  );
}

/** The earned species are not concepts — they are the distinctions a learner is awarded:
 * a `keystone` for the concept a leg turns on, a `legWard` for sealing a leg, and a
 * `summitWard` for the expedition's summit. */
export function EarnedSpecies() {
  return (
    <div style={row}>
      {(["keystone", "legWard", "summitWard"] as const).map((species) => (
        <div key={species} style={cell}>
          <CrystalSpecimen
            species={species}
            derivedNodeId={`n-${species}`}
            material="collected"
            growthFraction={1}
            size={104}
            ariaLabel={species}
          />
          <Text variant="caption">{species}</Text>
        </div>
      ))}
    </div>
  );
}

/** `growthFraction` cuts the stone short of its full height — how a crystal reads while
 * it is still forming, before the concept is mastered. */
export function Growth() {
  return (
    <div style={row}>
      {[0.25, 0.5, 0.75, 1].map((growthFraction) => (
        <div key={growthFraction} style={cell}>
          <CrystalSpecimen
            species="band4"
            derivedNodeId={`n-${growthFraction}`}
            material="next"
            growthFraction={growthFraction}
            size={96}
            ariaLabel={`forming ${growthFraction}`}
          />
          <Text variant="caption">{growthFraction}</Text>
        </div>
      ))}
    </div>
  );
}
