import type {
  AdmissionProposal,
  ClaimEntailmentJudgment,
  ClaimExtractionFeedback,
  ClaimExtractionResult,
  DiscoveredCandidate,
  ExtractedClaim,
  RelationPredicate,
  SourceBlock,
  StructuredDocument
} from "@lrnki/domain-core";
import { evidenceQuoteMatches, extractableBlocks } from "@lrnki/domain-core";
import type { CoreSelectionReasonCode } from "@lrnki/domain-core";
import type {
  ClaimEntailmentJudgmentPort,
  ConceptAdmissionPort,
  ConceptConditionedClaimExtractionPort,
  ConceptDiscoveryPort
} from "@lrnki/ports";
import { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import {
  claimEntailmentJudgmentSchema,
  claimEntailmentJudgmentValidator,
  conceptAdmissionSchemaForCandidateKeys,
  conceptAdmissionValidator,
  conceptCoreSelectionSchemaForCandidateKeys,
  conceptCoreSelectionValidator,
  conceptClaimSchema,
  conceptClaimValidator,
  conceptDiscoverySchema,
  conceptDiscoveryValidator,
  definitionEntailmentJudgmentSchema,
  definitionEntailmentJudgmentValidator
} from "./toolSchemas";

// LiteLLM aliases (litellm/config.yaml router model_group_alias). Production
// extraction uses DeepSeek V4 Flash with thinking disabled (AGENTS rule 5).
export const DISCOVERY_MODEL = "kg-concept-discovery";
export const ADMISSION_MODEL = "kg-concept-admission";
export const CLAIM_MODEL = "kg-claim-extraction";
// Independent second model for the semantic claim-entailment judge (ADR-0020).
// A different family than the extractor (Mistral Small vs DeepSeek) so the judge
// is not just re-running the same model's reasoning over its own output.
export const CLAIM_ENTAILMENT_JUDGE_MODEL = "kg-oracle-judge";

// Per-predicate strict entailment test, shared by the judge. These are the SAME
// natural-language tests the extraction prompt applies; the judge re-checks them
// against the verbatim evidence so a wrong-relation/wrong-direction claim that
// slipped past the extractor's self-report is caught semantically rather than by
// a hardcoded surface matcher (AGENTS rule 16).
const PREDICATE_ENTAILMENT_TEST: Record<RelationPredicate, string> = {
  "is-a": "'is-a' (strict taxonomy): the evidence must assert that the SUBJECT is a kind/type/category-member of the OBJECT, i.e. 'every <subject> is a <object>' reads as true. A list that places the subject among instances of the object's category counts (e.g. 'three models: conservative, semi-conservative, dispersive' entails 'semi-conservative is-a model'). Component-of, causes, or uses do NOT count.",
  "part-of": "'part-of': the evidence must assert that the SUBJECT is a structural component, member, step, or sub-mechanism of the OBJECT — 'the <object> consists of / includes / contains the <subject>' reads as true. Causing, enabling, or motivating the object is NOT membership.",
  "uses": "'uses': the evidence must assert that the SUBJECT actively employs the OBJECT as a tool or mechanism while it operates — 'the <subject> works by employing the <object>'. Being caused by, arising from, or motivated by the object is NOT using it.",
  "asserted-prerequisite-of": "'asserted-prerequisite-of': the evidence must EXPLICITLY state that understanding the SUBJECT is required before the OBJECT. Mere topical ordering is not enough.",
  "contrasts-with": "'contrasts-with': the evidence must explicitly contrast or distinguish the SUBJECT and OBJECT as alternatives or opposites. Denying causation ('X is not the effect of Y') is not a contrast.",
  "defined-as": "'defined-as': the evidence must define the SUBJECT as the given literal using definitional language ('is', 'means', 'refers to')."
};

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
      "Return one source label per candidate. Do not propose aliases or group qualified variants, subsets, editions, or specialized forms under a broader candidate; alias identity is not a discovery decision.",
      "Do NOT surface bibliography entries, author names, document metadata, or source-local variable/code identifiers as concepts.",
      "Every candidate needs at least one verbatim mention quote copied exactly from the cited block."
    ].join(" ");
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      "Source blocks:",
      renderBlocks(extractableBlocks(input.document.blocks)),
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

  async admit(input: { document: StructuredDocument; declaredDomain: string; candidates: DiscoveredCandidate[] }): Promise<AdmissionProposal[]> {
    const system = [
      "You perform precision-first concept admission for an authoritative learner-neutral concept graph.",
      "Classify each candidate as 'core', 'optional', 'reject', or 'quarantine'. Be strict: in a typical source only a MINORITY of candidates are 'core'.",
      "CORE CONCEPT ELIGIBILITY has three independent tests. A candidate is core only when ALL THREE pass with exact source evidence:",
      "(1) standaloneLearningObjective: a learner could study and be assessed on this as its own objective. It is not reducible to a role, component, property, API name, operation name, or vocabulary item inside a broader concept.",
      "A candidate label must name a CONCEPT (a noun phrase), not assert a PROPOSITION. A label that states a full claim — e.g. a chapter title such as 'Division of Labour Limited by the Extent of the Market', or any 'X is/depends on/is limited by/is determined by Y' assertion — is a claim, not a concept; reject it and rely on the underlying noun phrase ('Division of Labour') as the concept instead. Use reason code 'proposition_or_claim_label'.",
      "(2) establishedDomainMeaning: the source uses it as a coherent concept with an established meaning in the Declared Domain, not as narration, an improvised phrase, or a source-local composite.",
      "(3) organizingPower: the source demonstrates at least TWO DISTINCT substantive explanatory aspects or relationships organized by the concept. Return each aspect separately with its own verbatim evidence.",
      "Classify each organizing aspect's nature honestly. 'motivation-or-example' does not count toward organizing power and is discarded by the application boundary.",
      "Both organizing aspects must directly explain the candidate itself. A problem it motivates, a consequence it causes, or a teaser for later material is not a second aspect of the candidate.",
      "Each organizing aspect must cite a different evidence reference. Do not reuse the same blockId + evidenceQuote for two aspects; the application discards duplicate references and will fail the criterion closed.",
      "The selected source must teach enough about the candidate to support assessment. Domain knowledge that the source merely mentions or promises to explain later remains optional.",
      "A mechanism or operation is not automatically optional: it may be core when it passes all three tests. Grammatical form never decides eligibility.",
      "Use 'optional' for real, evidence-supported domain knowledge useful for explaining a core concept but not independently eligible.",
      "Use 'reject' for headings, examples, malformed composites, bibliography or document metadata, and source-local details that are not durable domain knowledge.",
      "Use 'quarantine' for genuine identity or meaning ambiguity.",
      "Do not silently make exceptions for concise sources or concepts that seem foundational. If this source cannot evidence all three tests, the candidate is not core in this run.",
      "For every candidate propose one precise canonical label. Keep the discovered label if already precise. You may clarify a vague surface label without broadening or changing its evidenced meaning: for example 'Move' may become 'Rust move semantics'. Never merge candidates.",
      "Reject an invented umbrella or conjunction label such as 'Memory and Allocation' unless the source itself establishes that exact coherent concept; prefer a precise established label or keep it optional.",
      "Examples: 'Ownership' may be core; 'Owner' is normally an optional role within ownership. 'Clone' and 'drop' are normally optional operation names unless the source independently establishes broader teachable concepts with two substantive aspects.",
      "Quarantine genuinely ambiguous or homographic candidates rather than guessing.",
      "Every evidenceQuote must be copied verbatim from its blockId. The application verifies every positive criterion and derives the effective tier fail-closed.",
      "Keep each rationale to one terse sentence. Return at most two evidence quotes for each of the first two criteria and at most three organizing aspects.",
      "Give terse reason codes (e.g. 'standalone_objective', 'established_domain_meaning', 'organizes_multiple_aspects', 'role_of_broader_concept', 'operation_of_broader_concept', 'section_heading', 'malformed_composite', 'source_local_detail', 'too_generic', 'bibliographic')."
    ].join(" ");
    const allCandidateLabels = input.candidates
      .map((candidate) => `- ${candidate.candidateKey}: "${candidate.canonicalLabel}"`)
      .join("\n");
    type ToolAdmissionProposal = Omit<AdmissionProposal, "coreSelected" | "selectionReasonCode">;
    const decisions: ToolAdmissionProposal[] = [];
    for (let start = 0; start < input.candidates.length; start += ADMISSION_BATCH_SIZE) {
      const batch = input.candidates.slice(start, start + ADMISSION_BATCH_SIZE);
      const candidateList = batch
        .map((candidate) => `- ${candidate.candidateKey}: "${candidate.canonicalLabel}"; evidence: ${candidate.mentions.map((mention) => `"${mention.evidenceQuote}"`).slice(0, 3).join(" | ")}`)
        .join("\n");
      const user = [
        `Declared domain: ${input.declaredDomain}.`,
        "All discovered candidates (context only; do not decide candidates outside the batch):",
        allCandidateLabels,
        "",
        "Candidate batch to classify:",
        candidateList,
        "",
        "Source blocks for criterion evidence:",
        renderBlocks(extractableBlocks(input.document.blocks)),
        "",
        "Call submit_admission_decisions with exactly one decision for each candidateKey in the batch and no others."
      ].join("\n");

      const result = await this.client.call({
        model: this.model,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        toolName: "submit_admission_decisions",
        toolDescription: "Submit one precision-first admission decision per candidate in the requested batch.",
        parameters: conceptAdmissionSchemaForCandidateKeys(batch.map((candidate) => candidate.candidateKey)),
        validator: conceptAdmissionValidator
      });
      const batchKeys = new Set(batch.map((candidate) => candidate.candidateKey));
      const counts = new Map<string, number>();
      for (const decision of result.decisions) {
        if (batchKeys.has(decision.candidateKey)) counts.set(decision.candidateKey, (counts.get(decision.candidateKey) ?? 0) + 1);
      }
      decisions.push(...result.decisions.filter((decision) => batchKeys.has(decision.candidateKey) && counts.get(decision.candidateKey) === 1));
    }

    const individuallyEligible = decisions.filter((decision) =>
      decision.tier !== "quarantine" &&
      decision.standaloneLearningObjective.passed &&
      decision.establishedDomainMeaning.passed &&
      decision.organizingPower.passed
    );
    if (individuallyEligible.length === 0) {
      return decisions.map((decision) => ({
        ...decision,
        coreSelected: false,
        selectionReasonCode: "failed_model_eligibility"
      }));
    }

    // blockId -> heading path, so the selector can see WHERE a candidate's
    // evidence sits (e.g. a "5.2 Case Study" section signals illustrative-only
    // treatment that must be demoted, not substantive teaching).
    const blockHeading = new Map(input.document.blocks.map((block) => [block.blockId, block.headingPath] as const));
    const headingFor = (blockId: string): string => {
      const path = blockHeading.get(blockId);
      return path && path.length ? path.join(" › ") : "(no heading)";
    };
    const selectionUser = [
      `Declared domain: ${input.declaredDomain}.`,
      "You are performing source-level Core Set Selection after individual eligibility review.",
      "Passing individual eligibility is necessary but not sufficient for core.",
      "Select a small but sufficient non-redundant set that preserves the source's principal explanatory structure.",
      "The result must retain enough distinct concepts to express the central mechanism, model, evidence, contrasts, or constraints taught by the source; a single top-level topic is usually insufficient.",
      "A broader concept and its key mechanism, model, or landmark experiment may all be core when they answer different learner questions and each receives substantive treatment.",
      "Keep a candidate named by an explicit source learning objective when the source treats it substantively.",
      "Demote narrow facets, incidental supporting mechanisms, examples used only for illustration, pseudo-concepts, headings, and labels whose teaching is genuinely duplicated by another selected candidate.",
      "Demote any proposition-shaped label that asserts a full claim rather than naming a concept (e.g. 'Division of Labour Limited by the Extent of the Market', or any 'X is/depends on/is limited by Y' title). The underlying noun phrase is the concept; the proposition is a claim. Use reasonCode 'pseudo_concept_or_heading'.",
      "Demote generic graph-role vocabulary such as 'Concept', 'Educational Concept', 'Node', 'Edge', or bare 'Relationship' unless the source explicitly teaches that notion as an independent learning objective. A method paper saying it extracts concepts as nodes does not teach Educational Concept as a core concept.",
      "CRITICAL — illustrative-example demotion: read each candidate's evidence quotes and the heading they come from. Demote any candidate whose substantive evidence comes only from the source's OWN illustrative output, worked example, or case study (e.g. a method paper that merely lists 'Dynamic Programming' or 'Greedy Algorithms' as nodes in its §5 case-study graph). Such a candidate is a vehicle for demonstrating the source's contribution, not a concept this source teaches. The heading path is the strongest signal: evidence drawn only from a case-study / example / evaluation / demo section is illustrative.",
      "Do not demote a candidate merely because it is part of, used by, or evidence for a broader concept.",
      "Do not keep a candidate merely because it is independently teachable in the wider domain; this selected source must treat it substantively.",
      "There is no fixed count target, but do not decompose one lesson into vocabulary-sized core concepts.",
      "Calibration examples: ownership and move semantics can both be core, while owner/drop/clone remain supporting vocabulary; DNA replication, its accepted replication model, and the experiment establishing that model can all be core, while individual isotopes and band positions remain optional.",
      "For every selection return the final precise canonical label. Domain-qualify vague labels such as 'Move' as 'Rust move semantics'; do not preserve section-style labels such as 'Ownership and Functions' as Concepts.",
      "",
      "Individually eligible candidates (with verbatim source evidence and the heading each quote came from):",
      ...individuallyEligible.map((decision) => [
        `- ${decision.candidateKey}: discovered="${input.candidates.find((candidate) => candidate.candidateKey === decision.candidateKey)?.canonicalLabel ?? decision.candidateKey}", proposed="${decision.proposedCanonicalLabel}"`,
        `  standalone: ${decision.standaloneLearningObjective.rationale}`,
        ...decision.standaloneLearningObjective.evidence.map((evidence) => `  standalone evidence [${headingFor(evidence.blockId)}]: "${evidence.evidenceQuote}"`),
        ...decision.organizingPower.aspects.map((aspect) => `  aspect (${aspect.nature}) [${headingFor(aspect.evidence.blockId)}]: ${aspect.summary} — "${aspect.evidence.evidenceQuote}"`)
      ].join("\n")),
      "",
      "Call submit_core_selection exactly once for every listed candidate."
    ].join("\n");
    const selectionResult = await this.client.call({
      model: this.model,
      messages: [
        {
          role: "system",
          content: "You perform precision-first source-level Core Set Selection for a learner-neutral graph. Keep a small but explanatorily sufficient, non-redundant set of durable learning concepts."
        },
        { role: "user", content: selectionUser }
      ],
      toolName: "submit_core_selection",
      toolDescription: "Select or demote every individually eligible candidate at source level.",
      parameters: conceptCoreSelectionSchemaForCandidateKeys(individuallyEligible.map((decision) => decision.candidateKey)),
      validator: conceptCoreSelectionValidator
    });
    const selectionCounts = new Map<string, number>();
    for (const selection of selectionResult.selections) {
      selectionCounts.set(selection.candidateKey, (selectionCounts.get(selection.candidateKey) ?? 0) + 1);
    }
    const selectionByKey = new Map(
      selectionResult.selections
        .filter((selection) => selectionCounts.get(selection.candidateKey) === 1)
        .map((selection) => [selection.candidateKey, selection] as const)
    );
    const individuallyEligibleKeys = new Set(individuallyEligible.map((decision) => decision.candidateKey));

    return decisions.map((decision) => {
      if (!individuallyEligibleKeys.has(decision.candidateKey)) {
        return {
          ...decision,
          coreSelected: false,
          selectionReasonCode: "failed_model_eligibility" as const
        };
      }
      const selection = selectionByKey.get(decision.candidateKey);
      return {
        ...decision,
        proposedCanonicalLabel: selection?.canonicalLabel ?? decision.proposedCanonicalLabel,
        coreSelected: selection?.selected ?? false,
        selectionReasonCode: (selection?.reasonCode ?? "missing_core_selection") as CoreSelectionReasonCode
      };
    });
  }
}

