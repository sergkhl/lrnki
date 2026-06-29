import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { CalibrationList } from "@/components/study/CalibrationList";
import { buttonVariants } from "@/components/ui/button";
import { getCalibrationSession } from "@/lib/calibrationSession";

export const dynamic = "force-dynamic";

export default async function CalibrationPage({
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

  const session = await getCalibrationSession(enrichmentId, target, decodedLearnerStateRef);
  if (!session) notFound();

  return (
    <AdminShell active="study">
      <div className="mb-4">
        <Link className={buttonVariants({ variant: "ghost", size: "sm" })} href="/admin/lab/study">
          <ArrowLeftIcon data-icon="inline-start" />
          New session
        </Link>
      </div>
      <CalibrationList session={session} />
    </AdminShell>
  );
}
