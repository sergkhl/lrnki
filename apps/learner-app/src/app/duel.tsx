import { useMemo } from "react";
import { ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ArrowLeft, Lock } from "lucide-react-native";
import { DUEL_QUESTION_COUNT } from "@lrnki/application/projection";
import { rivalSeed } from "@lrnki/learner-api/rival-simulation";
import { DuelScreen, type DuelQuestion } from "@/components/DuelScreen";
import { Button, Card, Screen, Text, buttonIconColor, colors } from "@/ui";
import { learnerTerm } from "@/learn/vocabulary";
import { duelSetupQuery } from "@/lib/queries";

// Person-first rival names for a duel with no live opponent (KTD1 spirit): seeded from the
// duelId so the name is stable within one duel and needs no faker dependency.
const RIVAL_NAMES = [
  "Maya", "Jonas", "Priya", "Theo", "Lena", "Marcus", "Ines", "Viktor",
  "Sofia", "Emil", "Noor", "Casper", "Aline", "Dmitri", "Greta", "Owen"
] as const;

// Draw N distinct questions from the eligible pool (session-only; a fresh draw each duel).
function drawQuestions<T>(pool: T[], count: number): T[] {
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

function makeDuelId(): string {
  return `duel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// The Crystal Duel route (plan 2026-07-10-001 U4): a locked card with the unlock-progress
// copy, or one duel per mount over the live duel-setup read.
export default function DuelPage() {
  const router = useRouter();
  const setup = useQuery(duelSetupQuery);

  // One duel per mount: the id, seeded rival name, and question draw are fixed the moment
  // the pool arrives.
  const duel = useMemo(() => {
    if (!setup.data?.unlocked) return null;
    const duelId = makeDuelId();
    const rivalName = RIVAL_NAMES[rivalSeed(duelId) % RIVAL_NAMES.length];
    const questions: DuelQuestion[] = drawQuestions(setup.data.pool, DUEL_QUESTION_COUNT).map((item) => ({
      view: item.view,
      band: item.band
    }));
    return { duelId, rivalName, questions };
  }, [setup.data]);

  const goHome = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  if (setup.isPending) return null;

  return (
    <Screen>
      <View className="border-b border-line bg-card px-4 py-2">
        <Button
          variant="outline"
          size="compact"
          onPress={goHome}
          icon={<ArrowLeft size={14} color={buttonIconColor("outline")} />}
          label={learnerTerm("returnToTrail")}
          className="self-start"
        />
      </View>
      <ScrollView contentContainerClassName="mx-auto w-full max-w-lg gap-4 p-4">
        {duel ? (
          <DuelScreen duelId={duel.duelId} rivalName={duel.rivalName} questions={duel.questions} />
        ) : (
          <Card className="gap-3">
            <View className="flex-row items-center gap-2">
              <Lock size={18} color={colors.ink} />
              <Text variant="title">{learnerTerm("duelLockedTitle")}</Text>
            </View>
            <Text variant="caption" color="muted">{learnerTerm("duelTagline")}</Text>
            <Text variant="label" color="muted">
              {learnerTerm("duelLockedProgress")
                .replace("{have}", String(setup.data?.duelReadyCrystalCount ?? 0))
                .replace("{need}", String(setup.data?.requiredCrystals ?? 6))}
            </Text>
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}
