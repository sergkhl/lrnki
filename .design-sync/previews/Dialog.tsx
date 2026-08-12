import { Button, Dialog, DialogBody, DialogFooter, OverlayHeader, Progress, Text } from "@lrnki/learner-app";

/** The centered adaptive dialog. A dialog is always the same four parts in this order:
 * `OverlayHeader` (icon, title, close), `DialogBody` (scrolls when the viewport cap
 * bites), then `DialogFooter` (actions). Close, Escape and backdrop press all honor
 * `dismissBlocked`. */
export function Confirm() {
  return (
    <Dialog open onOpenChange={() => {}}>
      <OverlayHeader
        icon={<Text color="ink">✦</Text>}
        iconTone="frontier"
        title="Add a Support Path?"
        description="“magma viscosity”"
        onClose={() => {}}
      />
      <DialogBody>
        <Text variant="body" color="muted">
          A Support Path builds a short detour that grounds this term before you return to
          the main trail. It is added to this expedition only.
        </Text>
      </DialogBody>
      <DialogFooter>
        <Button label="Add Support Path" onPress={() => {}} />
        <Button label="Not now" variant="outline" onPress={() => {}} />
      </DialogFooter>
    </Dialog>
  );
}

/** While a mutation is in flight, `dismissBlocked` keeps the dialog mounted: the close
 * control is disabled, and Escape and backdrop press stop closing it. */
export function Working() {
  return (
    <Dialog open dismissBlocked onOpenChange={() => {}}>
      <OverlayHeader
        icon={<Text color="ink">✦</Text>}
        iconTone="frontier"
        title="Preparing your Support Path"
        description="“subduction”"
        onClose={() => {}}
        closeDisabled
      />
      <DialogBody>
        <Progress fraction={null} accessibilityLabel="Preparing your Support Path" />
        <Text variant="label" color="muted" className="font-normal">
          Grounding the term against your sources.
        </Text>
      </DialogBody>
      <DialogFooter>
        <Button label="Close" variant="outline" onPress={() => {}} />
      </DialogFooter>
    </Dialog>
  );
}

/** A failed state keeps the same shape — only the tone, copy and actions change. */
export function Failed() {
  return (
    <Dialog open onOpenChange={() => {}}>
      <OverlayHeader
        icon={<Text color="ink">!</Text>}
        iconTone="soft"
        title="That Support Path could not be built"
        description="“ssthresh”"
        onClose={() => {}}
      />
      <DialogBody>
        <Text variant="body" color="muted">
          Nothing in your sources grounds this term well enough yet. You can try again, or
          carry on and revisit it later.
        </Text>
        <Text variant="label" color="destructive" className="font-normal">
          No grounded passage found.
        </Text>
      </DialogBody>
      <DialogFooter>
        <Button label="Try again" onPress={() => {}} />
        <Button label="Dismiss" variant="outline" onPress={() => {}} />
      </DialogFooter>
    </Dialog>
  );
}
