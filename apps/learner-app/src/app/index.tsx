import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { BookOpen, Menu as MenuIcon } from "lucide-react-native";

import { ExplorerNameGate } from "@/components/ExplorerNameGate";
import { JournalSplashCoordinator } from "@/components/JournalSplashCoordinator";
import { LeaderboardDialog } from "@/components/LeaderboardDialog";
import { LearnerMenuSheet } from "@/components/LearnerMenuSheet";
import { SignInGate } from "@/components/SignInGate";
import { dispatchLearnerCommand } from "@/lib/actions";
import { journalQuery, leaderboardQuery, meQuery } from "@/lib/queries";
import { logout } from "@/lib/session";
import { commandFeedback, learnerTerm } from "@/learn/vocabulary";
import {
  Badge,
  AuthScreen,
  Button,
  Card,
  IconButton,
  Progress,
  RouteStatus,
  Screen,
  Text,
  colors
} from "@/ui";

export default function JournalPage() {
  const router = useRouter();
  const me = useQuery(meQuery);
  const learner = me.data ?? null;
  const admitted = learner != null && learner.profileComplete;
  const journal = useQuery({ ...journalQuery, enabled: admitted });
  const board = useQuery({ ...leaderboardQuery, enabled: admitted });
  const [menuOpen, setMenuOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [openingKey, setOpeningKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (me.isPending) return <RouteStatus tone="loading" title="Checking your expedition journal…" />;
  if (me.isError) {
    return (
      <RouteStatus
        tone="error"
        title="Your session could not be checked"
        message="The connection failed without changing your sign-in."
        actions={[{ label: "Try again", onPress: () => void me.refetch() }]}
      />
    );
  }
  if (!learner) {
    return (
      <AuthScreen>
        <SignInGate />
      </AuthScreen>
    );
  }
  if (!learner.profileComplete) {
    return (
      <AuthScreen>
        <ExplorerNameGate suggestedName={learner.displayName} />
      </AuthScreen>
    );
  }
  if (journal.isPending) return <RouteStatus tone="loading" title="Opening your expedition journal…" />;
  if (journal.isError || !journal.data) {
    return (
      <RouteStatus
        tone="error"
        title="Your journal is out of reach"
        message="You are still signed in. Check your connection and try again."
        actions={[
          { label: "Try again", onPress: () => void journal.refetch() },
          { label: "Sign out", variant: "outline", onPress: () => void logout() }
        ]}
      />
    );
  }

  const journalView = journal.data.view;
  const openExpedition = async (expeditionKey: string) => {
    setActionError(null);
    if (journalView.activeExpeditionKey === expeditionKey) {
      router.push(`/expedition/${expeditionKey}`);
      return;
    }
    setOpeningKey(expeditionKey);
    try {
      const result = await dispatchLearnerCommand({
        expectedStateVersion: journal.data.stateVersion,
        command: { kind: "activate_expedition", expeditionKey }
      });
      if (result.status === "applied") router.push(`/expedition/${expeditionKey}`);
      else setActionError(commandFeedback(result.status));
    } catch {
      setActionError("The expedition could not be activated. Try again.");
    } finally {
      setOpeningKey(null);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerClassName="mx-auto w-full max-w-3xl gap-4 p-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1 gap-1">
            <Text variant="display">Expedition journal</Text>
            <Text color="muted">Choose a trail, learn deliberately, and test what stays with you.</Text>
          </View>
          <IconButton
            icon={<MenuIcon size={18} color={colors.ink} />}
            accessibilityLabel="Menu"
            onPress={() => setMenuOpen(true)}
          />
        </View>

        {actionError ? (
          <Card className="border-destructive">
            <Text color="destructive">{actionError}</Text>
          </Card>
        ) : null}

        {journalView.expeditions.length === 0 ? (
          <Card className="items-center gap-3 py-8">
            <BookOpen size={28} color={colors.trail} />
            <Text variant="heading">{learnerTerm("beginExpedition")}</Text>
            <Text color="muted" className="text-center">
              {learnerTerm("expeditionReady")}
            </Text>
            <Button label="Browse expeditions" onPress={() => router.push("/catalog")} />
          </Card>
        ) : (
          <View className="gap-3">
            {journalView.expeditions.map((expedition) => {
              const settled = expedition.masteredStopCount + expedition.knownStopCount;
              return (
                <Card key={expedition.expeditionKey} className="gap-3">
                  <View className="flex-row flex-wrap items-start justify-between gap-2">
                    <View className="min-w-0 flex-1 gap-1">
                      <Text variant="heading">{expedition.title}</Text>
                      <Text variant="caption" color="muted">
                        {expedition.masteredStopCount} mastered · {expedition.knownStopCount} marked as known · {expedition.totalStopCount} Stops
                      </Text>
                    </View>
                    {journalView.activeExpeditionKey === expedition.expeditionKey ? <Badge>Active</Badge> : null}
                  </View>
                  <Progress
                    fraction={expedition.totalStopCount === 0 ? 0 : settled / expedition.totalStopCount}
                    accessibilityLabel={`${settled} of ${expedition.totalStopCount} stops settled`}
                  />
                  {expedition.contentChanged ? (
                    <Text color="destructive">{learnerTerm("contentChanged")}</Text>
                  ) : (
                    <Button
                      label={journalView.activeExpeditionKey === expedition.expeditionKey ? "Resume" : "Open expedition"}
                      busy={openingKey === expedition.expeditionKey}
                      disabled={openingKey !== null}
                      onPress={() => void openExpedition(expedition.expeditionKey)}
                    />
                  )}
                </Card>
              );
            })}
            <Button variant="outline" label="Browse all expeditions" onPress={() => router.push("/catalog")} />
          </View>
        )}
      </ScrollView>

      <LearnerMenuSheet
        open={menuOpen}
        onOpenChange={setMenuOpen}
        boardAvailable={board.data != null}
        onOpenBoard={() => setBoardOpen(true)}
        onLogout={() => void logout()}
      />
      {board.data ? (
        <LeaderboardDialog open={boardOpen} onOpenChange={setBoardOpen} board={board.data.view} />
      ) : null}
      <JournalSplashCoordinator
        learnerStateRef={learner.learnerStateRef}
        board={board.isPending ? undefined : board.data?.view ?? null}
      />
    </Screen>
  );
}
