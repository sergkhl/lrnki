import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, BookOpenIcon } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { StudySession } from "@/components/study/StudySession";
import { buttonVariants } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { getStudySession } from "@/lib/studySession";

export const dynamic = "force-dynamic";

// Study session surface (U5). Server-loads getStudySession for the picked enrichment +
// goal + learner, then renders the client driver. Each response revalidates this path, so
// the loader re-folds mastery and re-classifies and the driver re-renders with the advanced
// frontier (R7). Read + projection only — the page never opens a graph write port (R16).
export default async function StudySessionPage({
  params,
  searchParams
}: Readonly<{
  params: Promise<{ learnerStateRef: string }>;
  searchParams: Promise<{ enrichmentId?: string; target?: string }>;
}>) {
  const { learnerStateRef } = await params;
  const { enrichmentId, target } = await searchParams;
  const decodedLearnerStateRef = decodeURIComponent(learnerStateRef);
  if (!enrichmentId || !target) notFound();

  const session = await getStudySession(enrichmentId, target, decodedLearnerStateRef);
  if (!session) notFound();

  return (
    <AdminShell active="study">
      <div className="mb-4">
        <Link className={buttonVariants({ variant: "ghost", size: "sm" })} href="/admin/lab/study">
          <ArrowLeftIcon data-icon="inline-start" />
          New session
        </Link>
      </div>
      {session.studyItemCount === 0 ? (
        // A valid enrichment with no study items is a dead-end, not a 404 (R6, U5): explain
        // the remedy (generate items / pick another enrichment) instead of a cardless graph.
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><BookOpenIcon /></EmptyMedia>
            <EmptyTitle>No study items for this enrichment yet</EmptyTitle>
            <EmptyDescription>
              This Derived Graph Layer has no study items, so there is nothing to study here. Run
              <code className="mx-1">generate-study-items</code> for enrichment
              <code className="mx-1">{session.enrichmentId}</code> in the worker, or start a new session
              on an enrichment that already has items.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <StudySession session={session} />
      )}
    </AdminShell>
  );
}
