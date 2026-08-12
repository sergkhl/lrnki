import { Text } from "@lrnki/learner-app";

const col: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 8, maxWidth: 520 };

/** The type scale. Every learner surface reads type through these variants, so the
 * scale has exactly one definition. `map-title` is the IM Fell English display face —
 * it ships one regular cut and is never faux-bolded. */
export function Scale() {
  return (
    <div style={col}>
      <Text variant="display">Crystal Formation</Text>
      <Text variant="heading">Why some eruptions are explosive</Text>
      <Text variant="title">Leg 2 · Magma and melt</Text>
      <Text variant="map-title">The Frontier Reach</Text>
      <Text variant="label">Expedition progress</Text>
      <Text variant="body">
        A silica-rich melt resists flow, so pressure accumulates until the conduit fails.
      </Text>
      <Text variant="caption">Last sealed 3 days ago</Text>
    </div>
  );
}

/** Semantic color tokens. `ink` is the default; `caption` defaults to `muted`.
 * `on-accent` is for text sitting on a filled accent surface. */
export function Colors() {
  return (
    <div style={col}>
      <Text color="ink">Ink — the default body colour</Text>
      <Text color="muted">Muted — secondary and supporting copy</Text>
      <Text color="trail">Trail — the route you have walked</Text>
      <Text color="award">Award — an earned distinction</Text>
      <Text color="destructive">Destructive — a failed or blocking state</Text>
      <Text color="cavern-ink">Cavern ink — copy on formation surfaces</Text>
    </div>
  );
}

/** Text nests: an inner Text inherits the outer variant unless it sets its own, which
 * is how inline emphasis and tappable term runs are built. */
export function Nested() {
  return (
    <div style={col}>
      <Text variant="body">
        Pressure accumulates until the conduit fails —{" "}
        <Text variant="body" color="trail">
          that is the explosive case
        </Text>
        , and it is the one worth remembering.
      </Text>
    </div>
  );
}

/** `numberOfLines` truncates with an ellipsis after layout, including wrapping. */
export function Truncated() {
  return (
    <div style={{ ...col, width: 320 }}>
      <Text variant="body" numberOfLines={2}>
        Where subduction drives the melt, water lowers the melting point and the resulting
        magma carries both volatiles and silica — the combination behind the most explosive
        eruptions on record.
      </Text>
    </div>
  );
}
