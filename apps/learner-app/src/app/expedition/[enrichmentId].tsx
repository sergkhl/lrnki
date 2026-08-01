import { useRef, useState } from "react";
import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { CheckpointPath, type TrailScrollHandle } from "@/components/CheckpointPath";
import { CrystalVista } from "@/components/CrystalVista";
import { QuestHeader } from "@/components/QuestHeader";
import { buildTrailView } from "@lrnki/application/projection";
import { enterGuardianScope } from "@/lib/guardianEntry";
import { expeditionQuery } from "@/lib/queries";
import { Button, RouteStatus, Screen, buttonIconColor } from "@/ui";
import { learnerTerm } from "@/learn/vocabulary";
import type { VistaFocus } from "@/learn/crystalFormationLayout";

// The expedition trail screen. Data comes prefetched/cached by Query before the sheet
// opens (R6): the whole study session is one read, so the activity loop never spins.
export default function ExpeditionPage() {
  const router = useRouter();
  const { enrichmentId, vista, formationFocus } = useLocalSearchParams<{
    enrichmentId: string;
    vista?: string;
    formationFocus?: string;
  }>();
  const expedition = useQuery(expeditionQuery(enrichmentId));
  const scrollHandleRef = useRef<TrailScrollHandle | null>(null);
  const [manualVistaOpen, setManualVistaOpen] = useState(false);
  const [routeIntentConsumed, setRouteIntentConsumed] = useState(false);
  const vistaOpen = (vista === "1" && !routeIntentConsumed) || manualVistaOpen;

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
        onOpenVista={() => setManualVistaOpen(true)}
      />
      <CheckpointPath view={trail} session={session} scrollHandleRef={scrollHandleRef} />
      <CrystalVista
        session={session}
        trail={trail}
        open={vistaOpen}
        explicitFocus={parseVistaFocus(formationFocus)}
        currentSectionIndex={trail.currentSectionIndex}
        onOpenChange={setManualVistaOpen}
        onIntentConsumed={() => {
          setRouteIntentConsumed(true);
          router.setParams({ vista: undefined, formationFocus: undefined });
        }}
        onExamine={(derivedNodeId) => {
          setManualVistaOpen(false);
          // Defer one tick so the trail is back on screen before scrolling to the stop.
          setTimeout(() => scrollHandleRef.current?.scrollToNode(derivedNodeId), 60);
        }}
        // KTD9: a Leg panel's Guardian row enters through the SAME entry rule the trail node
        // uses, and closes the Vista only after a successful entry — a refused create leaves
        // the formation exactly as it was.
        onEnterGuardian={async (scope) => {
          const result = await enterGuardianScope({ enrichmentId: session.enrichmentId, scope });
          if (!result.entered) return;
          setManualVistaOpen(false);
          setRouteIntentConsumed(true);
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          router.push(`/guardian/${result.challengeId}`);
        }}
      />
    </Screen>
  );
}

export function parseVistaFocus(value: string | undefined): VistaFocus | null {
  if (value === "summit") return { kind: "summit" };
  const match = /^leg:(\d+)$/.exec(value ?? "");
  return match ? { kind: "leg", sectionIndex: Number(match[1]) } : null;
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
