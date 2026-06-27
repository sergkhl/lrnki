import type { ConceptIdentityDecisionView } from "@lrnki/ports";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

// Minimal read-only Admin Lab surface for published-Concept identity decisions (plan U4,
// R10). Mirrors the derived-layer "Semantic merges" view: a `merge` reads
// "survivor ← absorbed"; a `distinct`/`quarantine` lists the involved Concepts. Pure
// presentation over the finished read model (ADR-0011/ADR-0027) — no SQL, no compute.

const outcomeVariant: Record<ConceptIdentityDecisionView["outcome"], "default" | "secondary" | "destructive"> = {
  merge: "default",
  distinct: "secondary",
  quarantine: "destructive"
};

export function IdentityDecisionsTable({ decisions }: { decisions: ConceptIdentityDecisionView[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Identity decisions</CardTitle>
        <CardDescription>
          Semantic published-Concept identity resolution (ADR-0015): same-domain near-duplicates the
          cross-family adjudicator merged, kept distinct, or quarantined before this version was built.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {decisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No identity decisions were recorded for this version.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Outcome</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Concepts</TableHead>
                <TableHead className="text-right">Cosine</TableHead>
                <TableHead>Rationale</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {decisions.map((decision, index) => (
                <TableRow key={`${decision.declaredDomain}:${decision.survivorLabel ?? ""}:${decision.absorbedLabels.join(",")}:${index}`}>
                  <TableCell>
                    <Badge variant={outcomeVariant[decision.outcome]} title={decision.decidingModel}>
                      {decision.outcome}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{decision.declaredDomain}</TableCell>
                  <TableCell>
                    {decision.survivorLabel ? (
                      <span>
                        <span className="font-medium">{decision.survivorLabel}</span>
                        <span className="text-muted-foreground"> ← {decision.absorbedLabels.join(", ")}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{decision.absorbedLabels.join(" ⇄ ")}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{decision.proposingScore.toFixed(2)}</TableCell>
                  <TableCell className="max-w-[28ch] truncate text-xs text-muted-foreground italic" title={decision.rationale}>
                    {decision.rationale}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
