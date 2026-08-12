import { OverlayHeader, Text } from "@lrnki/learner-app";

const col: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 16, width: 460 };

/** Every overlay in the system opens with this header: an icon in a tone chip, the
 * title, an optional description, and the close control. It is the first child of a
 * `Dialog`, `SideSheet`, `BottomSheet` or `FullScreenDialog` — never used alone in the app. */
export function Tones() {
  return (
    <div style={col}>
      <OverlayHeader
        icon={<Text color="ink">✦</Text>}
        iconTone="soft"
        title="Field notes"
        description="Checkpoint 2 of 4"
        onClose={() => {}}
      />
      <OverlayHeader
        icon={<Text color="on-accent">✦</Text>}
        iconTone="solid"
        title="Leg sealed"
        description="Magma and melt"
        onClose={() => {}}
      />
      <OverlayHeader
        icon={<Text color="ink">✦</Text>}
        iconTone="frontier"
        title="Add a Support Path?"
        description="“magma viscosity”"
        onClose={() => {}}
      />
    </div>
  );
}

/** Without `onClose` the header renders no close control — for overlays dismissed
 * some other way. `closeDisabled` keeps the control visible but inert while a
 * mutation is in flight. */
export function CloseControl() {
  return (
    <div style={col}>
      <OverlayHeader icon={<Text color="ink">✦</Text>} title="No close control" />
      <OverlayHeader
        icon={<Text color="ink">✦</Text>}
        title="Preparing your Support Path"
        description="“subduction”"
        onClose={() => {}}
        closeDisabled
      />
    </div>
  );
}
