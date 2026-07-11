import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Lock, Swords } from "lucide-react-native";
import { learnerTerm } from "@/learn/vocabulary";
import { duelSetupQuery } from "@/lib/queries";
import { Button, Card, Text, colors } from "@/ui";

// The Crystal Duel's journal entry (plan 2026-07-10-001 U4): the locked state shows the
// unlock-progress copy — itself an advance-visible long-horizon goal — and the unlocked
// state starts the duel. The card stays even with the journal menu restored (R11): it is
// the unlock-goal communication on the journal itself.
export function DuelEntryCard() {
  const router = useRouter();
  const setup = useQuery(duelSetupQuery);
  if (!setup.data) return null;

  if (!setup.data.unlocked) {
    return (
      <Card className="gap-2">
        <View className="flex-row items-center gap-2">
          <Lock size={16} color={colors.ink} />
          <Text variant="title">{learnerTerm("duelLockedTitle")}</Text>
        </View>
        <Text variant="caption" color="muted">{learnerTerm("duelTagline")}</Text>
        <Text variant="label" color="muted">
          {learnerTerm("duelLockedProgress")
            .replace("{have}", String(setup.data.duelReadyCrystalCount))
            .replace("{need}", String(setup.data.requiredCrystals))}
        </Text>
      </Card>
    );
  }

  return (
    <Card className="gap-3">
      <View className="flex-row items-center gap-2">
        <Swords size={16} color={colors.ink} />
        <Text variant="title">{learnerTerm("duelEntry")}</Text>
      </View>
      <Text variant="caption" color="muted">{learnerTerm("duelTagline")}</Text>
      <Button onPress={() => router.push("/duel")} label={learnerTerm("duelStart")} />
    </Card>
  );
}
