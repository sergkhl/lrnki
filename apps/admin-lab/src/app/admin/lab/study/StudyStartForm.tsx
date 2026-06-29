"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Launches optional calibration or direct study for the chosen enrichment + target. Identity
// is mocked: the learner ref is free text — pick an existing learner or type a new one, no auth.
export function StudyStartForm({
  enrichmentId,
  targetDerivedNodeId,
  targetLabel
}: Readonly<{ enrichmentId: string; targetDerivedNodeId: string; targetLabel: string }>) {
  const router = useRouter();
  const [learnerRef, setLearnerRef] = useState("");

  const routeFor = (mode: "calibrate" | "study"): string | null => {
    const ref = learnerRef.trim();
    if (!ref) return null;
    const query = new URLSearchParams({ enrichmentId, target: targetDerivedNodeId });
    const base = `/admin/lab/study/${encodeURIComponent(ref)}`;
    return mode === "calibrate" ? `${base}/calibrate?${query.toString()}` : `${base}?${query.toString()}`;
  };

  const start = (mode: "calibrate" | "study") => {
    const route = routeFor(mode);
    if (!route) return;
    router.push(route as Route);
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        start("study");
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
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={!learnerRef.trim()} onClick={() => start("calibrate")}>
          Open calibration
        </Button>
        <Button type="submit" size="sm" disabled={!learnerRef.trim()}>
          Start studying
        </Button>
      </div>
    </form>
  );
}
