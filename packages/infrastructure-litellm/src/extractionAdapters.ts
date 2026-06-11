import type {
  AdmissionDecision,
  ClaimExtractionResult,
  DiscoveredCandidate,
  ExtractedClaim,
  SourceBlock,
  StructuredDocument
} from "@lrnki/domain-core";
import type { ConceptAdmissionPort, ConceptConditionedClaimExtractionPort, ConceptDiscoveryPort } from "@lrnki/ports";
import { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import {
  conceptAdmissionSchema,
  conceptAdmissionValidator,
  conceptClaimSchema,
  conceptClaimValidator,
  conceptDiscoverySchema,
  conceptDiscoveryValidator
} from "./toolSchemas";

// LiteLLM aliases (litellm/config.yaml router model_group_alias). Production
// extraction uses DeepSeek V4 Flash with thinking disabled (AGENTS rule 5).
export const DISCOVERY_MODEL = "kg-concept-discovery";
export const ADMISSION_MODEL = "kg-concept-admission";
export const CLAIM_MODEL = "kg-claim-extraction";

function renderBlocks(blocks: SourceBlock[]): string {
  return blocks
    .map((block) => {
      const path = block.headingPath.length ? ` heading="${block.headingPath.join(" › ")}"` : "";
      return `[${block.blockId} type=${block.blockType}${path}] ${block.text}`;
    })
    .join("\n");
}

export class LiteLlmConceptDiscoveryAdapter implements ConceptDiscoveryPort {
  constructor(private readonly client: LiteLlmForcedToolClient, private readonly model: string = DISCOVERY_MODEL) {}

  async discover(input: { document: StructuredDocument; declaredDomain: string }): Promise<DiscoveredCandidate[]> {
    const system = [
      "You perform recall-oriented concept discovery for a learner-neutral concept graph.",
      "Surface every plausibly-important, independently-teachable domain concept in the source.",
      "Instruction: do not miss anything plausibly important; precision is handled by a later stage.",
      "Do NOT surface bibliography entries, author names, document metadata, or source-local variable/code identifiers as concepts.",
      "Every candidate needs at least one verbatim mention quote copied exactly from the cited block."
    ].join(" ");
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      "Source blocks:",
      renderBlocks(input.document.blocks),
      "",
      "Call submit_concept_candidates with the candidates you find."
    ].join("\n");

    const result = await this.client.call({
      model: this.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      toolName: "submit_concept_candidates",
      toolDescription: "Submit the recall-oriented set of concept candidates discovered in the source.",
      parameters: conceptDiscoverySchema,
      validator: conceptDiscoveryValidator
    });
    return result.candidates;
  }
}

export class LiteLlmConceptAdmissionAdapter implements ConceptAdmissionPort {
  constructor(private readonly client: LiteLlmForcedToolClient, private readonly model: string = ADMISSION_MODEL) {}

  async admit(input: { document: StructuredDocument; declaredDomain: string; candidates: DiscoveredCandidate[] }): Promise<AdmissionDecision[]> {
    const system = [
      "You perform precision-first concept admission for an authoritative learner-neutral concept graph.",
      "Classify each candidate as 'core', 'optional', 'reject', or 'quarantine'. Be strict: in a typical source only a MINORITY of candidates are 'core'.",
      "A 'core' concept must pass ALL of these: (1) a domain glossary or textbook index would list it as a key term; (2) it is independently teachable as its own unit, not merely a step, property, or restatement of another concept; (3) it is durable and reusable across sources, not specific to this document's examples or narration.",
      "Mark 'optional' when a candidate is a real but secondary/granular facet of a core concept (e.g. a single sub-step, a property, or a narrower special case) — useful but not its own authoritative node.",
      "Reject (zero tolerance for admitting these as core): bibliography entries; document or section metadata; section/subsection HEADINGS turned into pseudo-concepts (e.g. 'Pushing onto the Stack', 'Ownership and Functions'); procedural micro-steps; and source-local implementation details (specific variable names, example-only identifiers).",
      "A useful test: if the candidate's label reads like a how-to step or a section title rather than a noun a learner could look up, it is NOT core.",
      "Quarantine genuinely ambiguous or homographic candidates rather than guessing.",
      "Give terse reason codes (e.g. 'glossary_key_term', 'durable_core', 'section_heading', 'procedural_step', 'facet_of_core', 'source_local_detail', 'too_generic', 'bibliographic')."
    ].join(" ");
    const candidateList = input.candidates
      .map((candidate) => `- ${candidate.candidateKey}: "${candidate.canonicalLabel}" (aliases: ${candidate.aliases.join(", ") || "none"}); evidence: ${candidate.mentions.map((mention) => `"${mention.evidenceQuote}"`).slice(0, 3).join(" | ")}`)
      .join("\n");
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      "Candidates to classify:",
      candidateList,
      "",
      "Call submit_admission_decisions with exactly one decision per candidateKey."
    ].join("\n");

    const result = await this.client.call({
      model: this.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      toolName: "submit_admission_decisions",
      toolDescription: "Submit one precision-first admission decision per candidate.",
      parameters: conceptAdmissionSchema,
      validator: conceptAdmissionValidator
    });
    return result.decisions;
  }
}

export class LiteLlmClaimExtractionAdapter implements ConceptConditionedClaimExtractionPort {
  constructor(private readonly client: LiteLlmForcedToolClient, private readonly model: string = CLAIM_MODEL) {}

