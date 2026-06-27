"use client";

import Link from "next/link";
import { useTransition } from "react";
import { CheckIcon, RotateCcwIcon } from "lucide-react";
import { clearVerdict, setVerdict } from "@/app/admin/lab/study/actions";
import type { CalibrationSession } from "@/lib/calibrationSession";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function CalibrationList({ session }: Readonly<{ session: CalibrationSession }>) {
  const [pending, startTransition] = useTransition();
  const studyQuery = new URLSearchParams({ enrichmentId: session.enrichmentId, target: session.target.derivedNodeId });

  const markKnown = (derivedNodeId: string) => {
    startTransition(async () => {
      await setVerdict({ learnerStateRef: session.learnerStateRef, derivedNodeId, verdict: "known" });
    });
  };

  const clearKnown = (derivedNodeId: string) => {
    startTransition(async () => {
      await clearVerdict({ learnerStateRef: session.learnerStateRef, derivedNodeId });
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">Calibration for {session.target.label}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{session.rows.length} visible concepts</Badge>
            <Badge variant="secondary">{session.knownClosure.length} known by closure</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className={buttonVariants()} href={`/admin/lab/study/${encodeURIComponent(session.learnerStateRef)}?${studyQuery.toString()}`}>
              Start studying
            </Link>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        {session.rows.map((row) => (
          <Card key={row.derivedNodeId}>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-medium">{row.label}</h2>
                  {row.known ? <Badge>known</Badge> : null}
                  <Badge variant="outline">difficulty {(row.difficulty ?? 0).toFixed(2)}</Badge>
                  {row.descriptor ? <Badge variant="secondary">{row.descriptor.provenance}</Badge> : null}
                </div>
                {row.descriptor ? (
                  <p className="mt-2 text-sm text-muted-foreground">{row.descriptor.text}</p>
                ) : null}
              </div>
              {row.known ? (
                <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => clearKnown(row.derivedNodeId)}>
                  <RotateCcwIcon data-icon="inline-start" />
                  Unmark
                </Button>
              ) : (
                <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => markKnown(row.derivedNodeId)}>
                  <CheckIcon data-icon="inline-start" />
                  Mark known
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
