import { useState } from "react";
import { View } from "react-native";
import { Lock, ShieldQuestion, Swords, Trophy } from "lucide-react-native";
import type { RecallScopeStatus } from "@lrnki/application/projection";
import { PressableSurface, Text, colors } from "@/ui";
import { recallScopeKey } from "@/lib/guardianEntry";
import { guardianScopeCopy } from "@/learn/vocabulary";

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
  // The state → copy/shape/inertness mapping is shared with the cavern panel row (KTD9), so the
  // trail and the formation can never disagree about a scope.
  const { title, subline, icon, disabled } = guardianScopeCopy(scope);

  if (scope.state === "unavailable" && !sectionComplete) return null;

  const enter = () => {
    if (entering) return;
    setEntering(true);
    void onEnter(scope).finally(() => setEntering(false));
  };

  const presentation = {
    icon:
      icon === "won" ? <Trophy size={18} color={colors.award} />
      : icon === "locked" ? <Lock size={18} color={colors.fog} />
      : icon === "unavailable" ? <ShieldQuestion size={18} color={colors.fog} />
      : <Swords size={18} color={colors.ink} />,
    border:
      icon === "won" ? "border-gem"
      : icon === "resume" ? "border-frontier"
      : icon === "face" ? "border-map-ink"
      : "border-map-ink-soft",
    subline,
    disabled
  };

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
        // Keyed by scope identity, not by anchor: the summit's anchor IS the last Leg's
        // milestone, so an anchor-only id renders two different Guardians under one id.
        testID={`guardian-node-${recallScopeKey(scope)}`}
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
