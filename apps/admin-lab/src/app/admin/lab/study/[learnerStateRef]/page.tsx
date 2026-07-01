import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { StudySession } from "@/components/study/StudySession";
import { buttonVariants } from "@/components/ui/button";
import { getStudySession } from "@/lib/studySession";

export const dynamic = "force-dynamic";

// Study session surface. Server-loads getStudySession for the picked enrichment, target,
// and learner, then renders the client driver. Each response revalidates this path, so
// the loader re-folds mastery and re-classifies and the driver re-renders with the advanced
// frontier. Read + projection only — the page never opens a graph write port.
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
      <StudySession session={session} />
    </AdminShell>
  );
}
