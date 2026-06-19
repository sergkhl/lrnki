import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { LearnerLoopReview } from "@/components/LearnerLoopReview";
import { buttonVariants } from "@/components/ui/button";
import { getLearnerLoopDetail } from "@/lib/learnerLoop";

export const dynamic = "force-dynamic";

export default async function LearnerLoopDetailPage({
  params
}: Readonly<{ params: Promise<{ learnerStateRef: string }> }>) {
  const { learnerStateRef } = await params;
  const detail = await getLearnerLoopDetail(decodeURIComponent(learnerStateRef));
  if (!detail || detail.responses.length === 0) notFound();
  return (
    <AdminShell active="learner-loop">
      <div className="mb-4">
        <Link className={buttonVariants({ variant: "ghost", size: "sm" })} href="/admin/lab/learner-loop">
          <ArrowLeftIcon data-icon="inline-start" />
          All learners
        </Link>
      </div>
      <LearnerLoopReview detail={detail} />
    </AdminShell>
  );
}
