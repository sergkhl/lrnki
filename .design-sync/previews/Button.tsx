import { Button, Text } from "@lrnki/learner-app";

const row: React.CSSProperties = { display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" };
const col: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" };

/** The four variants. `primary` is the single forward action on a surface; `secondary`
 * carries the gem tone; `outline` is the quiet alternative; `destructive` is rare. */
export function Variants() {
  return (
    <div style={row}>
      <Button label="Set out" onPress={() => {}} />
      <Button label="Examine crystal" variant="secondary" onPress={() => {}} />
      <Button label="Not now" variant="outline" onPress={() => {}} />
      <Button label="Abandon expedition" variant="destructive" onPress={() => {}} />
    </div>
  );
}

/** `compact` is for dense rows (checkpoint sheets, leg lists); `default` keeps the
 * 48 px control height the touch tokens set. */
export function Sizes() {
  return (
    <div style={row}>
      <Button label="Continue expedition" onPress={() => {}} />
      <Button label="Continue" size="compact" onPress={() => {}} />
    </div>
  );
}

/** `busy` hides the label but keeps its FOOTPRINT — the button never resizes mid-action —
 * and overlays a spinner; the accessible name still reads the label. `disabled` dims the
 * surface to 50% and never fires the action or its haptic. Neither state animates. */
export function States() {
  const cell: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" };
  return (
    <div style={row}>
      <div style={cell}>
        <Button label="Seal this leg" onPress={() => {}} />
        <Text variant="caption">idle</Text>
      </div>
      <div style={cell}>
        <Button label="Seal this leg" busy onPress={() => {}} />
        <Text variant="caption">busy — same width, label hidden</Text>
      </div>
      <div style={cell}>
        <Button label="Best the Guardian" disabled onPress={() => {}} />
        <Text variant="caption">disabled</Text>
      </div>
    </div>
  );
}

/** An icon sits before the label. Any element works; the learner app passes
 * lucide-react-native icons sized to the button. */
export function WithIcon() {
  return (
    <div style={col}>
      <Button label="Open the vista" icon={<Text color="on-accent">◆</Text>} onPress={() => {}} />
      <Button label="Plan a new expedition" variant="secondary" icon={<Text color="ink">＋</Text>} onPress={() => {}} />
    </div>
  );
}
