import { CheckCircle2Icon, GemIcon } from "lucide-react";
import type { StudySession } from "@lrnki/application";
import { setLearnerVerdict } from "@/app/learn/[learnerStateRef]/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ImpostorActivity, OptionSelectActivity } from "./ActivityCards";
import { selectActivityNodeId, unansweredActivitySegments } from "./activityProgress";
import { learnerTerm } from "./vocabulary";

export function ActivityScreen({ session, answeredStudyItemIds }: Readonly<{ session: StudySession; answeredStudyItemIds: ReadonlySet<string> }>) {
  const nextNodeId = selectActivityNodeId({
    path: session.statefulPath,
    studySegmentsByNode: session.studySegmentsByNode,
    answeredStudyItemIds,
    selectedFrontierTarget: session.classification.selectedFrontierTarget,
    fallbackTargetDerivedNodeId: session.isFoundationalRoot ? session.target.derivedNodeId : null
  });
  if (!nextNodeId) {
    return (
      <Card className="border-[color:var(--journal-line)] bg-[color:var(--journal-panel)]">
        <CardContent className="flex items-center gap-3 py-6">
          <GemIcon />
          <div>
            <p className="font-medium">{learnerTerm("summit")}</p>
            <p className="text-sm text-muted-foreground">Every stop in this expedition is collected.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const node = session.detail.nodes.find((candidate) => candidate.derivedNodeId === nextNodeId);
  const lesson = session.lessonByNode[nextNodeId];
  const segments = unansweredActivitySegments(session.studySegmentsByNode[nextNodeId] ?? [], answeredStudyItemIds);
  return (
    <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
      <Card className="border-[color:var(--journal-line)] bg-[color:var(--journal-panel)]">
        <CardHeader>
          <Badge variant="secondary" className="w-fit">{learnerTerm("nextStop")}</Badge>
          <CardTitle>{node?.label ?? nextNodeId}</CardTitle>
          <CardDescription>Read the field notes, answer each stop, or mark this ground known.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {lesson ? lesson.sections.map((section, index) => (
            <article key={`${section.kind}:${index}`} className="rounded-md border border-[color:var(--journal-line)] bg-background/60 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Badge variant="outline">{section.kind}</Badge>
                <Badge variant={section.isSourceCited ? "secondary" : "outline"}>{section.isSourceCited ? "source" : "generated"}</Badge>
              </div>
              <p className="text-sm leading-6">{section.text}</p>
            </article>
          )) : <p className="text-sm text-muted-foreground">No field notes are available for this stop.</p>}
          <form action={async () => {
            "use server";
            await setLearnerVerdict({
              learnerStateRef: session.learnerStateRef,
              enrichmentId: session.enrichmentId,
              derivedNodeId: nextNodeId,
              verdict: "known"
            });
          }}>
            <Button type="submit" variant="outline">
              <CheckCircle2Icon data-icon="inline-start" />
              {learnerTerm("skipKnown")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {segments.length === 0 ? (
          <Card className="border-[color:var(--journal-line)] bg-[color:var(--journal-panel)]">
            <CardContent className="py-6 text-sm text-muted-foreground">This stop has no graded activity yet.</CardContent>
          </Card>
        ) : segments.map((segment) => segment.kind === "option_select"
          ? <OptionSelectActivity key={segment.item.studyItemId} session={session} item={segment.item} />
          : <ImpostorActivity key={segment.item.studyItemId} session={session} item={segment.item} />
        )}
      </div>
    </section>
  );
}
