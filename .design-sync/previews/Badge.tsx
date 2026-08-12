import { Badge } from "@lrnki/learner-app";

const row: React.CSSProperties = { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" };

/** The default badge: a hairline pill on the card surface, for a short status or a
 * count that sits beside a title. */
export function Default() {
  return (
    <div style={row}>
      <Badge>Route</Badge>
      <Badge>2 of 4</Badge>
      <Badge>Generated</Badge>
    </div>
  );
}

/** Tone comes from token classes on `className`, not from a variant prop — the badge
 * is deliberately a thin wrapper so surfaces can tint it with the same palette they use
 * for everything else. `textClassName` recolours the label for filled tones. */
export function Tones() {
  return (
    <div style={row}>
      <Badge className="border-gem-soft bg-gem-soft">Earth science</Badge>
      <Badge className="border-gold bg-gold" textClassName="text-gold-ink">
        Mastered
      </Badge>
      <Badge className="border-trail-muted bg-trail-muted">Sealed</Badge>
      <Badge className="border-destructive bg-destructive" textClassName="text-on-accent">
        Failed
      </Badge>
    </div>
  );
}
