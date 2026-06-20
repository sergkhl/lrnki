import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { LearnerLoopReview } from "@/components/LearnerLoopReview";
import { buttonVariants } from "@/components/ui/button";
import { getLearnerAdaptedGraphs, getLearnerLoopDetail } from "@/lib/learnerLoop";

export const dynamic = "force-dynamic";

export default async function LearnerLoopDetailPage({
  params
}: Readonly<{ params: Promise<{ learnerStateRef: string }> }>) {
  const { learnerStateRef } = await params;
  const decodedLearnerStateRef = decodeURIComponent(learnerStateRef);
  const [detail, adaptedGraphs] = await Promise.all([
    getLearnerLoopDetail(decodedLearnerStateRef),
    getLearnerAdaptedGraphs(decodedLearnerStateRef)
  ]);
  if (!detail) notFound();
  return (
    <AdminShell active="learner-loop">
      <div className="mb-4">
        <Link className={buttonVariants({ variant: "ghost", size: "sm" })} href="/admin/lab/learner-loop">
          <ArrowLeftIcon data-icon="inline-start" />
          All learners
        </Link>
      </div>
      <LearnerLoopReview detail={detail} adaptedGraphs={adaptedGraphs ?? {
        learnerStateRef: detail.learnerStateRef,
        responseSourceSummary: detail.responseSourceSummary,
        graphs: []
      }} />
    </AdminShell>
  );
}
