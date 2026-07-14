import { useRef, useState } from "react";
import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { CheckpointPath, type TrailScrollHandle } from "@/components/CheckpointPath";
import { CrystalVista } from "@/components/CrystalVista";
import { QuestHeader } from "@/components/QuestHeader";
import { buildTrailView } from "@lrnki/application/projection";
import { expeditionQuery } from "@/lib/queries";
import { Button, RouteStatus, Screen, buttonIconColor } from "@/ui";
import { learnerTerm } from "@/learn/vocabulary";

// The expedition trail screen. Data comes prefetched/cached by Query before the sheet
// opens (R6): the whole study session is one read, so the activity loop never spins.
export default function ExpeditionPage() {
  const router = useRouter();
  const { enrichmentId } = useLocalSearchParams<{ enrichmentId: string }>();
  const expedition = useQuery(expeditionQuery(enrichmentId));
  const scrollHandleRef = useRef<TrailScrollHandle | null>(null);
  const [vistaOpen, setVistaOpen] = useState(false);

  const goHome = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  // Explicit async states (R6): loading is a visible progress state, a transport failure
  // offers retry, and a genuine 404 (queryFn returns null) reads as "unavailable" — each
  // distinct from the others and from a successful trail. Retry keeps the trail route.
  if (expedition.isPending) {
    return <RouteStatus tone="loading" title={learnerTerm("expeditionLoading")} />;
  }
  if (expedition.isError) {
    return (
      <RouteStatus
        tone="error"
        title={learnerTerm("expeditionErrorTitle")}
        message={learnerTerm("expeditionErrorBody")}
        actions={[
          { label: learnerTerm("retryAction"), onPress: () => void expedition.refetch() },
          { label: learnerTerm("returnToTrail"), variant: "outline", onPress: goHome }
        ]}
      />
    );
  }
  if (!expedition.data) {
    return (
      <RouteStatus
        tone="unavailable"
        title={learnerTerm("expeditionUnavailable")}
        actions={[{ label: learnerTerm("returnToTrail"), onPress: goHome }]}
      />
    );
  }

  const { session, expedition: row } = expedition.data;
  const trail = buildTrailView(session);

  return (
    <Screen>
      <View className="border-b border-line bg-card px-4 py-2">
        <BackButton onPress={goHome} />
      </View>
      <QuestHeader
        session={session}
        trail={trail}
        expeditionTitle={row?.title ?? null}
        onJumpToSection={(sectionIndex) => scrollHandleRef.current?.scrollToSection(sectionIndex)}
        onOpenVista={() => setVistaOpen(true)}
      />
      <CheckpointPath view={trail} session={session} scrollHandleRef={scrollHandleRef} />
      <CrystalVista
        session={session}
        trail={trail}
        open={vistaOpen}
        onOpenChange={setVistaOpen}
        onExamine={(derivedNodeId) => {
          setVistaOpen(false);
          // Defer one tick so the trail is back on screen before scrolling to the stop.
          setTimeout(() => scrollHandleRef.current?.scrollToNode(derivedNodeId), 60);
        }}
      />
    </Screen>
  );
}

function BackButton({ onPress }: Readonly<{ onPress: () => void }>) {
  return (
    <Button
      variant="outline"
      size="compact"
      onPress={onPress}
      icon={<ArrowLeft size={14} color={buttonIconColor("outline")} />}
      label="Expeditions"
      className="self-start"
    />
  );
}
