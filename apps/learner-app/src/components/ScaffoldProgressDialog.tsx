import { View } from "react-native";
import { CheckCircle2, Compass, TriangleAlert } from "lucide-react-native";
import type { ScaffoldDetourView } from "@lrnki/application/projection";
import { Button, Dialog, OverlayHeader, Progress, Text, colors } from "@/ui";
import { learnerTerm, scaffoldPhaseCopy } from "@/learn/vocabulary";

// The root-owned Scaffold Detour progress dialog (plan 2026-07-12-002 U6, KTD11, R15/R17). Opened
// on a determinate create; shows ONE indeterminate bar and a broad, themed phase sentence while the
// learner may close it and continue elsewhere — the durable detour keeps generating regardless.
// When polling turns the detour `ready`/`failed` the copy reflects it in place; there is NO
// auto-open, toast, or haptic (R17) — the trail placeholder unfolds separately. Reduced motion is
// handled by the shared `Progress` sweep and the dialog's own entrance.
export function ScaffoldProgressDialog({
  detour,
  open,
  onOpenChange
}: Readonly<{
  detour: ScaffoldDetourView | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  // The detour can vanish from the active set (hidden) or not be loaded yet; treat as generating.
  const status = detour?.status ?? "generating";
  const ready = status === "ready";
  const failed = status === "failed";

  const icon = ready ? (
    <CheckCircle2 size={20} color={colors.ink} />
  ) : failed ? (
    <TriangleAlert size={20} color={colors.ink} />
  ) : (
    <Compass size={20} color={colors.ink} />
  );
  const title = ready ? learnerTerm("supportReadyTitle") : failed ? learnerTerm("supportFailedTitle") : learnerTerm("supportPreparingTitle");
  const description = detour ? `“${detour.term}”` : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <OverlayHeader icon={icon} iconTone={failed ? "soft" : "frontier"} title={title} description={description} onClose={() => onOpenChange(false)} />
      <View className="gap-4 p-4">
        {ready ? (
          <Text variant="body" color="muted">{learnerTerm("supportReadyBody")}</Text>
        ) : failed ? (
          <Text variant="body" color="muted">{learnerTerm("supportFailedBody")}</Text>
        ) : (
          <View className="gap-3" accessibilityLiveRegion="polite">
            <Progress fraction={null} accessibilityLabel={learnerTerm("supportPreparingTitle")} />
            <Text variant="label" color="muted" className="font-normal">{scaffoldPhaseCopy(detour?.phase ?? null)}</Text>
          </View>
        )}
        <Button variant={ready ? "primary" : "outline"} onPress={() => onOpenChange(false)} label={learnerTerm("supportProgressClose")} />
      </View>
    </Dialog>
  );
}