const ADMISSION_BATCH_SIZE = 5;

export class LiteLlmClaimExtractionAdapter implements ConceptConditionedClaimExtractionPort {
  constructor(private readonly client: LiteLlmForcedToolClient, private readonly model: string = CLAIM_MODEL) {}

  async extract(input: {
    document: StructuredDocument;
    declaredDomain: string;
    subject: { candidateKey: string; canonicalLabel: string; aliases: string[] };
    admittedConcepts: { candidateKey: string; canonicalLabel: string; aliases: string[] }[];
    evidenceNeighborhood: SourceBlock[];
    feedback?: ClaimExtractionFeedback;
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
      "Always scan the evidence neighborhood for explicit definition sentences before considering concept-to-concept relations. RIGHT: from 'Ownership is a set of rules that govern how a Rust program manages memory', emit Ownership defined-as the literal 'a set of rules that govern how a Rust program manages memory'. The literal should be a faithful, concise definition GROUNDED IN the evidence quote — you may smooth wording, resolve apposition, or normalise word order, but never add meaning the quote does not support. RIGHT: from 'a discrepancy known as the generalization gap', define 'generalization gap' as 'the discrepancy between ...' even though the quote phrases it as apposition.",
      "DIRECTION GATE — classify evidenceDirection from the quoted sentence independently of predicate. The fixed subject concept must occupy the subject role in the relation:",
      "- is-a requires subject-is-kind-of-object.",
      "- part-of requires subject-is-part-of-object. If the evidence says the object is inside the subject, report object-is-part-of-subject and emit no claim.",
      "- uses requires subject-uses-object. If the evidence says the object/framework uses the subject/signal, report object-uses-subject and emit no claim.",
      "- asserted-prerequisite-of requires subject-prerequisite-of-object.",
      "- defined-as requires subject-defined-by-literal.",
      "Never reverse a sentence to manufacture a claim for the current subject. A later concept-conditioned call can extract the correctly directed claim for the other subject.",
      "For a given subject/object pair choose at most ONE of is-a, part-of, or uses. If two seem plausible, emit neither.",
      "Never emit a symmetric pair: if you emit '<subject> part-of <object>' do not also emit '<object> part-of <subject>'; the same holds for is-a and asserted-prerequisite-of. These relations are one-directional.",
      "The evidence must lexically state the selected relation in the claimed direction: is-a needs explicit category language; part-of needs explicit membership/component language; uses needs an active use/employ/leverage verb with the subject as actor. Mere co-occurrence, support, signal-for-inference, or node/edge listing is insufficient.",
      "For defined-as, the quote must explicitly name the subject and state its meaning (via a copula, apposition, 'means', 'refers to', 'known as', or an equivalent definitional construction). The literal value must be entailed by the quote, but need NOT be a verbatim substring of it — a downstream semantic judge checks the definition against the evidence.",
      "WRONG: 'Rust move semantics is-a Rust ownership system'; move semantics is not a kind of ownership system. WRONG: 'DNA double helix uses DNA replication'; replication operates on or uses the double helix, not vice versa.",
      "WRONG: 'Semantic Signal uses Instructor-Aligned KG'; the framework uses the signal. For the Semantic Signal subject call, emit no reversed uses claim.",
      "Never emit a claim whose object is the subject concept itself.",
      "If no relation in the closed set fits precisely, emit no claim; fewer precise claims beat many loose ones.",
      "For every claim, classify evidenceLinkNature and evidenceDirection honestly from the quoted sentence alone. The application rejects any predicate/nature/direction mismatch.",
      "Concept objects MUST be one of the admitted concepts listed; reference them by candidateKey. If you need a concept that is not admitted, do NOT invent a claim — record it under missingConceptProposals instead.",
      "Every concept-to-concept claim needs at least one verbatim quote that explicitly names BOTH the fixed subject concept (or listed alias) and the object concept (or listed alias). Do not rely on pronouns, implied subjects, or broad phrases such as 'dependency inference'.",
      "Every claim requires a verbatim evidence quote copied exactly from a cited block. No quote, no claim."
    ].join("\n");
    const admitted = input.admittedConcepts
      .map((concept) => `- ${concept.candidateKey}: "${concept.canonicalLabel}" (exact aliases: ${renderAliases(concept.aliases)})`)
      .join("\n");
    const endpointExplicitBlocks = input.evidenceNeighborhood.filter((block) =>
      mentionsAlias(block.text, input.subject.aliases) &&
      input.admittedConcepts.some((concept) =>
        concept.candidateKey !== input.subject.candidateKey && mentionsAlias(block.text, concept.aliases)
      )
    );
    const retryFeedback = input.feedback
      ? [
          "",
          "This is one bounded retry after the previous attempt produced no verified claims.",
          "Do not repeat an unchanged rejected proposal. Correct its predicate, direction, endpoints, or evidence, or omit it.",
          "Previous rejected proposals:",
          ...input.feedback.rejectedClaims.map((claim) =>
            `- ${claim.predicate} -> ${renderClaimObject(claim.object)}; rejected because: ${claim.boundaryReasonCodes.join(", ") || "unspecified"}; evidence: ${claim.evidence.map((item) => `"${item.evidenceQuote}"`).join(" | ") || "none"}`
          )
        ]
      : [];
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      `Subject concept: ${input.subject.candidateKey} = "${input.subject.canonicalLabel}".`,
      `Subject exact aliases: ${renderAliases(input.subject.aliases)}.`,
      "Admitted concepts available as claim objects:",
      admitted,
      "",
      "Evidence blocks (quote verbatim from these):",
      renderBlocks(input.evidenceNeighborhood),
      "",
      "Endpoint-explicit evidence candidates (prefer these when they state a valid relation in the required direction):",
      endpointExplicitBlocks.length > 0 ? renderBlocks(endpointExplicitBlocks) : "(none)",
      ...retryFeedback,
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
          evidenceLinkNature: claim.evidenceLinkNature,
          evidenceDirection: claim.evidenceDirection,
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
          evidenceLinkNature: claim.evidenceLinkNature,
          evidenceDirection: claim.evidenceDirection,
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
          : undefined,
        extractionAttempt: input.feedback ? 2 : 1
      }))
    };
  }
}

