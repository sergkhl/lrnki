import { useState } from "react";
import { View } from "react-native";
import { Lock, ShieldQuestion, Swords, Trophy } from "lucide-react-native";
import type { RecallScopeStatus } from "@lrnki/application/projection";
import { PressableSurface, Text, colors } from "@/ui";
import { learnerTerm } from "@/learn/vocabulary";

// The persistent Guardian node on the trail (plan 2026-07-13-003 U6, F5-F6): one compact
// entry per Leg scope (rendered after the Leg's last concept) and one at the summit. State
// comes ONLY from the server-projected scope — availability, the active challenge id, and
// the permanent first-win identity — so the client formats but never decides fusion or
// unlocks (KTD3). State reads as icon shape plus text, never color alone.
export function GuardianTrailNode({
  scope,
  sectionComplete,
  onEnter
}: Readonly<{
  scope: RecallScopeStatus;
  // For a Leg scope: whether every concept in the Leg is mastered. A zero-item Leg surfaces
  // its explicit unavailability only once the Leg is otherwise finished (AE6) — before that
  // the ordinary trail is the guidance.
  sectionComplete: boolean;
  onEnter: (scope: RecallScopeStatus) => Promise<void>;
}>) {
  const [entering, setEntering] = useState(false);
  const summit = scope.scopeKind === "enrichment";
  const title = summit ? learnerTerm("guardianSummitTitle") : learnerTerm("guardianTitle");

  if (scope.state === "unavailable" && !sectionComplete) return null;

  const enter = () => {
    if (entering) return;
    setEntering(true);
    void onEnter(scope).finally(() => setEntering(false));
  };

  const presentation =
    scope.state === "won"
      ? { icon: <Trophy size={18} color={colors.award} />, border: "border-gem", subline: `${learnerTerm("guardianNodeWon")} · ${learnerTerm("guardianRematch")}`, disabled: false }
      : scope.state === "active"
        ? { icon: <Swords size={18} color={colors.ink} />, border: "border-frontier", subline: learnerTerm("guardianResume"), disabled: false }
        : scope.state === "available"
          ? { icon: <Swords size={18} color={colors.ink} />, border: "border-map-ink", subline: learnerTerm("guardianFace"), disabled: false }
          : scope.state === "locked"
            ? { icon: <Lock size={18} color={colors.fog} />, border: "border-map-ink-soft", subline: learnerTerm("guardianSummitLocked"), disabled: true }
            : { icon: <ShieldQuestion size={18} color={colors.fog} />, border: "border-map-ink-soft", subline: learnerTerm("guardianUnavailable"), disabled: true };

  return (
    <View className="items-center">
      <PressableSurface
        accessibilityLabel={`${title}: ${scope.anchorLabel}. ${presentation.subline}`}
        disabled={presentation.disabled}
        busy={entering}
        haptic="selection"
        onPress={enter}
        className={`min-h-target max-w-[260px] flex-row items-center gap-2 rounded-card border-2 ${presentation.border} bg-card px-3 py-2 ${presentation.disabled ? "opacity-70" : ""}`}
        pressedClassName="bg-muted-panel"
        testID={`guardian-node-${scope.anchorDerivedNodeId}`}
      >
        {presentation.icon}
        <View className="min-w-0 shrink">
          <Text variant="label" numberOfLines={1} className="font-semibold">{title}</Text>
          <Text variant="caption" color="muted" numberOfLines={2}>{presentation.subline}</Text>
        </View>
      </PressableSurface>
    </View>
  );
}
