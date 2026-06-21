"use client";

import { useState, useTransition } from "react";
import { GraduationCapIcon, SlidersHorizontalIcon } from "lucide-react";
import type { SelfAssessmentOutcome } from "@lrnki/application";
import { selfAssessCard, submitCalibration } from "@/app/admin/lab/study/actions";
import { DerivedGraphExplorer } from "@/components/DerivedGraphExplorer";
import { CalibrationSweep, type CalibrationRating } from "@/components/study/CalibrationSweep";
import { StudySideSheet } from "@/components/study/StudySideSheet";
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

  const sourceSummary = session.responseSourceSummary;
  const selectedLabel = selectedNodeId ? session.detail.nodes.find((node) => node.derivedNodeId === selectedNodeId)?.label ?? selectedNodeId : null;
  const selectedContent = selectedNodeId ? session.sheetByNode[selectedNodeId] ?? null : null;

  const openNode = (derivedNodeId: string) => {
    setSelectedNodeId(derivedNodeId);
    setSheetOpen(true);
  };

  const onAssess = (outcome: SelfAssessmentOutcome) => {
    const content = selectedContent;
    if (!content || content.kind !== "frontier_card") return;
    const cardId = content.card.cardId;
    startTransition(async () => {
      await selfAssessCard({ learnerStateRef: session.learnerStateRef, cardId, outcome });
      // The frontier has advanced; close the sheet so the re-coloured graph is the focus (AE2).
      setSheetOpen(false);
      setSelectedNodeId(null);
    });
  };

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
        onOpenChange={setSheetOpen}
        nodeLabel={selectedLabel}
        content={selectedContent}
        onAssess={onAssess}
        pending={pending}
      />
    </div>
  );
}