// Semantic claim-entailment judge (ADR-0020). Mirrors the prerequisite-judgment
// adapter: forced named tool, temp 0, one bounded judgment per concept claim.
// The judge sees the two concept labels (+aliases), the typed relation and its
// strict test, and the already-verbatim evidence quotes. It decides whether the
// evidence actually asserts that relation in that direction. Fail closed: a
// ungrounded `entailingSpan` is treated as not-entailed so the judge cannot
// "support" a claim with text that is not in the cited evidence. Grounding uses
// the same formatting-noise normalization as the deterministic evidence floor.
export class LiteLlmClaimEntailmentJudgmentAdapter implements ClaimEntailmentJudgmentPort {
  readonly model: string;
  constructor(private readonly client: LiteLlmForcedToolClient, model: string = CLAIM_ENTAILMENT_JUDGE_MODEL) {
    this.model = model;
  }

  async judge(input: {
    declaredDomain: string;
    subject: { canonicalLabel: string; aliases: string[] };
    predicate: RelationPredicate;
    object: { canonicalLabel: string; aliases: string[] };
    evidenceQuotes: string[];
  }): Promise<ClaimEntailmentJudgment> {
    const system = [
      "You judge whether quoted source evidence ACTUALLY ASSERTS a specific typed relation between two domain concepts, for a learner-neutral concept graph.",
      "The evidence quotes are already verified verbatim from the source. Judge ONLY what the quotes assert — do not use outside knowledge to fill gaps.",
      "Real prose asserts relations through pronouns, apposition, lists, passive voice, and synonym verbs; do not require a fixed surface phrasing. Judge meaning, not wording.",
      "Be precision-first. Return entailed=false when the quotes only co-mention the concepts, assert a DIFFERENT relation, assert the relation in the REVERSE direction, or merely relate them causally/motivationally.",
      "The relation has a fixed direction: SUBJECT then OBJECT. A correct relation stated with the roles reversed is NOT entailed for this claim.",
      "When entailed=true, copy the minimal exact sub-quote that carries the relation into entailingSpan; it must be a verbatim substring of one provided quote. When entailed=false, return an empty entailingSpan."
    ].join("\n");
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      `Subject concept: "${input.subject.canonicalLabel}" (aliases: ${renderAliases(input.subject.aliases)}).`,
      `Object concept: "${input.object.canonicalLabel}" (aliases: ${renderAliases(input.object.aliases)}).`,
      `Claimed relation: ${input.subject.canonicalLabel} ${input.predicate} ${input.object.canonicalLabel}.`,
      `Relation test: ${PREDICATE_ENTAILMENT_TEST[input.predicate]}`,
      "",
      "Verbatim evidence quotes:",
      ...input.evidenceQuotes.map((quote, index) => `[${index + 1}] "${quote}"`),
      "",
      "Call submit_claim_entailment_judgment: does the evidence assert this relation in this direction between these two concepts?"
    ].join("\n");

