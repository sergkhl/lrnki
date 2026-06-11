import Link from "next/link";
import { DatabaseIcon, DatabaseZapIcon } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { listSourcesWithStats } from "@/lib/inspection";

export const dynamic = "force-dynamic";

export default async function SourceListPage() {
  const sources = await listSourcesWithStats();
  return (
    <AdminShell active="sources">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Curated sources</CardTitle>
          <CardDescription>Registered source identity, parser coverage, and extraction activity.</CardDescription>
          <CardAction>
            <Badge variant={sources ? "outline" : "destructive"}>
              {sources ? `${sources.length} sources` : "Database unavailable"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          {!sources ? (
            <Alert variant="destructive">
              <DatabaseZapIcon />
              <AlertTitle>Database unavailable</AlertTitle>
              <AlertDescription>
                Set <code className="font-mono">DATABASE_URL</code> to inspect curated sources.
              </AlertDescription>
            </Alert>
          ) : sources.length === 0 ? (
            <Empty className="min-h-72 border">
              <EmptyHeader>
                <EmptyMedia variant="icon"><DatabaseIcon /></EmptyMedia>
                <EmptyTitle>No curated sources</EmptyTitle>
                <EmptyDescription>No registered source resources are available to inspect.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Declared domain</TableHead>
                  <TableHead>Content type</TableHead>
                  <TableHead>Blocks</TableHead>
                  <TableHead>Runs</TableHead>
                  <TableHead>Content hash</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map((source) => (
                  <TableRow key={source.sourceResourceId}>
                    <TableCell className="min-w-64 whitespace-normal">
                      <Link
                        className="font-medium underline-offset-4 hover:underline"
                        href={`/admin/lab/sources/${source.sourceResourceId}`}
                      >
                        {source.title}
                      </Link>
                    </TableCell>
                    <TableCell><Badge variant="outline">{source.declaredDomain}</Badge></TableCell>
                    <TableCell>{source.contentType}</TableCell>
                    <TableCell>{source.blockCount}</TableCell>
                    <TableCell>{source.runCount}</TableCell>
                    <TableCell className="font-mono text-xs">{source.contentHash.slice(0, 16)}…</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AdminShell>
  );
}
