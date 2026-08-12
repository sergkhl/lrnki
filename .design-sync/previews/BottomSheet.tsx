import { BottomSheet, Button, DialogBody, DialogFooter, OverlayHeader, Text } from "@lrnki/learner-app";

/** The sheet that rises from the bottom edge — the learner app's default overlay for
 * anything that belongs to the current surface rather than interrupting it (a checkpoint's
 * field notes, the learner menu). It takes the same header / body / footer parts as
 * `Dialog`, so switching between the two is a one-line change. */
export function FieldNotes() {
  return (
    <BottomSheet open onOpenChange={() => {}}>
      <OverlayHeader
        icon={<Text color="ink">✦</Text>}
        title="Field notes"
        description="Checkpoint 2 of 4 · Magma and melt"
        onClose={() => {}}
      />
      <DialogBody>
        <Text variant="body">
          A silica-rich melt resists flow, so pressure accumulates until the conduit fails.
          A basaltic melt drains steadily and erupts far more quietly.
        </Text>
        <Text variant="body" color="muted">
          You sealed this checkpoint three days ago.
        </Text>
      </DialogBody>
      <DialogFooter>
        <Button label="Back to the trail" variant="outline" onPress={() => {}} />
      </DialogFooter>
    </BottomSheet>
  );
}

/** With `dismissBlocked` the sheet stays mounted through a pending mutation: the close
 * control is disabled and a backdrop press will not dismiss it. */
export function Blocked() {
  return (
    <BottomSheet open dismissBlocked onOpenChange={() => {}}>
      <OverlayHeader
        icon={<Text color="ink">✦</Text>}
        title="Sealing this leg"
        description="Magma and melt"
        onClose={() => {}}
        closeDisabled
      />
      <DialogBody>
        <Text variant="body" color="muted">
          Recording your formation. This takes a moment and must not be interrupted.
        </Text>
      </DialogBody>
    </BottomSheet>
  );
}
