"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { GraduationCapIcon, RotateCcwIcon, TriangleAlertIcon, TrophyIcon } from "lucide-react";
import { submitOptionSelect, setVerdict, clearVerdict, resetLearner } from "@/app/admin/lab/study/actions";
import { DerivedGraphExplorer } from "@/components/DerivedGraphExplorer";
import { StudySideSheet } from "@/components/study/StudySideSheet";
import { nextStudyTarget, shouldAcceptSheetOpenChange } from "@/components/study/studyView";
import type { StudySession as StudySessionData } from "@/lib/studySession";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  const [pending, startTransition] = useTransition();
  // Auto-advance bookkeeping (for graded option-select answers). After an answer we keep the
  // sheet open and snapshot the CURRENT session; the advance fires only once a DIFFERENT
  // session arrives (the server re-fold via revalidatePath), never on the synchronous
  // pending-flag flip against the stale prop.
  const pendingAdvanceRef = useRef(false);
  const autoAdvanceDismissGuardRef = useRef(false);
  const sessionAtAnswerRef = useRef(session);

  // "Goal reached" only when the goal is NOT a foundational root and its whole cone is
  // mastered. A foundational root always shows its single-node study screen instead (R3/AE1).
  const goalReached = !session.isFoundationalRoot && session.classification.selectedFrontierTarget === null;
  const sourceSummary = session.responseSourceSummary;
  const selectedLabel = selectedNodeId ? session.detail.nodes.find((node) => node.derivedNodeId === selectedNodeId)?.label ?? selectedNodeId : null;
  const selectedContent = selectedNodeId ? session.sheetByNode[selectedNodeId] ?? null : null;

  const openNode = (derivedNodeId: string) => {
    setSelectedNodeId(derivedNodeId);
    setSheetOpen(true);
  };

  const onSheetOpenChange = (nextOpen: boolean) => {
    // Hold the sheet open across the answer → re-fold → advance window (a modal sheet emits a
    // stale open=false while the option card remounts and the server re-fold is in flight).
    if (!nextOpen && (pending || !shouldAcceptSheetOpenChange(nextOpen, autoAdvanceDismissGuardRef.current))) return;
    setSheetOpen(nextOpen);
    if (!nextOpen) setSelectedNodeId(null);
  };

  const onSelect = (optionId: string) => {
    const content = selectedContent;
    if (!content) return;
    const studyItemId = content.kind === "option_select" ? content.item.studyItemId : undefined;
    if (!studyItemId) return;
    // Keep the sheet open and arm the advance; the effect below retargets it once the
    // re-folded session prop arrives (R4).
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
        setSheetOpen(true);
        autoAdvanceDismissGuardRef.current = false;
      });
    }
    return () => cancelAnimationFrame(frame);
  }, [session]);

  const skipAsKnown = () => {
    if (!selectedNodeId) return;
    const derivedNodeId = selectedNodeId;
    startTransition(async () => {
      await setVerdict({ learnerStateRef: session.learnerStateRef, derivedNodeId, verdict: "known" });
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
              : session.isFoundationalRoot ? "foundational — studied directly" : "goal reached"}
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
        onSkipAsKnown={skipAsKnown}
        onClear={() => onClear()}
        pending={pending}
      />
    </div>
  );
}
