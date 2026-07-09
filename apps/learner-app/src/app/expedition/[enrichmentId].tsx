import { useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { CheckpointPath, type TrailScrollHandle } from "@/components/CheckpointPath";
import { QuestHeader } from "@/components/QuestHeader";
import { buildTrailView } from "@/learn/trailView";
import { expeditionQuery } from "@/lib/queries";

// The expedition trail screen. Data comes prefetched/cached by Query before the sheet
// opens (R6): the whole study session is one read, so the activity loop never spins.
export default function ExpeditionPage() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { enrichmentId } = useLocalSearchParams<{ enrichmentId: string }>();
  const expedition = useQuery(expeditionQuery(enrichmentId));
  const scrollHandleRef = useRef<TrailScrollHandle | null>(null);

  const goHome = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  if (expedition.isPending) return null;
  if (!expedition.data) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background p-4" style={{ paddingTop: insets.top }}>
        <Text className="text-sm text-muted">This expedition is not available.</Text>
        <BackButton onPress={goHome} />
      </View>
    );
  }

  const { session, expedition: row } = expedition.data;
  const trail = buildTrailView(session);

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="border-b border-line bg-card px-4 py-2">
        <BackButton onPress={goHome} />
      </View>
      <QuestHeader
        session={session}
        trail={trail}
        expeditionTitle={row?.title ?? null}
        onJumpToSection={(sectionIndex) => scrollHandleRef.current?.scrollToSection(sectionIndex)}
      />
      <CheckpointPath view={trail} session={session} scrollHandleRef={scrollHandleRef} />
    </View>
  );
}

function BackButton({ onPress }: Readonly<{ onPress: () => void }>) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center gap-1.5 self-start rounded-xl border border-line bg-card px-3 py-1.5 active:opacity-80"
    >
      <ArrowLeft size={14} color="#241f18" />
      <Text className="text-xs font-medium text-ink">Expeditions</Text>
    </Pressable>
  );
}
