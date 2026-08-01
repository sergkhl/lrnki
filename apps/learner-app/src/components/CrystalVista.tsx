import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";
import { ArrowRight, Gem } from "lucide-react-native";
import type { RecallScopeStatus, StudySession, TrailView } from "@lrnki/application/projection";
import {
  buildCrystalFormationLayout,
  formationMemoryDoorFor,
  rewardKeyForFocus,
  selectVistaFocus,
  vistaRewardSnapshot,
  type VistaFocus,
  type VistaRewardKey
} from "@/learn/crystalFormationLayout";
import { readVistaSeenBindings, writeVistaSeenBindings } from "@/lib/navMemory";
import { BottomSheet, Button, FullScreenDialog, OverlayHeader, Text, buttonIconColor, colors, useReducedMotion } from "@/ui";
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
  onExamine,
  onEnterGuardian
}: Readonly<{
  session: StudySession;
  trail: TrailView;
  open: boolean;
  explicitFocus?: VistaFocus | null;
  currentSectionIndex?: number | null;
  onOpenChange: (open: boolean) => void;
  onIntentConsumed?: () => void;
  onExamine: (derivedNodeId: string) => void;
  // KTD9: each panel offers its own Guardian. The host owns entry (and closes the Vista only
  // after a successful one), exactly as the Activity Sheet does.
  onEnterGuardian?: (scope: RecallScopeStatus) => Promise<void>;
}>) {
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const scrollRef = useRef<ScrollView>(null);
  // Panel scroll offsets are measured, not predicted: the caption and Guardian bands are
  // text-sized, so only layout knows where a panel actually landed. The scene reports
  // ground-relative offsets, so the host adds the ground's own place in the scrolled content.
  const panelOffsets = useRef(new Map<VistaRewardKey, number>());
  const sceneOffset = useRef(0);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [focus, setFocus] = useState<VistaFocus | null>(null);
  const [contextualizingRewardKey, setContextualizingRewardKey] = useState<VistaRewardKey | null>(null);
  // The formation ground spans the surface — the scene owns its own inset, so panels get the full
  // width the four-cell row needs at a 390 px phone. Bounded on desktop at a reading column: a
  // much wider well would leave a sparse Leg's cells floating in empty rock.
  const canvasWidth = Math.min(width, 480);
  const layout = useMemo(() => buildCrystalFormationLayout(session, trail, canvasWidth), [session, trail, canvasWidth]);
  const door = formationMemoryDoorFor(layout, selectedNodeId);

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
    const timer = setTimeout(() => {
      const targetY = sceneOffset.current + (panelOffsets.current.get(rewardKeyForFocus(focus)) ?? 0);
      scrollRef.current?.scrollTo({ y: Math.max(0, targetY - 24), animated: !reduceMotion });
    }, 0);
    return () => clearTimeout(timer);
  }, [focus, layout, open, reduceMotion]);

  const close = () => {
    setSelectedNodeId(null);
    setContextualizingRewardKey(null);
    onIntentConsumed?.();
    onOpenChange(false);
  };
  const closeMemory = () => setSelectedNodeId(null);
  const examine = (derivedNodeId: string) => {
    // Clear the modal selection before the host closes Vista and hands focus back to the trail.
    // A new task gives React a render boundary in which the sheet is gone before route handoff.
    setSelectedNodeId(null);
    setTimeout(() => onExamine(derivedNodeId), 0);
  };

  return (
    <FullScreenDialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <OverlayHeader
        icon={<Gem size={20} color={colors.ink} />}
        title={session.target.label}
        description={learnerTerm("vistaTitle")}
        onClose={close}
        closeLabel={learnerTerm("returnToTrail")}
      />
      {/* Pinned below the header so the one-time contextualization stays readable
          while the focus effect scrolls the ascent to the rewarded Leg (U6 finding:
          inside the scroll content it left the viewport with the auto-scroll). */}
      {contextualizingRewardKey ? (
        <View className="items-center px-4 pt-3">
          <View accessibilityLiveRegion="polite" className="rounded-card border border-line-strong bg-card px-3 py-1.5">
            <Text variant="caption" className="font-semibold">
              {contextualizingRewardKey === "summit"
                ? learnerTerm("vistaKeystoneJoined")
                : learnerTerm("vistaBoundTemplate").replace("{n}", contextualizingRewardKey.slice(4).replace(/^\d+$/, (value) => String(Number(value) + 1)))}
            </Text>
          </View>
        </View>
      ) : null}
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerClassName="items-center gap-3 py-4"
      >
        <Text variant="caption" color="muted" className="max-w-md px-4 text-center">{learnerTerm("vistaHint")}</Text>
        {layout.panels.length > 0 ? (
          <View onLayout={(event) => { sceneOffset.current = event.nativeEvent.layout.y; }}>
            <CrystalFormationScene
              layout={layout}
              focus={focus}
              contextualizingRewardKey={contextualizingRewardKey}
              selectedNodeId={selectedNodeId}
              onSelectNode={(derivedNodeId) => setSelectedNodeId((current) => current === derivedNodeId ? null : derivedNodeId)}
              onEnterGuardian={onEnterGuardian}
              onPanelOffset={(key, y) => panelOffsets.current.set(key, y)}
            />
          </View>
        ) : (
          <Text variant="label" color="muted" className="font-normal">{learnerTerm("vistaEmpty")}</Text>
        )}
      </ScrollView>
      <BottomSheet open={door !== null} onOpenChange={(next) => { if (!next) closeMemory(); }}>
        {door ? (
          <View testID="vista-memory-sheet" style={{ paddingBottom: 16 }}>
            <OverlayHeader
              icon={<Gem size={20} color={colors.ink} />}
              title={door.label}
              onClose={closeMemory}
            />
            <View className="gap-3 px-4 pt-4">
              {door.kind === "reveal" ? (
                <>
                  {door.gist ? <Text variant="body">{door.gist}</Text> : null}
                  <Button
                    testID="vista-examine-action"
                    onPress={() => examine(door.derivedNodeId)}
                    icon={<ArrowRight size={14} color={buttonIconColor("primary")} />}
                    label={learnerTerm("examine")}
                  />
                </>
              ) : (
                <Text variant="body" color="muted">
                  {learnerTerm("vistaGuardedTemplate").replace("{n}", String(door.legNumber))}
                </Text>
              )}
            </View>
          </View>
        ) : null}
      </BottomSheet>
    </FullScreenDialog>
  );
}
