import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { LearnerPathExplorer } from "@/components/LearnerPathExplorer";
import { Button } from "@/components/ui/button";
import { getLearnerPathDetail } from "@/lib/learnerPaths";

export const dynamic = "force-dynamic";

export default async function LearnerPathDetailPage({
  params
}: Readonly<{ params: Promise<{ learnerPathId: string }> }>) {
  const { learnerPathId } = await params;
  const detail = await getLearnerPathDetail(learnerPathId);
  if (!detail) notFound();
  return (
    <AdminShell active="paths">
      <div className="mb-4">
        <Button variant="ghost" size="sm" render={<Link href="/admin/lab/paths" />}>
          <ArrowLeftIcon data-icon="inline-start" />
          All learner paths
        </Button>
      </div>
      <LearnerPathExplorer detail={detail} />
    </AdminShell>
  );
}
