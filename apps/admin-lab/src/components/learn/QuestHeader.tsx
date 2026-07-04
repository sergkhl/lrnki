import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { StudySession } from "@/lib/learnerStudySession";
import { learnerTerm } from "./vocabulary";

export function QuestHeader({ session }: Readonly<{ session: StudySession }>) {
  const frontier = session.classification.selectedFrontierTarget
    ? session.detail.nodes.find((node) => node.derivedNodeId === session.classification.selectedFrontierTarget)?.label ?? session.classification.selectedFrontierTarget
    : learnerTerm("summit");
  return (
    <Card className="border-[color:var(--journal-line)] bg-[color:var(--journal-panel)]">
      <CardContent className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Expedition target</p>
          <h1 className="truncate text-2xl font-semibold tracking-normal">{session.target.label}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{frontier}</Badge>
          <Badge variant="outline">{session.studyItemCount} stops</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
