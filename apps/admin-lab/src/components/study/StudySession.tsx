"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { GraduationCapIcon, SlidersHorizontalIcon, TrophyIcon } from "lucide-react";
import { submitOptionSelect, submitCalibration } from "@/app/admin/lab/study/actions";
import { DerivedGraphExplorer } from "@/components/DerivedGraphExplorer";
import { CalibrationSweep, type CalibrationRating } from "@/components/study/CalibrationSweep";
import { StudySideSheet } from "@/components/study/StudySideSheet";
import { nextStudyTarget, shouldAcceptSheetOpenChange } from "@/components/study/studyView";
import type { StudySession as StudySessionData } from "@/lib/studySession";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Admin-Lab client driver for one study session (U5). It composes the transfer-ready
// modules (CalibrationSweep, StudySideSheet) and the reshaped graph: a node tap opens the
// state-gated sheet, the optional "Calibrate" button reveals the sweep, and every write goes
// through the U3 server actions. Each action `revalidatePath`s the session route, so the
// server re-folds mastery and re-classifies and this component re-renders with fresh props —
// the frontier advances in the same view (R7). Mastery is never held client-side.
export function StudySession({ session }: Readonly<{ session: StudySessionData }>) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [pending, startTransition] = useTransition();
  // Auto-advance bookkeeping (U4). After an answer we keep the sheet open and snapshot the
  // CURRENT session object; the advance fires only once a DIFFERENT session arrives (the
  // server re-fold delivered via revalidatePath), never on the synchronous pending-flag
  // flip against the stale prop. Refs because neither should trigger a re-render itself.
  const pendingAdvanceRef = useRef(false);
  const autoAdvanceDismissGuardRef = useRef(false);
  const sessionAtAnswerRef = useRef(session);

  const goalReached = session.classification.selectedFrontierTarget === null;
  const sourceSummary = session.responseSourceSummary;
  const selectedLabel = selectedNodeId ? session.detail.nodes.find((node) => node.derivedNodeId === selectedNodeId)?.label ?? selectedNodeId : null;
  const selectedContent = selectedNodeId ? session.sheetByNode[selectedNodeId] ?? null : null;

  const openNode = (derivedNodeId: string) => {
    setSelectedNodeId(derivedNodeId);
    setSheetOpen(true);
  };

  const onSheetOpenChange = (nextOpen: boolean) => {
    if (!shouldAcceptSheetOpenChange(nextOpen, autoAdvanceDismissGuardRef.current)) return;
    setSheetOpen(nextOpen);
    if (!nextOpen) setSelectedNodeId(null);
  };

  const onSelect = (optionId: string) => {
    const content = selectedContent;
    if (!content || content.kind !== "option_select") return;
    const studyItemId = content.item.studyItemId;
    // Keep the sheet open and arm the advance; the effect below retargets it once the
    // re-folded session prop arrives (R4). Do NOT close here — that was the drop-out (AE1).
    pendingAdvanceRef.current = true;
    autoAdvanceDismissGuardRef.current = true;
    sessionAtAnswerRef.current = session;
    startTransition(async () => {
      try {
        await submitOptionSelect({ learnerStateRef: session.learnerStateRef, studyItemId, chosenOptionId: optionId });
      } catch (error) {
        pendingAdvanceRef.current = false;
        autoAdvanceDismissGuardRef.current = false;
        throw error;
      }
    });
  };

  // Advance effect (U4, R4/AE1): when a DIFFERENT session object arrives after an answer
  // (the server re-fold), retarget the open sheet to the freshly-advanced frontier target.
  // A null target means the goal is reached — close the sheet (the completion state shows).
  // Keyed on `session`: it does not run on the synchronous pending-flag flip (same prop).
  useEffect(() => {
    if (!pendingAdvanceRef.current || session === sessionAtAnswerRef.current) return;
    pendingAdvanceRef.current = false;
    const target = nextStudyTarget(session.classification);
    if (target === null) {
      autoAdvanceDismissGuardRef.current = false;
      setSheetOpen(false);
      setSelectedNodeId(null);
    } else {
      setSelectedNodeId(target);
      setSheetOpen(true);
      requestAnimationFrame(() => {
        autoAdvanceDismissGuardRef.current = false;
      });
    }
  }, [session]);

  const onCalibrate = (ratings: CalibrationRating[]) => {
    startTransition(async () => {
      await submitCalibration({ learnerStateRef: session.learnerStateRef, enrichmentId: session.enrichmentId, ratings });
      setCalibrating(false);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <GraduationCapIcon className="size-4" />
            Studying toward {session.target.label}
          </CardTitle>
          <CardDescription>
            Learner <span className="font-mono text-xs">{session.learnerStateRef}</span> · frontier:{" "}
            {session.classification.selectedFrontierTarget
              ? session.detail.nodes.find((n) => n.derivedNodeId === session.classification.selectedFrontierTarget)?.label ?? "—"
              : "goal reached"}
            . Tap a node to study it. Toggle neutral ↔ adapted on the graph to compare.
          </CardDescription>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant={sourceSummary.synthetic > 0 ? "secondary" : "outline"}>
              {sourceSummary.synthetic} synthetic · {sourceSummary.human} human
            </Badge>
            <Button type="button" size="sm" variant={calibrating ? "secondary" : "outline"} onClick={() => setCalibrating((value) => !value)}>
              <SlidersHorizontalIcon data-icon="inline-start" />
              {calibrating ? "Hide calibration" : "Calibrate"}
            </Button>
          </div>
        </CardHeader>
      </Card>

      {goalReached ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-4 text-sm">
            <TrophyIcon className="size-5 text-chart-4" />
            <span>
              <span className="font-medium">Goal reached.</span>{" "}
              <span className="text-muted-foreground">
                Every concept on the path to {session.target.label} is mastered — nothing left to study here.
              </span>
            </span>
          </CardContent>
        </Card>
      ) : null}

      {calibrating ? (
        <CalibrationSweep items={session.calibrationItems} onSubmit={onCalibrate} pending={pending} />
      ) : null}

      <Card>
        <CardContent className="pt-4">
          <DerivedGraphExplorer detail={session.detail} adapted={session.classification} onNodeSelect={openNode} />
        </CardContent>
      </Card>

      <StudySideSheet
        open={sheetOpen}
        onOpenChange={onSheetOpenChange}
        nodeLabel={selectedLabel}
        content={selectedContent}
        onSelect={onSelect}
        pending={pending}
      />
    </div>
  );
}
