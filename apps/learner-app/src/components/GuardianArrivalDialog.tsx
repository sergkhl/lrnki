import { Swords } from "lucide-react-native";
import type { RecallScopeStatus } from "@lrnki/application/projection";
import { Button, Dialog, DialogBody, DialogFooter, OverlayHeader, Text, colors } from "@/ui";
import { learnerTerm } from "@/learn/vocabulary";

// The Guardian arrival offer (plan 2026-07-13-003 U6, F1): shown once per scope after its
// Leg completes (or the summit unlocks), WITHOUT blocking the trail — "Return to trail"
// simply dismisses, and the persistent Guardian node remains the durable entry. The offer
// acknowledgement lives in device memory only; the scope state itself is server-owned.
export function GuardianArrivalDialog({
  scope,
  open,
  onFace,
  onDismiss
}: Readonly<{
  scope: RecallScopeStatus | null;
  open: boolean;
  onFace: () => void;
  onDismiss: () => void;
}>) {
  const summit = scope?.scopeKind === "enrichment";
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onDismiss(); }}>
      <OverlayHeader
        icon={<Swords size={20} color={colors.ink} />}
        iconTone="frontier"
        title={learnerTerm("guardianArrivalTitle")}
        description={scope?.anchorLabel ?? null}
        onClose={onDismiss}
      />
      <DialogBody>
        <Text variant="label" color="muted" className="font-normal">
          {summit ? learnerTerm("guardianArrivalSummitBody") : learnerTerm("guardianArrivalBody")}
        </Text>
      </DialogBody>
      <DialogFooter>
        <Button variant="primary" onPress={onFace} label={learnerTerm("guardianFace")} />
        <Button variant="outline" onPress={onDismiss} label={learnerTerm("guardianArrivalLater")} />
      </DialogFooter>
    </Dialog>
  );
}
