import { View } from "react-native";
import { CheckCircle2, Compass, GitBranchPlus, RefreshCw, TriangleAlert } from "lucide-react-native";
import type { ScaffoldDetourView, ScaffoldGeneratingPhase } from "@lrnki/application/projection";
import { Button, Dialog, DialogBody, DialogFooter, OverlayHeader, Progress, Text, colors } from "@/ui";
import { learnerTerm, scaffoldPhaseCopy } from "@/learn/vocabulary";

// The ONE compact state-aware Support Path dialog (plan 2026-07-13-002 U3, KTD5; R9-R11).
// Every highlighted-term or panel tap opens this dialog; it renders available, requesting,
// generating, failed, and ready states and NEVER renders generated lesson content — ready
// offers `Open support path` / `Keep exploring` and nothing opens automatically (R10).
// It uses the shared bounded anatomy (fixed header, shrinkable DialogBody, reachable
// DialogFooter, KTD9) so no action can be clipped at constrained heights (AE5). The
// caller owns state: a nested instance derives it from the projected term support, the
// root instance from the detour view — the dialog itself holds no request policy.
export type SupportPathDialogState =
  | { kind: "available" }
  | { kind: "requesting" }
  | { kind: "generating"; phase: ScaffoldGeneratingPhase | null }
  | { kind: "failed" }
  | { kind: "ready"; complete: boolean };

// The root instance's state comes from the DURABLE detour's projected status, so a request
// that restored an already-ready detour opens ready actions immediately — it never flashes
// or waits in generating state. An undefined detour (projection not refreshed yet) shows
// broad progress until polling lands.
export function dialogStateForDetour(detour: ScaffoldDetourView | undefined): SupportPathDialogState {
  if (detour === undefined) return { kind: "generating", phase: null };
  if (detour.status === "ready") return { kind: "ready", complete: detour.complete };
  if (detour.status === "failed") return { kind: "failed" };
  return { kind: "generating", phase: detour.phase };
}

export function SupportPathDialog({
  open,
  onOpenChange,
  term,
  state,
  error,
  onRequest,
  onRetry,
  onDismiss,
  onOpenPath
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  term: string;
  state: SupportPathDialogState;
  // A refused/failed request surfaces retryable copy in place (R9); the dialog stays open.
  error?: string | null;
  onRequest?: () => void;
  onRetry?: () => void;
  onDismiss?: () => void;
  onOpenPath?: () => void;
}>) {
  const requesting = state.kind === "requesting";
  const close = () => onOpenChange(false);

  const icon =
    state.kind === "ready" ? (
      <CheckCircle2 size={20} color={colors.ink} />
    ) : state.kind === "failed" ? (
      <TriangleAlert size={20} color={colors.ink} />
    ) : state.kind === "generating" ? (
      <Compass size={20} color={colors.ink} />
    ) : (
      <GitBranchPlus size={20} color={colors.ink} />
    );
  const title =
    state.kind === "ready"
      ? learnerTerm("supportReadyTitle")
      : state.kind === "failed"
        ? learnerTerm("supportFailedTitle")
        : state.kind === "generating"
          ? learnerTerm("supportPreparingTitle")
          : learnerTerm("supportPanelTitle");

  return (
    <Dialog open={open} onOpenChange={onOpenChange} dismissBlocked={requesting}>
      <OverlayHeader
        icon={icon}
        iconTone={state.kind === "failed" ? "soft" : "frontier"}
        title={title}
        description={`“${term}”`}
        onClose={close}
        closeDisabled={requesting}
      />
      <DialogBody>
        {state.kind === "available" || state.kind === "requesting" ? (
          <Text variant="body" color="muted">{learnerTerm("supportAvailableBody")}</Text>
        ) : state.kind === "generating" ? (
          <View className="gap-3" accessibilityLiveRegion="polite">
            <Progress fraction={null} accessibilityLabel={learnerTerm("supportPreparingTitle")} />
            <Text variant="label" color="muted" className="font-normal">{scaffoldPhaseCopy(state.phase)}</Text>
            <Text variant="label" color="muted" className="font-normal">{learnerTerm("supportGeneratingBody")}</Text>
          </View>
        ) : state.kind === "failed" ? (
          <Text variant="body" color="muted">{learnerTerm("supportFailedBody")}</Text>
        ) : (
          <Text variant="body" color="muted">{learnerTerm("supportReadyBody")}</Text>
        )}
        {error ? (
          <Text variant="label" color="destructive" className="font-normal">{error}</Text>
        ) : null}
      </DialogBody>
      <DialogFooter>
        {state.kind === "available" || state.kind === "requesting" ? (
          <>
            <Button busy={requesting} onPress={() => onRequest?.()} label={learnerTerm("supportAddAction")} testID="support-path-request" />
            <Button variant="outline" disabled={requesting} onPress={close} label={learnerTerm("supportProgressClose")} />
          </>
        ) : state.kind === "generating" ? (
          <Button variant="outline" onPress={close} label={learnerTerm("supportProgressClose")} />
        ) : state.kind === "failed" ? (
          <>
            <Button onPress={() => onRetry?.()} icon={<RefreshCw size={14} color={colors["on-accent"]} />} label={learnerTerm("supportRetry")} testID="support-path-retry" />
            <Button variant="outline" onPress={() => onDismiss?.()} label={learnerTerm("supportDismiss")} />
          </>
        ) : (
          <>
            <Button onPress={() => onOpenPath?.()} label={learnerTerm("supportOpenAction")} testID="support-path-open" />
            <Button variant="outline" onPress={close} label={learnerTerm("supportProgressClose")} />
          </>
        )}
      </DialogFooter>
    </Dialog>
  );
}
