"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { GraduationCapIcon, RotateCcwIcon, TriangleAlertIcon, TrophyIcon } from "lucide-react";
import { submitOptionSelect, submitImpostor, setVerdict, clearVerdict, resetLearner } from "@/app/admin/lab/study/actions";
import { DerivedGraphExplorer } from "@/components/DerivedGraphExplorer";
import { QuestLadder } from "@/components/study/QuestLadder";
import { StudySideSheet } from "@/components/study/StudySideSheet";
import { allSegmentsAnswered, focusedMapHiddenNodeIds, isPathComplete, nextStudyTarget, shouldAcceptSheetOpenChange } from "@/components/study/studyView";
import type { StudySession as StudySessionData } from "@/lib/studySession";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Admin-Lab client driver for one study session. Calibration now happens before study or
// through the inline "skip as known" action; this surface never reveals an answer before an
// option-select submit. Every write goes through server actions that revalidate the session
// route, so mastery is never held client-side.
export function StudySession({ session }: Readonly<{ session: StudySessionData }>) {
  // A foundational root goal opens directly on its single node (R3) — never empty, never
  // a premature "Goal reached."
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(session.isFoundationalRoot ? session.target.derivedNodeId : null);
  const [sheetOpen, setSheetOpen] = useState(session.isFoundationalRoot);
  const [mapScope, setMapScope] = useState<"focused" | "full">("focused");
  const [pending, startTransition] = useTransition();
  // Auto-advance bookkeeping (for graded option-select answers). After an answer we keep the
  // sheet open and snapshot the CURRENT session; the advance fires only once a DIFFERENT
  // session arrives (the server re-fold via revalidatePath), never on the synchronous
  // pending-flag flip against the stale prop.
  const pendingAdvanceRef = useRef(false);
  const autoAdvanceDismissGuardRef = useRef(false);
  const sessionAtAnswerRef = useRef(session);
  // A frontier node now stacks multiple study segments (option-select, then impostor). The
  // sheet holds the target until EVERY segment is answered, then advances (KTD7). We track the
  // answered segment ids for the open node here; it survives the per-answer re-fold (the sheet
  // does not remount) and resets when the node changes.
  const [answeredSegmentIds, setAnsweredSegmentIds] = useState<Set<string>>(new Set());

  // "Goal reached" only when the goal is NOT a foundational root and its whole cone is
  // mastered. A foundational root always shows its single-node study screen instead (R3/AE1).
  const questComplete = isPathComplete(session.classification, session.isFoundationalRoot);
  const sourceSummary = session.responseSourceSummary;
  const calibrationQuery = new URLSearchParams({ enrichmentId: session.enrichmentId, target: session.target.derivedNodeId });
  const selectedLabel = selectedNodeId ? session.detail.nodes.find((node) => node.derivedNodeId === selectedNodeId)?.label ?? selectedNodeId : null;
  const selectedContent = selectedNodeId ? session.sheetByNode[selectedNodeId] ?? null : null;
  // The ordered study segments for the open node (option_select, then impostor), each rendered
  // as its own card in the stacked sheet (R10).
  const selectedSegments = selectedNodeId ? session.studySegmentsByNode[selectedNodeId] ?? [] : [];
  // The Concept Lesson for the open node, shown ahead of the study segments (R12).
  const selectedLesson = selectedNodeId ? session.lessonByNode[selectedNodeId] ?? null : null;
  const adaptedHiddenNodeIds = useMemo(() => new Set(session.adaptedHiddenNodeIds), [session.adaptedHiddenNodeIds]);
  const labelByNode = useMemo(() => new Map(session.detail.nodes.map((node) => [node.derivedNodeId, node.label] as const)), [session.detail.nodes]);
  const focusedHiddenNodeIds = useMemo(
    () => focusedMapHiddenNodeIds(session.detail, session.statefulPath, adaptedHiddenNodeIds),
    [session.detail, session.statefulPath, adaptedHiddenNodeIds]
  );
  const activeHiddenNodeIds = mapScope === "focused" ? focusedHiddenNodeIds : adaptedHiddenNodeIds;

  const openNode = (derivedNodeId: string) => {
    setSelectedNodeId(derivedNodeId);
    setAnsweredSegmentIds(new Set());
    setSheetOpen(true);
  };

  const onSheetOpenChange = (nextOpen: boolean, eventDetails?: { reason?: string; event?: Event }) => {
    // Tapping a graph node is a node-open/switch gesture, never a dismiss. Because the sheet is
    // non-modal and the canvas sits outside its popup, Base UI reports that tap as an
    // `outside-press` close — which would instantly cancel the sheet the same tap just opened
    // (and would close instead of switch when re-tapping another node). That is the desktop
    // "click does nothing / opens once then closes" bug; touch took a different outside-press
    // path, so it only reproduced with a mouse. The cytoscape `tap` → `openNode` owns this
    // gesture, so swallow the redundant outside-press when it originates on the graph surface.
    if (!nextOpen && eventDetails?.reason === "outside-press") {
      const target = eventDetails.event?.target;
      if (target instanceof Element && target.closest("[data-graph-surface]")) return;
    }
    // Hold the sheet open across the answer → re-fold → advance window (a modal sheet emits a
    // stale open=false while the option card remounts and the server re-fold is in flight).
    if (!nextOpen && (pending || !shouldAcceptSheetOpenChange(nextOpen, autoAdvanceDismissGuardRef.current))) return;
    setSheetOpen(nextOpen);
    if (!nextOpen) setSelectedNodeId(null);
  };

  // Answer one segment, then advance ONLY when every segment of the open node is answered.
  // Each answer revalidates → a new session prop arrives → the advance effect runs, but it
  // only retargets once the advance is armed (the final segment). Intermediate answers leave
  // the sheet on the node so the learner can finish its remaining segments.
  const answerSegment = (studyItemId: string, submit: () => Promise<void>) => {
    const nextAnswered = new Set(answeredSegmentIds).add(studyItemId);
    setAnsweredSegmentIds(nextAnswered);
    const allAnswered = allSegmentsAnswered(selectedSegments, nextAnswered);
    if (allAnswered) {
      pendingAdvanceRef.current = true;
      autoAdvanceDismissGuardRef.current = true;
      sessionAtAnswerRef.current = session;
    }
    startTransition(async () => {
      try {
        await submit();
      } catch (error) {
        if (allAnswered) {
          pendingAdvanceRef.current = false;
          autoAdvanceDismissGuardRef.current = false;
        }
        throw error;
      }
    });
  };

  const onSelectOption = (studyItemId: string, optionId: string) => {
    answerSegment(studyItemId, () => submitOptionSelect({ learnerStateRef: session.learnerStateRef, studyItemId, chosenOptionId: optionId }));
  };

  const onSelectImpostor = (studyItemId: string, statementId: string) => {
    answerSegment(studyItemId, () => submitImpostor({ learnerStateRef: session.learnerStateRef, studyItemId, chosenStatementId: statementId }));
  };

  // Advance effect (R4/AE1): when a DIFFERENT session arrives after a graded answer, retarget
  // the open sheet to the freshly-advanced frontier target; a null target with no foundational
  // root means the goal is reached — close the sheet.
  useEffect(() => {
    if (!pendingAdvanceRef.current || session === sessionAtAnswerRef.current) return;
    pendingAdvanceRef.current = false;
    const target = nextStudyTarget(session.classification);
    let frame: number;
    if (target === null) {
      frame = requestAnimationFrame(() => {
        autoAdvanceDismissGuardRef.current = false;
        if (!session.isFoundationalRoot) {
          setSheetOpen(false);
          setSelectedNodeId(null);
        }
      });
    } else {
      frame = requestAnimationFrame(() => {
        setSelectedNodeId(target);
        setAnsweredSegmentIds(new Set());
        setSheetOpen(true);
        autoAdvanceDismissGuardRef.current = false;
      });
    }
    return () => cancelAnimationFrame(frame);
  }, [session]);

  const skipAsKnown = () => {
    if (!selectedNodeId) return;
    const derivedNodeId = selectedNodeId;
    pendingAdvanceRef.current = true;
    autoAdvanceDismissGuardRef.current = true;
    sessionAtAnswerRef.current = session;
    startTransition(async () => {
      try {
        await setVerdict({ learnerStateRef: session.learnerStateRef, derivedNodeId, verdict: "known" });
      } catch (error) {
        pendingAdvanceRef.current = false;
        autoAdvanceDismissGuardRef.current = false;
        throw error;
      }
    });
  };

  const onClear = (derivedNodeId?: string) => {
    const nodeId = derivedNodeId ?? selectedNodeId;
    if (!nodeId) return;
    startTransition(async () => {
      await clearVerdict({ learnerStateRef: session.learnerStateRef, derivedNodeId: nodeId });
    });
  };

  const onReset = () => {
    if (typeof window !== "undefined" && !window.confirm(`Reset all calibration verdicts and graded responses for ${session.learnerStateRef}? This cannot be undone.`)) return;
    startTransition(async () => {
      await resetLearner({ learnerStateRef: session.learnerStateRef });
      setSheetOpen(false);
      setSelectedNodeId(null);
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
            : session.isFoundationalRoot ? "foundational — studied directly" : "quest complete"}
            . Tap a ready node to study it, or skip it as already known.
          </CardDescription>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant={sourceSummary.synthetic > 0 ? "secondary" : "outline"}>
              {sourceSummary.synthetic} synthetic · {sourceSummary.human} human
            </Badge>
            <Button type="button" size="sm" variant="outline" onClick={onReset} disabled={pending}>
              <RotateCcwIcon data-icon="inline-start" />
              Reset learner
            </Button>
            <Link
              className={buttonVariants({ variant: "outline", size: "sm" })}
              href={`/admin/lab/study/${encodeURIComponent(session.learnerStateRef)}/calibrate?${calibrationQuery.toString()}` as Route}
            >
              Re-calibrate
            </Link>
          </div>
        </CardHeader>
      </Card>

      {session.isFoundationalRoot ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-4 text-sm">
            <GraduationCapIcon className="size-5 text-chart-2" />
            <span>
              <span className="font-medium">Foundational — studied directly.</span>{" "}
              <span className="text-muted-foreground">
                {session.target.label} has no prerequisites. Open it to study it, or skip it as already known.
              </span>
            </span>
          </CardContent>
        </Card>
      ) : null}

      {questComplete ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-4 text-sm">
            <TrophyIcon className="size-5 text-chart-4" />
            <span>
              <span className="font-medium">Quest complete.</span>{" "}
              <span className="text-muted-foreground">
                Every concept on the path to {session.target.label} is mastered.
              </span>
            </span>
          </CardContent>
        </Card>
      ) : null}

      {session.coexistence.length > 0 ? (
        <Card>
          <CardContent className="flex flex-col gap-1 py-4 text-sm">
            <span className="flex items-center gap-2 font-medium">
              <TriangleAlertIcon className="size-4 text-chart-5" /> Calibration ↔ graded coexistence
            </span>
            <span className="text-muted-foreground">
              These nodes are mastered via &ldquo;I knew it&rdquo; but also carry a graded result — surfaced, not silently resolved:
            </span>
            <ul className="mt-1 flex flex-col gap-1">
              {session.coexistence.map((flag) => (
                <li key={flag.derivedNodeId} className="text-muted-foreground">
                  <span className="font-medium text-foreground">{flag.label}</span> — graded mastery {flag.gradedMastery.toFixed(2)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {session.lessonAbsent.length > 0 ? (
        <Card>
          <CardContent className="flex flex-col gap-1 py-4 text-sm">
            <span className="flex items-center gap-2 font-medium">
              <TriangleAlertIcon className="size-4 text-chart-5" /> Nodes with no lesson ({session.lessonAbsent.length})
            </span>
            <span className="text-muted-foreground">
              These nodes produced no Concept Lesson — their grounding could not meet the minimum:
            </span>
            <ul className="mt-1 flex flex-col gap-1">
              {session.lessonAbsent.map((node) => (
                <li key={node.derivedNodeId} className="text-muted-foreground">
                  <span className="font-medium text-foreground">{node.label}</span> — {node.reason}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {session.restorations.length > 0 ? (
        <Card>
          <CardContent className="flex flex-col gap-2 py-4 text-sm">
            <span className="flex items-center gap-2 font-medium">
              <RotateCcwIcon className="size-4 text-chart-1" /> Restore a skipped prerequisite?
            </span>
            <span className="text-muted-foreground">
              You missed a node you&apos;re studying. A related prerequisite you marked &ldquo;I knew it&rdquo; may be
              worth revisiting — restoring it returns it to your study gap.
            </span>
            <ul className="mt-1 flex flex-col gap-2">
              {session.restorations.map((suggestion) => (
                <li key={suggestion.struggledNodeId} className="rounded-md border px-3 py-2">
                  <span className="block text-xs text-muted-foreground">
                    Missed <span className="font-medium text-foreground">{suggestion.struggledLabel}</span> — revisit:
                  </span>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {suggestion.prerequisites.map((prerequisite) => (
                      <Button
                        key={prerequisite.derivedNodeId}
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => onClear(prerequisite.derivedNodeId)}
                      >
                        <RotateCcwIcon data-icon="inline-start" />
                        Restore {prerequisite.label}
                      </Button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">Quest ladder</CardTitle>
          <CardDescription>Progress toward {session.target.label}, grouped by prerequisite wave.</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <QuestLadder
            steps={session.statefulPath}
            adaptedHiddenNodeIds={adaptedHiddenNodeIds}
            labelByNode={labelByNode}
            selectedFrontierTarget={session.classification.selectedFrontierTarget}
            onOpenNode={openNode}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Quest map</CardTitle>
              <CardDescription>
                {mapScope === "focused" ? "Focused on the target and trusted prerequisites." : "Full Derived Graph Layer context."}
              </CardDescription>
            </div>
            <div role="group" aria-label="Quest map scope" className="flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant={mapScope === "focused" ? "default" : "outline"}
                aria-pressed={mapScope === "focused"}
                className="h-7 px-2.5"
                onClick={() => setMapScope("focused")}
              >
                Focused
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mapScope === "full" ? "default" : "outline"}
                aria-pressed={mapScope === "full"}
                className="h-7 px-2.5"
                onClick={() => setMapScope("full")}
              >
                Full map
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <DerivedGraphExplorer detail={session.detail} adapted={session.classification} hiddenNodeIds={activeHiddenNodeIds} onNodeSelect={openNode} />
        </CardContent>
      </Card>

      <StudySideSheet
        open={sheetOpen}
        onOpenChange={onSheetOpenChange}
        nodeLabel={selectedLabel}
        content={selectedContent}
        segments={selectedSegments}
        lesson={selectedLesson}
        onSelectOption={onSelectOption}
        onSelectImpostor={onSelectImpostor}
        onSkipAsKnown={skipAsKnown}
        onClear={() => onClear()}
        pending={pending}
      />
    </div>
  );
}
