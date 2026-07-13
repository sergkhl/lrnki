import { Swords } from "lucide-react-native";
import { Button, Dialog, DialogBody, DialogFooter, OverlayHeader, Text, colors } from "@/ui";
import { learnerTerm } from "@/learn/vocabulary";

// The one-time Crystal Duel unlock celebration (R13): entering the arena and dismissing
// both mark the event seen; the coordinator owns that write and the navigation.
export function DuelUnlockDialog({
  open,
  onOpenChange,
  onEnterDuel
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void; onEnterDuel: () => void }>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <OverlayHeader
        icon={<Swords size={20} color={colors.ink} />}
        title={learnerTerm("duelUnlockTitle")}
        onClose={() => onOpenChange(false)}
      />
      <DialogBody>
        <Text variant="label" color="muted" className="font-normal">{learnerTerm("duelUnlockBody")}</Text>
      </DialogBody>
      <DialogFooter>
        <Button label={learnerTerm("duelStart")} haptic="unlock" onPress={onEnterDuel} />
        <Button variant="outline" label={learnerTerm("splashDismiss")} onPress={() => onOpenChange(false)} />
      </DialogFooter>
    </Dialog>
  );
}
