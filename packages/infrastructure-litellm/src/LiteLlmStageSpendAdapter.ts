import { isStageTag } from "@lrnki/domain-core";
import type { StageSpend, StageSpendReadPort } from "@lrnki/ports";

// Raw `/spend/tags` row shape: one row per
// request tag with a call count and aggregate spend. LiteLLM also emits its own
// `User-Agent: …` pseudo-tags and may retain stale tag names; both are excluded by
// projecting onto the closed STAGE_TAGS vocabulary (isStageTag).
type SpendTagRow = {
  individual_request_tag: string;
  log_count: number;
  total_spend: number;
};

// Reads per-stage spend from LiteLLM `/spend/tags` (ADR-0029). The application records
// time + stage tags only; cost is read live here and surfaced verbatim — never
// computed or stored. Same base-URL/auth transport as LiteLlmForcedToolClient.
export class LiteLlmStageSpendAdapter implements StageSpendReadPort {
  constructor(private readonly options: { baseUrl: string; apiKey: string; timeoutMs: number }) {}

  async readStageSpend(): Promise<StageSpend[]> {
    const url = `${this.options.baseUrl.replace(/\/$/, "")}/spend/tags`;
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${this.options.apiKey}` },
      signal: AbortSignal.timeout(this.options.timeoutMs)
    });
    if (!response.ok) {
      throw new Error(`LiteLLM /spend/tags returned ${response.status} ${response.statusText}`);
    }
    const rows = (await response.json()) as SpendTagRow[];
    return parseStageSpend(rows);
  }
}

// Project the raw payload onto STAGE_TAGS: drop User-Agent pseudo-tags and stale tags,
// keeping only join-keyable LLM stages. Exported for the deterministic adapter test.
export function parseStageSpend(rows: SpendTagRow[]): StageSpend[] {
  return rows
    .filter((row) => isStageTag(row.individual_request_tag))
    .map((row) => ({ tag: row.individual_request_tag, logCount: row.log_count, totalSpend: row.total_spend }));
}
