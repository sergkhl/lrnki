import { Badge, Button, Card, Progress, Text } from "@lrnki/learner-app";

const col: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 12, maxWidth: 420 };

/** The one surface for grouped content: cream card on the parchment ground, a hairline
 * line border, and the flat 8 px card radius. Cards stay flat — elevation is not part
 * of this system. */
export function Basic() {
  return (
    <div style={col}>
      <Card className="gap-2 p-4">
        <Text variant="title">Magma and melt</Text>
        <Text variant="body" color="muted">
          Four checkpoints, two of them sealed. The Guardian waits at the leg&apos;s end.
        </Text>
      </Card>
    </div>
  );
}

/** A card carrying progress — the pattern behind expedition legs and section rows. */
export function WithProgress() {
  return (
    <div style={col}>
      <Card className="gap-3 p-4">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <Text variant="title">Leg 2 · Magma and melt</Text>
          <Badge>2 of 4</Badge>
        </div>
        <Progress fraction={0.5} accessibilityLabel="Leg 2 progress" />
        <Text variant="caption">Two checkpoints remain before the Guardian.</Text>
      </Card>
    </div>
  );
}

/** A card ending in an action. Actions sit last and full-width on narrow surfaces. */
export function WithAction() {
  return (
    <div style={col}>
      <Card className="gap-3 p-4">
        <Text variant="title">Volcanic hazards</Text>
        <Text variant="body" color="muted">
          A new expedition drawn from three of your sources. Nothing is generated until you
          set out.
        </Text>
        <Badge className="border-gem-soft bg-gem-soft">Earth science</Badge>
        <Button label="Set out" onPress={() => {}} />
      </Card>
    </div>
  );
}
