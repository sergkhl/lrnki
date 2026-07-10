import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Lock, Swords } from "lucide-react-native";
import { learnerTerm } from "@/learn/vocabulary";
import { duelSetupQuery } from "@/lib/queries";
import { Btn, Card, CardDescription, CardTitle } from "./ui";

// The Crystal Duel's journal entry (plan 2026-07-10-001 U4): the locked state shows the
// unlock-progress copy — itself an advance-visible long-horizon goal — and the unlocked
// state starts the duel. The unlock splash stays deferred with the other splashes.
export function DuelEntryCard() {
  const router = useRouter();
  const setup = useQuery(duelSetupQuery);
  if (!setup.data) return null;

  if (!setup.data.unlocked) {
    return (
      <Card className="gap-2">
        <View className="flex-row items-center gap-2">
          <Lock size={16} color="#241f18" />
          <CardTitle>{learnerTerm("duelLockedTitle")}</CardTitle>
        </View>
        <CardDescription>{learnerTerm("duelTagline")}</CardDescription>
        <Text className="text-sm text-muted">
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
        <Swords size={16} color="#241f18" />
        <CardTitle>{learnerTerm("duelEntry")}</CardTitle>
      </View>
      <CardDescription>{learnerTerm("duelTagline")}</CardDescription>
      <Btn onPress={() => router.push("/duel")} label={learnerTerm("duelStart")} />
    </Card>
  );
}
