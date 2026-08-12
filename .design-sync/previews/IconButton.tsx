import { IconButton, Text } from "@lrnki/learner-app";

const row: React.CSSProperties = { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" };

/** An icon-only target. `accessibilityLabel` is REQUIRED — it is the only name a screen
 * reader has. The learner app passes lucide-react-native icons coloured from the token
 * palette; any element works. */
export function Variants() {
  return (
    <div style={row}>
      <IconButton icon={<Text color="ink">☰</Text>} accessibilityLabel="Menu" onPress={() => {}} />
      <IconButton
        icon={<Text color="on-accent">＋</Text>}
        accessibilityLabel="Add a Support Path"
        variant="primary"
        onPress={() => {}}
      />
      <IconButton
        icon={<Text color="ink">✕</Text>}
        accessibilityLabel="Close"
        variant="bare"
        onPress={() => {}}
      />
    </div>
  );
}

/** `expanded` announces disclosure state (aria-expanded) for a toggle; `busy` and
 * `disabled` keep the surface still and stop the action and its haptic. */
export function States() {
  const cell: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, alignItems: "center" };
  return (
    <div style={row}>
      <div style={cell}>
        <IconButton
          icon={<Text color="ink">⌄</Text>}
          accessibilityLabel="Show leg details"
          expanded={false}
          onPress={() => {}}
        />
        <Text variant="caption">collapsed</Text>
      </div>
      <div style={cell}>
        <IconButton
          icon={<Text color="ink">⌃</Text>}
          accessibilityLabel="Hide leg details"
          expanded
          onPress={() => {}}
        />
        <Text variant="caption">expanded</Text>
      </div>
      <div style={cell}>
        <IconButton icon={<Text color="ink">＋</Text>} accessibilityLabel="Adding a Support Path" busy onPress={() => {}} />
        <Text variant="caption">busy</Text>
      </div>
      <div style={cell}>
        <IconButton icon={<Text color="ink">＋</Text>} accessibilityLabel="Unavailable" disabled onPress={() => {}} />
        <Text variant="caption">disabled</Text>
      </div>
    </div>
  );
}
