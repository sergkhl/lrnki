"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Launches a study session for the chosen enrichment + target (U5, R1). Identity is mocked
// (KTD5): the learner ref is free text — pick an existing learner or type a new one, no auth.
// On submit it navigates to the session route with the enrichment + target as query params.
export function StudyStartForm({
  enrichmentId,
  targetDerivedNodeId,
  targetLabel
}: Readonly<{ enrichmentId: string; targetDerivedNodeId: string; targetLabel: string }>) {
  const router = useRouter();
  const [learnerRef, setLearnerRef] = useState("");

  const start = () => {
    const ref = learnerRef.trim();
    if (!ref) return;
    const query = new URLSearchParams({ enrichmentId, target: targetDerivedNodeId });
    router.push(`/admin/lab/study/${encodeURIComponent(ref)}?${query.toString()}`);
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        start();
      }}
    >
      <p className="text-sm">
        Study goal: <span className="font-medium">{targetLabel}</span>
      </p>
      <label className="text-sm font-medium" htmlFor="learner-ref">
        Learner identity (pick an existing ref or type a new one)
      </label>
      <Input
        id="learner-ref"
        value={learnerRef}
        onChange={(event) => setLearnerRef(event.target.value)}
        placeholder="e.g. demo-empty or demo-calibrated"
        className="max-w-sm"
      />
      <Button type="submit" size="sm" className="self-start" disabled={!learnerRef.trim()}>
        Start studying
      </Button>
    </form>
  );
}
