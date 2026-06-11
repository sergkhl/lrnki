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
      "Allowed relations (closed set), each with a strict test — apply the test before choosing:",
      "- 'is-a': strict taxonomy ONLY. The sentence 'every <subject> is a <object>' must read as true; the object must be a broader category or kind. WRONG: 'drop function is-a ownership' (drop is part of the ownership system, not a kind of ownership). WRONG: 'pointer is-a stack and heap'. RIGHT: 'conservative replication model is-a DNA replication model'.",
      "- 'part-of': the subject is a component, member, step, or sub-mechanism of the object. Use this when a concept belongs to a system or topic area ('drop function part-of ownership').",
      "- 'uses': the subject employs or relies on the object as a mechanism or tool ('string type uses heap allocation').",
      "- 'asserted-prerequisite-of': ONLY when the source explicitly states that understanding the subject is required before the object.",
      "- 'contrasts-with': ONLY when the source explicitly contrasts or distinguishes the two concepts.",
      "- 'defined-as': the object is a literal definition string quoted from the source; never a concept.",
      "Never emit a claim whose object is the subject concept itself.",
      "Causal or motivational statements ('X gives occasion to Y', 'X leads to Y') fit NONE of these relations — emit no claim for them.",
      "If no relation in the closed set fits precisely, emit no claim; fewer precise claims beat many loose ones.",
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
