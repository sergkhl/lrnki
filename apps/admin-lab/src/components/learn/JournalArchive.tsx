import { BookOpenIcon, GemIcon } from "lucide-react";
import type { StudySession } from "@/lib/learnerStudySession";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LessonSections } from "./LessonSections";

export function JournalArchive({ session }: Readonly<{ session: StudySession }>) {
  const masteredIds = new Set(Object.entries(session.classification.stateByNode).filter(([, state]) => state === "mastered").map(([nodeId]) => nodeId));
  const masteredLessons = Object.values(session.lessonByNode).filter((lesson) => masteredIds.has(lesson.derivedNodeId));
  return (
    <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      <Card className="border-[color:var(--journal-line)] bg-[color:var(--journal-panel)]">
        <CardHeader>
          <CardTitle>Gem collection</CardTitle>
          <CardDescription>{masteredIds.size} collected specimens</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {[...masteredIds].map((nodeId) => {
            const label = session.detail.nodes.find((node) => node.derivedNodeId === nodeId)?.label ?? nodeId;
            return <Badge key={nodeId} variant="secondary"><GemIcon data-icon="inline-start" />{label}</Badge>;
          })}
          {masteredIds.size === 0 ? <p className="text-sm text-muted-foreground">No gems collected yet.</p> : null}
        </CardContent>
      </Card>
      <div className="flex flex-col gap-4">
        {masteredLessons.length === 0 ? (
          <Card className="border-[color:var(--journal-line)] bg-[color:var(--journal-panel)]">
            <CardContent className="flex items-center gap-3 py-6">
              <BookOpenIcon />
              <p className="text-sm text-muted-foreground">Journal pages appear when a concept is mastered.</p>
            </CardContent>
          </Card>
        ) : masteredLessons.map((lesson) => (
          <Card key={lesson.derivedNodeId} className="border-[color:var(--journal-line)] bg-[color:var(--journal-panel)]">
            <CardHeader>
              <CardTitle>{lesson.canonicalLabel}</CardTitle>
              <CardDescription>Collected journal page</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <LessonSections lesson={lesson} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
