import { Badge, Button, DialogBody, DialogFooter, OverlayHeader, SideSheet, Text } from "@lrnki/learner-app";

/** The sheet that enters from the side — used for a Support Path detour, where the
 * learner steps off the main trail and comes back to the same place. Same header /
 * body / footer parts as `Dialog` and `BottomSheet`. */
export function SupportPath() {
  return (
    <SideSheet open onOpenChange={() => {}}>
      <OverlayHeader
        icon={<Text color="ink">✦</Text>}
        iconTone="frontier"
        title="Support Path"
        description="“subduction”"
        onClose={() => {}}
      />
      <DialogBody>
        <Badge>Generated</Badge>
        <Text variant="title">Where one plate sinks beneath another</Text>
        <Text variant="body">
          Subduction drives water into the mantle wedge, which lowers the melting point of
          the rock above it. The melt that results is richer in both volatiles and silica
          than the melt beneath a mid-ocean ridge.
        </Text>
        <Text variant="body" color="muted">
          Two steps remain on this detour.
        </Text>
      </DialogBody>
      <DialogFooter>
        <Button label="Next step" onPress={() => {}} />
        <Button label="Return to the trail" variant="outline" onPress={() => {}} />
      </DialogFooter>
    </SideSheet>
  );
}
