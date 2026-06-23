import type {
  GroundingOrigin,
  InferredEdgeDisposition,
  PrerequisiteConceptContext,
  PrerequisiteJudgment,
  PrerequisiteJudgmentTrace
} from "@lrnki/domain-core";
import type { PrerequisiteJudgmentPort } from "@lrnki/ports";

// The judge-ready reduction of one derived node: its identity, domain, grounding
// origin (drives cross-family routing), and the evidence context the judge sees.
export type JudgeablePairingNode = {
  derivedNodeId: string;
  declaredDomain: string;
  groundingOrigin: GroundingOrigin;
  context: PrerequisiteConceptContext;
};

export type NodeJudgmentResult = {
  // One judgment per evidenced candidate, in deterministic order (deepseek class then
  // cross-family class, each in input-candidate order). Collected so the persisted
  // trace stays replay-deterministic (R8).
  judgments: PrerequisiteJudgment[];
  traces: PrerequisiteJudgmentTrace[];
  // Candidates excluded before judging because the subject or that candidate has no
  // evidence — recorded so the disposition trace still accounts for the pair (R5).
  insufficient: InferredEdgeDisposition[];
};

const hasEvidence = (context: PrerequisiteConceptContext) =>
  context.definitions.length > 0 || context.mentions.length > 0;

// The per-node enrichment primitive (plan U5/KTD6, R7): judge ONE subject node against
// a bounded list of same-domain candidates and return per-candidate judgments + traces.
// This is exactly the operation a future incremental-growth path needs ("enrich one new
// node against an existing candidate layer"), so the full-graph reshape and the
// incremental path share one boundary.
//
// Routing split (KTD2): a subject or candidate that is `llm_grounded` (DeepSeek-minted)
// is judged by the CROSS-FAMILY alias so the generator never grades its own minted
// output (ADR-0023); anchor/anchor and anchor/source_mentioned stay on the validated
// DeepSeek judge. A subject that is itself generated routes ALL its candidates
// cross-family. Within each routing class the candidate list is chunked deterministically
// by `maxCandidatesPerBatch` (KTD3) so a large domain cannot grow a single prompt
// unbounded, and the chunk's batched calls run SERIALLY here — the caller bounds
// concurrency across subjects, so at most one batched call per in-flight subject is
// ever live (R10).
export async function judgeNodeAgainstCandidates(input: {
  declaredDomain: string;
  subject: JudgeablePairingNode;
  candidates: JudgeablePairingNode[];
  prerequisiteJudge: PrerequisiteJudgmentPort;
  generatedPrerequisiteJudge: PrerequisiteJudgmentPort;
  maxCandidatesPerBatch: number;
}): Promise<NodeJudgmentResult> {
  const judgments: PrerequisiteJudgment[] = [];
  const traces: PrerequisiteJudgmentTrace[] = [];
  const insufficient: InferredEdgeDisposition[] = [];

  const insufficientFor = (candidate: JudgeablePairingNode): InferredEdgeDisposition => ({
    prerequisiteDerivedNodeId: input.subject.derivedNodeId,
    dependentDerivedNodeId: candidate.derivedNodeId,
    disposition: "insufficient_evidence"
  });

  // A subject with no evidence cannot ground any judgment: every forward candidate pair
  // is insufficient (no judge call), exactly as the per-pair path failed closed.
  if (!hasEvidence(input.subject.context)) {
    for (const candidate of input.candidates) insufficient.push(insufficientFor(candidate));
    return { judgments, traces, insufficient };
  }

  const evidenced: JudgeablePairingNode[] = [];
  for (const candidate of input.candidates) {
    if (hasEvidence(candidate.context)) evidenced.push(candidate);
    else insufficient.push(insufficientFor(candidate));
  }

  const subjectGenerated = input.subject.groundingOrigin === "llm_grounded";
  const crossFamily: JudgeablePairingNode[] = [];
  const deepseek: JudgeablePairingNode[] = [];
  for (const candidate of evidenced) {
    if (subjectGenerated || candidate.groundingOrigin === "llm_grounded") crossFamily.push(candidate);
    else deepseek.push(candidate);
  }

  // Judge one routing class: chunk deterministically, run each chunk's batched call,
  // and collect per-candidate judgments + traces in candidate order.
  const judgeClass = async (members: JudgeablePairingNode[], judge: PrerequisiteJudgmentPort) => {
    for (const chunk of chunkBy(members, input.maxCandidatesPerBatch)) {
      const result = await judge.judge({
        declaredDomain: input.declaredDomain,
        subject: input.subject.context,
        candidates: chunk.map((candidate) => candidate.context)
      });
      // The adapter returns exactly one judgment per provided candidate, in input order.
      chunk.forEach((candidate, index) => {
        const judgment = result.relations[index];
        judgments.push(judgment);
        traces.push({
          declaredDomain: input.declaredDomain,
          judgeModel: judge.model,
          a: input.subject.context,
          b: candidate.context,
          judgment
        });
      });
    }
  };

  // Deterministic class order: validated DeepSeek class first, then the cross-family
  // generated class — so the persisted trace order is stable across runs (R8).
  await judgeClass(deepseek, input.prerequisiteJudge);
  await judgeClass(crossFamily, input.generatedPrerequisiteJudge);

  return { judgments, traces, insufficient };
}

// Split a list into deterministic sorted chunks of at most `size` (KTD3). The caller
// pre-sorts members by stable derived-node id, so the chunk boundaries are reproducible.
function chunkBy<T>(items: T[], size: number): T[][] {
  const bound = Math.max(1, size);
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += bound) chunks.push(items.slice(i, i + bound));
  return chunks;
}
