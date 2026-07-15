import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";
import { ArrowRight, Gem } from "lucide-react-native";
import type { StudySession, TrailView } from "@lrnki/application/projection";
import {
  buildCrystalFormationLayout,
  fitLegWidth,
  formationMemoryDoorFor,
  rewardKeyForFocus,
  selectVistaFocus,
  vistaRewardSnapshot,
  type VistaFocus,
  type VistaRewardKey
} from "@/learn/crystalFormationLayout";
import { readVistaSeenBindings, writeVistaSeenBindings } from "@/lib/navMemory";
import { Button, FullScreenDialog, OverlayHeader, Text, buttonIconColor, colors, useReducedMotion } from "@/ui";
import { learnerTerm } from "@/learn/vocabulary";
import { CrystalFormationScene } from "./CrystalFormationScene";

export function CrystalVista({
  session,
  trail,
  open,
  explicitFocus = null,
  currentSectionIndex = null,
  onOpenChange,
  onIntentConsumed,
  onExamine
}: Readonly<{
  session: StudySession;
  trail: TrailView;
  open: boolean;
  explicitFocus?: VistaFocus | null;
  currentSectionIndex?: number | null;
  onOpenChange: (open: boolean) => void;
  onIntentConsumed?: () => void;
  onExamine: (derivedNodeId: string) => void;
}>) {
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const scrollRef = useRef<ScrollView>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [focus, setFocus] = useState<VistaFocus | null>(null);
  const [contextualizingRewardKey, setContextualizingRewardKey] = useState<VistaRewardKey | null>(null);
  const layout = useMemo(() => buildCrystalFormationLayout(session, trail), [session, trail]);
  const door = formationMemoryDoorFor(layout, selectedNodeId);
  const canvasWidth = Math.min(width - 32, 720);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const seen = (await readVistaSeenBindings(session.learnerStateRef, session.enrichmentId)) ?? [];
      if (cancelled) return;
      const nextFocus = selectVistaFocus(layout, explicitFocus, currentSectionIndex, seen);
      const snapshot = vistaRewardSnapshot(layout);
      const nextRewardKey = nextFocus ? rewardKeyForFocus(nextFocus) : null;
      setFocus(nextFocus);
      setContextualizingRewardKey(nextRewardKey !== null && snapshot.includes(nextRewardKey) && !seen.includes(nextRewardKey) ? nextRewardKey : null);
      await writeVistaSeenBindings(session.learnerStateRef, session.enrichmentId, snapshot);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentSectionIndex, explicitFocus, layout, open, session.enrichmentId, session.learnerStateRef]);

  useEffect(() => {
    if (!open || !focus) return;
    const scale = fitLegWidth(layout.width, canvasWidth).scale;
    const targetY = focus.kind === "summit"
      ? 0
      : (layout.legs.find((leg) => leg.sectionIndex === focus.sectionIndex)?.frame.y ?? 0) * scale;
    const timer = setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, targetY - 120), animated: !reduceMotion }), 0);
    return () => clearTimeout(timer);
  }, [canvasWidth, focus, layout, open, reduceMotion]);

  const close = () => {
    setSelectedNodeId(null);
    setContextualizingRewardKey(null);
    onIntentConsumed?.();
    onOpenChange(false);
  };

  return (
    <FullScreenDialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <View className="flex-1 bg-background">
        <OverlayHeader
          icon={<Gem size={20} color={colors.ink} />}
          title={session.target.label}
          description={learnerTerm("vistaTitle")}
          onClose={close}
          closeLabel={learnerTerm("returnToTrail")}
        />
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerClassName="items-center gap-3 p-4"
        >
          <Text variant="caption" color="muted" className="max-w-md text-center">{learnerTerm("vistaHint")}</Text>
          {contextualizingRewardKey ? (
            <View accessibilityLiveRegion="polite" className="rounded-card border border-line-strong bg-card px-3 py-1.5">
              <Text variant="caption" className="font-semibold">
                {contextualizingRewardKey === "summit"
                  ? learnerTerm("vistaCrownJoined")
                  : learnerTerm("vistaBoundTemplate").replace("{n}", contextualizingRewardKey.slice(4).replace(/^\d+$/, (value) => String(Number(value) + 1)))}
              </Text>
            </View>
          ) : null}
          {layout.legs.length > 0 ? (
            <CrystalFormationScene
              layout={layout}
              width={canvasWidth}
              focus={focus}
              contextualizingRewardKey={contextualizingRewardKey}
              selectedNodeId={selectedNodeId}
              onSelectNode={(derivedNodeId) => setSelectedNodeId((current) => current === derivedNodeId ? null : derivedNodeId)}
            />
          ) : (
            <Text variant="label" color="muted" className="font-normal">{learnerTerm("vistaEmpty")}</Text>
          )}
        </ScrollView>
        {door ? (
          <View className="border-t border-line bg-card px-4 py-3">
            <View className="mx-auto w-full max-w-3xl gap-1.5">
              <Text variant="label" className="font-semibold" numberOfLines={1}>{door.label}</Text>
              {door.kind === "reveal" ? (
                <>
                  {door.gist ? <Text variant="caption" color="muted" numberOfLines={3}>{door.gist}</Text> : null}
                  <Button
                    onPress={() => onExamine(door.derivedNodeId)}
                    icon={<ArrowRight size={14} color={buttonIconColor("primary")} />}
                    label={learnerTerm("examine")}
                  />
                </>
              ) : (
                <Text variant="caption" color="muted">
                  {learnerTerm("vistaGuardedTemplate").replace("{n}", String(door.legNumber))}
                </Text>
              )}
            </View>
          </View>
        ) : null}
      </View>
    </FullScreenDialog>
  );
}
