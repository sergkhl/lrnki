"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { ensureLearnerExpedition } from "@lrnki/application";
import {
  createDatabaseClient,
  PostgresEnrichmentInspectionRead,
  PostgresLearnerExpeditionStore
} from "@lrnki/infrastructure-postgres";
import { setLearnerRefCookie } from "@/lib/learnerSession";

export async function openAdminLearnerExpedition(enrichmentId: string): Promise<void> {
  if (!process.env.DATABASE_URL) redirect(`/admin/lab/enrichments/${encodeURIComponent(enrichmentId)}?learnDoor=no-target` as Route);
  const sql = createDatabaseClient();
  try {
    const result = await ensureLearnerExpedition({
      learnerStateRef: "admin",
      enrichmentId,
      enrichmentRead: new PostgresEnrichmentInspectionRead(sql),
      expeditionStore: new PostgresLearnerExpeditionStore(sql)
    });
    if (result.status === "no_target") {
      redirect(`/admin/lab/enrichments/${encodeURIComponent(enrichmentId)}?learnDoor=no-target` as Route);
    }
    await setLearnerRefCookie("admin");
    redirect(`/learn/expedition/${encodeURIComponent(enrichmentId)}` as Route);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
