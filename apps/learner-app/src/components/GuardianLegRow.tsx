import { useState } from "react";
import { View } from "react-native";
import { Lock, ShieldQuestion, Swords, Trophy } from "lucide-react-native";
import type { RecallScopeStatus } from "@lrnki/application/projection";
import { PressableSurface, Text, colors } from "@/ui";
import { guardianScopeCopy } from "@/learn/vocabulary";

// The per-Leg Guardian affordance INSIDE its cavern panel (plan 2026-07-30-001 U4, KTD9). One
// singular global CTA would be dishonest: disjoint Legs are simultaneously available, so each
// panel offers its own Guardian or says plainly why it cannot.
//
// This is a cavern restyle of `GuardianTrailNode`'s semantics, not a second rule — both read the
// same server-projected scope through the same `guardianScopeCopy` mapping, so availability, the
// active challenge, and the permanent first win can never diverge between the trail and the
// formation.
export function GuardianLegRow({
  scope,
  sectionComplete,
  onEnter
}: Readonly<{
  scope: RecallScopeStatus;
  // A zero-item Leg surfaces its explicit unavailability only once the Leg is otherwise
  // finished; before that the ordinary trail is the guidance.
  sectionComplete: boolean;
  onEnter: (scope: RecallScopeStatus) => Promise<void>;
}>) {
  const [entering, setEntering] = useState(false);
  const presentation = guardianScopeCopy(scope);

  if (scope.state === "unavailable" && !sectionComplete) return null;

  const enter = () => {
    if (entering) return;
    setEntering(true);
    void onEnter(scope).finally(() => setEntering(false));
  };

  return (
    <PressableSurface
      testID={`cavern-guardian-${scope.anchorDerivedNodeId}`}
      accessibilityLabel={`${presentation.title}: ${scope.anchorLabel}. ${presentation.subline}`}
      disabled={presentation.disabled}
      busy={entering}
      haptic="selection"
      onPress={enter}
      style={{
        marginTop: 10,
        minHeight: 44,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: rowEdge(presentation.icon),
        backgroundColor: colors["cavern-rock"],
        paddingHorizontal: 12,
        paddingVertical: 8,
        opacity: presentation.disabled ? 0.7 : 1
      }}
      pressedClassName="opacity-80"
    >
      <GuardianIcon kind={presentation.icon} />
      <View className="min-w-0 shrink">
        <Text variant="label" color="cavern-ink" numberOfLines={1} className="font-semibold">
          {presentation.title}
        </Text>
        <Text variant="caption" color="cavern-ink" numberOfLines={2} className="opacity-75">
          {presentation.subline}
        </Text>
      </View>
    </PressableSurface>
  );
}

// The earned trophy is the only gold here: an available Guardian is frontier guidance, and the
// inert states stay fog. Shape carries the state as much as colour does.
function GuardianIcon({ kind }: Readonly<{ kind: "won" | "resume" | "face" | "locked" | "unavailable" }>) {
  if (kind === "won") return <Trophy size={18} color={colors["gold-ink"]} />;
  if (kind === "locked") return <Lock size={18} color={colors.fog} />;
  if (kind === "unavailable") return <ShieldQuestion size={18} color={colors.fog} />;
  return <Swords size={18} color={kind === "resume" ? colors.frontier : colors["cavern-ink"]} />;
}

function rowEdge(kind: "won" | "resume" | "face" | "locked" | "unavailable"): string {
  if (kind === "won") return colors["gold-ink"];
  if (kind === "resume" || kind === "face") return colors.frontier;
  return colors["cavern-edge"];
}