    const result = await this.client.call({
      model: this.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      toolName: "submit_claim_entailment_judgment",
      toolDescription: "Submit whether the verbatim evidence entails the claimed typed relation in the claimed direction.",
      parameters: claimEntailmentJudgmentSchema,
      validator: claimEntailmentJudgmentValidator
    });

    return groundedJudgment(result, input.evidenceQuotes);
  }

  // Definition entailment for a `defined-as` literal. The literal is model-authored
  // PARAPHRASE, not a source substring, so no surface matcher can verify it (the old
  // deterministic `evidence_does_not_lexically_entail_definition` gate was a
  // false-negative machine, AGENTS rule 16). The judge decides whether the verbatim
  // evidence actually states this meaning for the subject. Same fail-closed span
  // grounding: `entailingSpan` must match a provided quote under the deterministic
  // evidence normalizer.
  async judgeDefinition(input: {
    declaredDomain: string;
    subject: { canonicalLabel: string; aliases: string[] };
    definition: string;
    evidenceQuotes: string[];
  }): Promise<ClaimEntailmentJudgment> {
    const system = [
      "You judge whether quoted source evidence ACTUALLY DEFINES a domain concept as a given meaning, for a learner-neutral concept graph.",
      "The evidence quotes are already verified verbatim from the source. Judge ONLY what the quotes assert — do not use outside knowledge to fill gaps.",
      "The candidate definition is a faithful PARAPHRASE, not a verbatim copy; real prose defines through apposition ('—a discrepancy known as X'), reversed order, copulas, and synonyms. Judge meaning, not wording: do not require the definition string to appear verbatim.",
      "Make TWO independent decisions. First classify subjectMatch: exact_or_interchangeable only when the quotes identify the requested subject itself; qualified_variant when they identify a narrower, broader, suffixed, or specialized form (for example 'MLE-bench lite' is not 'MLE-bench'); different_or_absent when they define another referent or never identify the requested subject.",
      "For subjectSpan, copy the minimal exact sub-quote that identifies the subject. An anonymous noun such as 'an agent' does NOT identify a requested subject named 'graph-based search framework'. Do not infer subject identity from document context absent from the quotes.",
      "Negative example: requested subject 'graph-based search framework', quote 'We consider an agent that operates by searching a directed graph' => subjectMatch=different_or_absent, because the quote identifies only an anonymous agent and never links it to the requested term.",
      "Qualified example: requested subject 'MLE-bench', quote 'MLE-bench lite—a curated subset' => subjectMatch=qualified_variant, because the suffixed subset is not interchangeable with the full benchmark.",
      "Second set definitionEntailed=true only when the quotes state the candidate meaning without adding, narrowing, or distorting it, independent of whether the correct subject was identified.",
      "For entailingSpan, copy the minimal exact sub-quote that carries the definition. Both spans must be verbatim substrings of a provided quote; use an empty span when its decision is negative."
    ].join("\n");
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      `Subject concept: "${input.subject.canonicalLabel}" (aliases: ${renderAliases(input.subject.aliases)}).`,
      `Candidate definition: "${input.definition}".`,
      "",
      "Verbatim evidence quotes:",
      ...input.evidenceQuotes.map((quote, index) => `[${index + 1}] "${quote}"`),
      "",
      "Call submit_definition_entailment_judgment: first classify subject identity, then judge whether the candidate meaning is stated."
    ].join("\n");

    const result = await this.client.call({
      model: this.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      toolName: "submit_definition_entailment_judgment",
      toolDescription: "Submit the subject-identity classification and whether the candidate definition is stated.",
      parameters: definitionEntailmentJudgmentSchema,
      validator: definitionEntailmentJudgmentValidator
    });

    const subjectSpan = result.subjectSpan.trim();
    const entailingSpan = result.entailingSpan.trim();
    const subjectGrounded = subjectSpan.length > 0 &&
      input.evidenceQuotes.some((quote) => evidenceQuoteMatches(quote, subjectSpan));
    const definitionGrounded = entailingSpan.length > 0 &&
      input.evidenceQuotes.some((quote) => evidenceQuoteMatches(quote, entailingSpan));
    const entailed =
      result.subjectMatch === "exact_or_interchangeable" &&
      subjectGrounded &&
      result.definitionEntailed &&
      definitionGrounded;
    return {
      entailed,
      entailingSpan: entailed ? entailingSpan : "",
      rationale: `${result.rationale} [subjectMatch=${result.subjectMatch}; subjectSpan=${JSON.stringify(subjectSpan)}; subjectGrounded=${subjectGrounded}; definitionEntailed=${result.definitionEntailed}; entailingSpan=${JSON.stringify(entailingSpan)}; definitionGrounded=${definitionGrounded}]`
    };
  }
}

// Fail closed: an entailing span must be grounded in the provided evidence, so the
// judge can never "support" a claim with text absent from the cited quotes.
function groundedJudgment(
  result: { entailed: boolean; entailingSpan: string; rationale: string },
  evidenceQuotes: string[]
): ClaimEntailmentJudgment {
  const span = result.entailingSpan.trim();
  const grounded = span.length > 0 && evidenceQuotes.some((quote) => evidenceQuoteMatches(quote, span));
  return {
    entailed: result.entailed && grounded,
    entailingSpan: grounded ? span : "",
    rationale: result.rationale
  };
}

function renderAliases(aliases: string[]): string {
  return aliases.length > 0 ? aliases.map((alias) => `"${alias}"`).join(", ") : "none";
}

function renderClaimObject(object: ExtractedClaim["object"]): string {
  return object.kind === "concept" ? object.candidateKey : `"${object.value}"`;
}

function mentionsAlias(text: string, aliases: string[]): boolean {
  const normalizedText = text.toLowerCase();
  return aliases.some((alias) => alias.length > 0 && normalizedText.includes(alias.toLowerCase()));
}