  async extract(input: {
    document: StructuredDocument;
    declaredDomain: string;
    subject: { candidateKey: string; canonicalLabel: string };
    admittedConcepts: { candidateKey: string; canonicalLabel: string }[];
    evidenceNeighborhood: SourceBlock[];
  }): Promise<ClaimExtractionResult> {
    const system = [
      "You extract typed, evidence-backed claims for one subject concept only.",
      "HARD EXCLUSION — apply this to the evidence sentence BEFORE choosing any relation:",
      "If the link between subject and object in the quoted sentence is causal, genetic-origin, or motivational, the statement fits NO relation in the closed set. Emit no claim. Do NOT retype it as 'uses', 'part-of', 'is-a', or 'contrasts-with'.",
      "Causal/origin connectives that trigger this exclusion include: 'gives occasion to', 'occasions', 'is the (necessary) consequence of', 'is the effect of', 'is not the effect of', 'arises from', 'leads to', 'in consequence of', 'owing to', 'encourages', 'derives from'.",
      "WRONG: from 'it is this same trucking disposition which originally gives occasion to the division of labour', emitting 'Division of Labour uses Propensity to Exchange' or 'Propensity to Exchange part-of Division of Labour' — both are causal-origin statements wearing a relation costume. The correct output for that sentence is NO claim.",
      "Allowed relations (closed set), each with a strict test — apply the test before choosing:",
      "- 'is-a': strict taxonomy ONLY. The sentence 'every <subject> is a <object>' must read as true; the object must be a broader category or kind. WRONG: 'drop function is-a ownership' (drop is part of the ownership system, not a kind of ownership). WRONG: 'pointer is-a stack and heap'. RIGHT: 'conservative replication model is-a DNA replication model'.",
      "- 'part-of': the subject is a structural component, member, step, or sub-mechanism of the object. The test: 'the <object> consists of / includes the <subject>' must read as true ('drop function part-of ownership'). Causing, enabling, or motivating the object is NOT membership.",
      "- 'uses': the subject actively employs the object as a tool or mechanism while it operates ('string type uses heap allocation'). The test: 'the <subject> works by employing the <object>'. Being caused by, arising from, or being motivated by the object is NOT using it.",
      "- 'asserted-prerequisite-of': ONLY when the source explicitly states that understanding the subject is required before the object.",
      "- 'contrasts-with': ONLY when the source explicitly contrasts or distinguishes the two concepts as alternatives or opposites. Denying that one concept caused another ('X is not the effect of Y') is a causal statement, not a contrast.",
      "- 'defined-as': the object is a literal definition string quoted from the source; never a concept.",
      "Never emit a claim whose object is the subject concept itself.",
      "If no relation in the closed set fits precisely, emit no claim; fewer precise claims beat many loose ones.",
      "For every claim, classify evidenceLinkNature honestly from the quoted sentence alone. Claims whose evidence link is 'causal-or-motivational' are discarded by the system, so label them truthfully rather than forcing a structural reading.",
      "Concept objects MUST be one of the admitted concepts listed; reference them by candidateKey. If you need a concept that is not admitted, do NOT invent a claim — record it under missingConceptProposals instead.",
      "Every claim requires a verbatim evidence quote copied exactly from a cited block. No quote, no claim."
    ].join("\n");
    const admitted = input.admittedConcepts
      .map((concept) => `- ${concept.candidateKey}: "${concept.canonicalLabel}"`)
      .join("\n");
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      `Subject concept: ${input.subject.candidateKey} = "${input.subject.canonicalLabel}".`,
      "Admitted concepts available as claim objects:",
      admitted,
      "",
      "Evidence blocks (quote verbatim from these):",
      renderBlocks(input.evidenceNeighborhood),
      "",
      "Call submit_concept_claims. Each claim's subject is the subject concept above."
    ].join("\n");

    const result = await this.client.call({
      model: this.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      toolName: "submit_concept_claims",
      toolDescription: "Submit typed evidence-backed claims for the subject concept, plus any missing-concept proposals.",
      parameters: conceptClaimSchema,
      validator: conceptClaimValidator
    });

    const admittedKeys = new Set(input.admittedConcepts.map((concept) => concept.candidateKey));
    const claims: ExtractedClaim[] = [];
    for (const claim of result.claims) {
      // Symbolic gate: the model labels how the evidence sentence links the two
      // concepts; causal/motivational links fit no relation in the closed
      // registry (ADR-0016 defers `causes`), so they are dropped fail-closed.
      if (claim.evidenceLinkNature === "causal-or-motivational") continue;
      if (claim.objectKind === "concept") {
        // Concept objects must reference an admitted concept; otherwise it is not a valid claim here.
        if (!claim.objectCandidateKey || !admittedKeys.has(claim.objectCandidateKey)) continue;
        if (claim.predicate === "defined-as") continue; // defined-as is literal-only
        claims.push({
          subjectCandidateKey: input.subject.candidateKey,
          predicate: claim.predicate,
          object: { kind: "concept", candidateKey: claim.objectCandidateKey },
          evidence: claim.evidence,
          confidence: claim.confidence
        });
      } else {
        if (claim.objectLiteralValue === null || claim.objectLiteralValue.trim() === "") continue;
        if (claim.predicate !== "defined-as") continue; // only defined-as takes a literal object
        claims.push({
          subjectCandidateKey: input.subject.candidateKey,
          predicate: claim.predicate,
          object: { kind: "literal", value: claim.objectLiteralValue },
          evidence: claim.evidence,
          confidence: claim.confidence
        });
      }
    }

    return {
      claims,
      proposals: result.missingConceptProposals.map((proposal) => ({
        proposedLabel: proposal.proposedLabel,
        rationale: proposal.rationale,
        evidence: proposal.evidenceBlockId && proposal.evidenceQuote
          ? { blockId: proposal.evidenceBlockId, evidenceQuote: proposal.evidenceQuote }
          : undefined
      }))
    };
  }
}
