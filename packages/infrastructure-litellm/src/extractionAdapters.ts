import type {
  AdmissionLabelJudgment,
  AdmissionProposal,
  AssertionEntailmentJudgment,
  BlockEvidence,
  DefinitionPassageQualityJudgment,
  DefinitionPassageVetoCategory,
  DiscoveredCandidate,
  ExtractedEvidenceProfile,
  ExtractedTypedAssertion,
  SourceBlock,
  StructuredDocument
} from "@lrnki/domain-core";
import { evidenceQuoteMatches, extractableBlocks } from "@lrnki/domain-core";
import type { CoreSelectionReasonCode } from "@lrnki/domain-core";
import type {
  AdmissionLabelJudgmentPort,
  AssertionEntailmentJudgmentPort,
  ConceptAdmissionPort,
  ConceptConditionedEvidenceProfileExtractionPort,
  ConceptDiscoveryPort,
  DefinitionPassageQualityJudgmentPort
} from "@lrnki/ports";
import { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import { STAGE_TAGS } from "./stageTags";
import {
  admissionLabelJudgmentSchema,
  admissionLabelJudgmentValidator,
  conceptAdmissionSchemaForCandidateKeys,
  conceptAdmissionValidator,
  conceptCoreSelectionSchemaForCandidateKeys,
  conceptCoreSelectionValidator,
  conceptEvidenceProfileSchema,
  conceptEvidenceProfileValidator,
  conceptDiscoverySchema,
  conceptDiscoveryValidator,
  definitionEntailmentJudgmentSchema,
  definitionEntailmentJudgmentValidator,
  definitionPassageQualityJudgmentSchema,
  definitionPassageQualityJudgmentValidator
} from "./toolSchemas";

// LiteLLM aliases (litellm/config.yaml router model_group_alias). Production
// extraction uses DeepSeek V4 Flash with thinking disabled (AGENTS rule 5).
export const DISCOVERY_MODEL = "kg-concept-discovery";
export const ADMISSION_MODEL = "kg-concept-admission";
// Concept Evidence Profile extraction (ADR-0007 reset). Routes to the DeepSeek
// extractor alias; the alias string is unchanged so litellm/config.yaml routing is
// untouched in this unit.
export const EVIDENCE_PROFILE_MODEL = "kg-claim-extraction";
// Independent production judge alias (ADR-0007/0005). A different family than the
// DeepSeek extractor (gpt-oss-120b via `kg-independent-judge`) so the judge is not
// re-running the extractor's own reasoning over its own output. This is a standing
// production judge, not benchmark machinery — the off-core oracle triangle is gone.
export const ASSERTION_ENTAILMENT_JUDGE_MODEL = "kg-independent-judge";
// Same independent production judge for the concept-vs-proposition admission judge
// (ADR-0005): the judge must not be the admission extractor (DeepSeek) re-deciding
// its own label.
export const ADMISSION_LABEL_JUDGE_MODEL = "kg-independent-judge";
// Same independent production judge for the Definition-Passage quality judge (ADR-0007
// extension): the meaning-quality verdict must not come from the DeepSeek extractor
// that produced the passage. Reuses the `kg-independent-judge` alias unchanged, so
// litellm/config.yaml routing is untouched (no restart needed).
export const DEFINITION_PASSAGE_QUALITY_JUDGE_MODEL = "kg-independent-judge";

export function renderBlocks(blocks: SourceBlock[], options: { adjacencyBlocks?: SourceBlock[] } = {}): string {
  const adjacency = new Map<string, { previous?: string; next?: string }>();
  const adjacencyBlocks = options.adjacencyBlocks ?? blocks;
  adjacencyBlocks.forEach((block, index) => {
    adjacency.set(block.blockId, {
      previous: adjacencyBlocks[index - 1]?.blockId,
      next: adjacencyBlocks[index + 1]?.blockId
    });
  });

  return blocks
    .map((block) => {
      const path = block.headingPath.length ? ` heading="${block.headingPath.join(" › ")}"` : "";
      const adjacent = adjacency.get(block.blockId);
      const previous = adjacent?.previous ? ` prev=${adjacent.previous}` : "";
      const next = adjacent?.next ? ` next=${adjacent.next}` : "";
      return `[${block.blockId} type=${block.blockType}${path}${previous}${next}] ${block.text}`;
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
      validator: conceptDiscoveryValidator,
      tags: [STAGE_TAGS.conceptDiscovery]
    });
    return result.candidates;
  }
}

export class LiteLlmConceptAdmissionAdapter implements ConceptAdmissionPort {
  constructor(private readonly client: LiteLlmForcedToolClient, private readonly model: string = ADMISSION_MODEL) {}

  async admit(input: { document: StructuredDocument; declaredDomain: string; candidates: DiscoveredCandidate[] }): Promise<AdmissionProposal[]> {
    const system = [
      "You perform precision-first concept admission for an authoritative learner-neutral concept graph.",
      "ATOMIC CONCEPTS: each decision must describe exactly ONE concept. When a discovered candidate CONFLATES several concepts (e.g. 'A and B'), SPLIT it: emit one decision per atomic concept, each with the SAME parentCandidateKey and a DISTINCT atomicKey (e.g. parent 'a_and_b' -> atoms 'a_and_b__a' and 'a_and_b__b'). When a candidate already names one concept, emit a single decision whose atomicKey equals its parentCandidateKey.",
      "SOURCE ROLE — judge every concept against the DECLARED DOMAIN by its HOME FIELD, not by how often the source mentions it. Set sourceRole to 'declared_domain_concept' only when the concept genuinely belongs to the Declared Domain. Set it to 'out_of_domain_illustration' when the concept's home field is a DIFFERENT discipline and this source uses it only as example data, sample course content, a worked example, a benchmark task, or evaluation material — even if the source mentions it many times. Out-of-domain illustrative material is REJECTED, never kept optional.",
      "Source-role test: ask 'if I were building a concept graph FOR the Declared Domain, would a learner of THAT domain study this concept?' If the concept's home field is a different discipline and it appears only as sample content, a worked example, benchmark material, or evaluation material, it is out_of_domain_illustration. The declared-domain concepts are the source's own framework, signals, mechanisms, roles, methods, constraints, and evidence.",
      "Classify each atomic concept as 'core', 'optional', 'reject', or 'quarantine'. Be strict: in a typical source only a MINORITY of concepts are 'core'.",
      "CORE CONCEPT ELIGIBILITY has four independent tests. A candidate is core only when ALL FOUR pass with exact source evidence:",
      "(1) standaloneLearningObjective: a learner could study and be assessed on this as its own objective. It is not reducible to a role, component, property, API name, operation name, or vocabulary item inside a broader concept.",
      "A candidate label must name a CONCEPT (a noun phrase), not assert a PROPOSITION. A label that states a full claim — for example a subject-relation-object title such as 'X is Y', 'X depends on Y', 'X is limited by Y', or 'X is determined by Y' — is a claim, not a concept; reject it and rely on the underlying noun phrase for X as the concept instead. Use reason code 'proposition_or_claim_label'.",
      "(2) establishedDomainMeaning: the source uses it as a coherent concept with an established meaning in the Declared Domain, not as narration, an improvised phrase, or a source-local composite.",
      "(3) organizingPower: the source demonstrates at least TWO DISTINCT substantive explanatory aspects or relationships organized by the concept. Return each aspect separately with its own verbatim evidence.",
      "(4) definitionBearingTreatment: the source gives the concept DEFINITION-BEARING treatment — a passage that establishes what the concept MEANS (its defining properties, the criteria that distinguish it, or how it is constituted), distinct from a bare mention, an example, or a passing use. Cite that meaning-establishing passage verbatim. A core concept the source only names or uses but never explains is NOT core in this run, even if it is established in the wider domain. A definition need not use a copula or 'X is Y' phrasing; meaning can be established by description, mechanism, or contrast.",
      "Classify each organizing aspect's nature honestly. 'motivation-or-example' does not count toward organizing power and is discarded by the application boundary.",
      "Both organizing aspects must directly explain the candidate itself. A problem it motivates, a consequence it causes, or a teaser for later material is not a second aspect of the candidate.",
      "Each organizing aspect must cite a different evidence reference. Do not reuse the same blockId + evidenceQuote for two aspects; the application discards duplicate references and will fail the criterion closed.",
      "The selected source must teach enough about the candidate to support assessment. Domain knowledge that the source merely mentions or promises to explain later remains optional.",
      "A mechanism or operation is not automatically optional: it may be core when it passes all three tests. Grammatical form never decides eligibility.",
      "Use 'optional' for real, evidence-supported domain knowledge useful for explaining a core concept but not independently eligible.",
      "Use 'reject' for headings, examples, malformed composites, bibliography or document metadata, and source-local details that are not durable domain knowledge.",
      "Use 'quarantine' for genuine identity or meaning ambiguity.",
      "Do not silently make exceptions for concise sources or concepts that seem foundational. If this source cannot evidence all three tests, the candidate is not core in this run.",
      "For every candidate propose one precise canonical label. Keep the discovered label if already precise. You may clarify a vague surface label without broadening or changing its evidenced meaning: for example 'Operation' may become '<Declared Domain> operation semantics' when the evidence supports that narrower meaning. Never merge candidates.",
      "Reject an invented umbrella or conjunction label such as 'Memory and Allocation' unless the source itself establishes that exact coherent concept; prefer a precise established label or keep it optional.",
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
        "Call submit_admission_decisions. Emit one or more atomic decisions per candidateKey in the batch (split conflated candidates), set each decision's parentCandidateKey to a candidateKey in the batch, and give every decision a distinct atomicKey."
      ].join("\n");

      const result = await this.client.call({
        model: this.model,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        toolName: "submit_admission_decisions",
        toolDescription: "Submit one precision-first admission decision per candidate in the requested batch.",
        parameters: conceptAdmissionSchemaForCandidateKeys(batch.map((candidate) => candidate.candidateKey)),
        validator: conceptAdmissionValidator,
        tags: [STAGE_TAGS.admission]
      });
      const batchKeys = new Set(batch.map((candidate) => candidate.candidateKey));
      // Keep every atomic decision whose parent is in this batch. One parent may
      // yield several atoms (R13); duplicate atomicKeys and unknown parents are
      // dropped fail-closed by the application boundary, not here.
      decisions.push(...result.decisions.filter((decision) => batchKeys.has(decision.parentCandidateKey)));
    }

    const individuallyEligible = decisions.filter((decision) =>
      decision.tier !== "quarantine" &&
      decision.sourceRole === "declared_domain_concept" &&
      decision.standaloneLearningObjective.passed &&
      decision.establishedDomainMeaning.passed &&
      decision.definitionBearingTreatment.passed &&
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
      "RETAIN established domain concepts (recall is as important as precision here): a named, established domain concept — an algorithm, method, model, named phenomenon, technique, category, or mechanism with an accepted meaning in the field — that THIS source teaches substantively, with two distinct organizing aspects, is CORE. This holds EVEN WHEN the source is a method, survey, or system paper that also uses, evaluates, builds on, or compares against the concept. Being used by, evaluated by, or serving as a baseline for the source's own contribution is NOT grounds for demotion as long as the source still explains the concept itself.",
      "Keep a candidate named by an explicit source learning objective when the source treats it substantively.",
      "Demote narrow facets, incidental supporting mechanisms, examples used only for illustration, pseudo-concepts, headings, and labels whose teaching is genuinely duplicated by another selected candidate.",
      "Demote any proposition-shaped label that asserts a full claim rather than naming a concept, such as a subject-relation-object title ('X is Y', 'X depends on Y', or 'X is limited by Y'). The underlying noun phrase is the concept; the proposition is a claim. Use reasonCode 'pseudo_concept_or_heading'.",
      "Demote generic graph-role vocabulary such as 'Concept', 'Node', 'Edge', or bare 'Relationship' unless the source explicitly teaches that notion as an independent learning objective. A method paper saying it models items as nodes does not by itself teach the item-role vocabulary as core concepts.",
      "Illustrative-example demotion (apply narrowly): read each candidate's evidence quotes and the heading they come from. Demote a candidate as illustrative ONLY when EVERY substantive evidence quote for it is drawn from a case-study / example / evaluation / demo section AND the source never explains the concept in its own main exposition — i.e. it is merely a case-study-only node or example vehicle for demonstrating the source's contribution. Do NOT demote a concept the source explains in its main text just because it ALSO appears in a case study, evaluation, or example. When in doubt and the source teaches the concept substantively, retain it.",
      "Do not demote a candidate merely because it is part of, used by, or evidence for a broader concept.",
      "Do not keep a candidate merely because it is independently teachable in the wider domain; this selected source must treat it substantively.",
      "There is no fixed count target, but do not decompose one lesson into vocabulary-sized core concepts.",
      "A core set may include a broad concept and a distinct mechanism, model, category, or evidence pattern when each is substantively taught and answers a different learner question; do not demote a concept merely because it supports another selected concept.",
      "Do not keep both a composite section label and its atomic children. If a section-style label is only a container for several concepts, select the atomic concepts and demote the container unless the source establishes the container as its own coherent concept.",
      "For every selection return the final precise canonical label. Domain-qualify vague labels when the evidence supports the narrower meaning; do not preserve section-style labels such as '<Concept A> and <Concept B>' as Concepts.",
      "",
      "Individually eligible atomic concepts (with verbatim source evidence and the heading each quote came from):",
      ...individuallyEligible.map((decision) => [
        `- ${decision.atomicKey}: parent="${input.candidates.find((candidate) => candidate.candidateKey === decision.parentCandidateKey)?.canonicalLabel ?? decision.parentCandidateKey}", proposed="${decision.proposedCanonicalLabel}"`,
        `  standalone: ${decision.standaloneLearningObjective.rationale}`,
        ...decision.standaloneLearningObjective.evidence.map((evidence) => `  standalone evidence [${headingFor(evidence.blockId)}]: "${evidence.evidenceQuote}"`),
        ...decision.organizingPower.aspects.map((aspect) => `  aspect (${aspect.nature}) [${headingFor(aspect.evidence.blockId)}]: ${aspect.summary} — "${aspect.evidence.evidenceQuote}"`)
      ].join("\n")),
      "",
      "Call submit_core_selection exactly once for every listed atomic concept."
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
      parameters: conceptCoreSelectionSchemaForCandidateKeys(individuallyEligible.map((decision) => decision.atomicKey)),
      validator: conceptCoreSelectionValidator,
      tags: [STAGE_TAGS.admission]
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
    const individuallyEligibleKeys = new Set(individuallyEligible.map((decision) => decision.atomicKey));

    return decisions.map((decision) => {
      if (!individuallyEligibleKeys.has(decision.atomicKey)) {
        return {
          ...decision,
          coreSelected: false,
          selectionReasonCode: "failed_model_eligibility" as const
        };
      }
      const selection = selectionByKey.get(decision.atomicKey);
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

export class LiteLlmEvidenceProfileExtractionAdapter implements ConceptConditionedEvidenceProfileExtractionPort {
  constructor(private readonly client: LiteLlmForcedToolClient, private readonly model: string = EVIDENCE_PROFILE_MODEL) {}

  async extract(input: {
    document: StructuredDocument;
    declaredDomain: string;
    subject: { candidateKey: string; canonicalLabel: string; aliases: string[] };
    admittedConcepts: { candidateKey: string; canonicalLabel: string; aliases: string[] }[];
    evidenceNeighborhood: SourceBlock[];
    definitionBearingEvidence: BlockEvidence[];
  }): Promise<ExtractedEvidenceProfile> {
    const system = [
      "You build a Concept Evidence Profile for ONE subject concept from a curated source, for a learner-neutral concept graph.",
      "A profile has three parts: definition passages, mention passages, and optional typed assertions. Every passage is a VERBATIM quote copied exactly from a cited block. No verbatim quote, no passage.",
      "DEFINITION PASSAGES: one or more verbatim passages that establish what the subject concept MEANS. A definition passage need NOT use a literal 'X is Y' form — apposition ('—a discrepancy known as the generalization gap'), a 'means'/'refers to'/'known as' construction, or any meaning-bearing sentence qualifies, as long as the passage conveys the concept's meaning. A bare repetition of the concept's own name, a section heading, or a title is NOT a definition passage — it conveys no meaning; quote the sentence that actually explains the concept instead. Include at least one; a concept the source never gives meaning to does not belong here.",
      "MENTION PASSAGES: verbatim passages where the source substantively teaches, applies, structures, contrasts, or constrains the concept — its taxonomy, parts, mechanisms it uses, what it is distinguished from, what it depends on. This is where ordinary concept-to-concept relationships live; they are NOT typed. ORDER the mentions from MOST to LEAST useful for understanding the concept and what must be learned before it. The application keeps the most salient few, so put the strongest passages first.",
      "OPTIONAL TYPED ASSERTIONS — emit ONLY when the evidence explicitly supports the definition literal; otherwise leave assertions empty and keep the passage as a mention:",
      "- 'defines': set objectKind='literal' and literalValue to a faithful, concise definition GROUNDED IN the evidence quote (you may smooth wording, resolve apposition, or normalise order, but add no meaning the quote does not support). Attach the verbatim evidence.",
      "Do NOT invent assertion types. Taxonomy, part-of, uses, and contrast relationships are mention passages, not assertions.",
      "Every definition, mention, and assertion evidence quote must be copied verbatim from a cited block."
    ].join("\n");
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      `Subject concept: ${input.subject.candidateKey} = "${input.subject.canonicalLabel}".`,
      `Subject exact aliases: ${renderAliases(input.subject.aliases)}.`,
      "Evidence blocks (quote verbatim from these):",
      renderBlocks(input.evidenceNeighborhood, { adjacencyBlocks: extractableBlocks(input.document.blocks) }),
      "",
      // KTD2 hint: admission already verified that the source establishes this
      // concept's meaning in the passage(s) below. Surface it so the extractor does
      // not lose the definition under fan-out. It is a HINT, not an injected passage:
      // the model must still copy a verbatim definition passage from the evidence
      // blocks above, and the application boundary independently re-verifies it.
      ...(input.definitionBearingEvidence.length > 0
        ? [
            "Admission already found that this source establishes the subject concept's meaning here (use as a hint; you must still quote a verbatim definition passage from the evidence blocks above):",
            ...input.definitionBearingEvidence.map((evidence) => `- "${evidence.evidenceQuote}"`),
            ""
          ]
        : []),
      "Call submit_concept_evidence_profile with the subject concept's definition passages, salience-ordered mention passages, and any optional typed assertions."
    ].join("\n");

    const result = await this.client.call({
      model: this.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      toolName: "submit_concept_evidence_profile",
      toolDescription: "Submit the subject concept's definition passages, salience-ordered mention passages, and optional typed assertions.",
      parameters: conceptEvidenceProfileSchema,
      validator: conceptEvidenceProfileValidator,
      tags: [STAGE_TAGS.cepExtraction]
    });

    const assertions: ExtractedTypedAssertion[] = [];
    for (const assertion of result.assertions) {
      if (assertion.type === "defines") {
        if (assertion.literalValue === null || assertion.literalValue.trim() === "") continue;
        assertions.push({ type: "defines", literalValue: assertion.literalValue, evidence: assertion.evidence });
      }
    }

    return {
      definitions: result.definitions,
      mentions: result.mentions,
      assertions
    };
  }
}

// Assertion-entailment judge (ADR-0007 reset). Mirrors the prerequisite-judgment
// adapter: forced named tool, temp 0, one bounded judgment per `defines`
// assertion. Fail
// closed: an ungrounded `entailingSpan` is treated as not-entailed so the judge
// cannot "support" an assertion with text absent from the cited evidence. Grounding
// uses the same formatting-noise normalization as the deterministic evidence floor.
export class LiteLlmAssertionEntailmentJudgmentAdapter implements AssertionEntailmentJudgmentPort {
  readonly model: string;
  constructor(private readonly client: LiteLlmForcedToolClient, model: string = ASSERTION_ENTAILMENT_JUDGE_MODEL) {
    this.model = model;
  }

  // Definition entailment for a `defines` literal. The literal is model-authored
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
  }): Promise<AssertionEntailmentJudgment> {
    const system = [
      "You judge whether quoted source evidence ACTUALLY DEFINES a domain concept as a given meaning, for a learner-neutral concept graph.",
      "The evidence quotes are already verified verbatim from the source. Judge ONLY what the quotes assert — do not use outside knowledge to fill gaps.",
      "The candidate definition is a faithful PARAPHRASE, not a verbatim copy; real prose defines through apposition ('—a discrepancy known as X'), reversed order, copulas, and synonyms. Judge meaning, not wording: do not require the definition string to appear verbatim.",
      "Make TWO independent decisions. First classify subjectMatch: exact_or_interchangeable only when the quotes identify the requested subject itself; qualified_variant when they identify a narrower, broader, suffixed, or specialized form (for example '<Subject> subset' is not interchangeable with '<Subject>'); different_or_absent when they define another referent or never identify the requested subject.",
      "For subjectSpan, copy the minimal exact sub-quote that identifies the subject. An anonymous noun phrase such as 'a system' does NOT identify a requested named subject. Do not infer subject identity from document context absent from the quotes.",
      "Negative example: requested subject '<Named Method>', quote 'We consider a system that searches a structured space' => subjectMatch=different_or_absent, because the quote identifies only an anonymous system and never links it to the requested term.",
      "Qualified example: requested subject '<Benchmark>', quote '<Benchmark> subset — a curated subset' => subjectMatch=qualified_variant, because the suffixed or narrowed subset is not interchangeable with the full subject.",
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
      validator: definitionEntailmentJudgmentValidator,
      tags: [STAGE_TAGS.assertionEntailment]
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

// Definition-Passage quality judge (ADR-0007 extension). Forced named tool, temp 0,
// ONE batched call per core Concept that judges all of its already-verbatim-verified
// Definition Passages together (KTD4): shared subject context (canonical label +
// aliases) is established once, and each verdict is keyed back to its passage by the
// input `index`. The cited block's `blockType` / `headingPath` are passed as CONTEXT so
// the judge can recognize heading/title/citation structure — the application NEVER
// vetoes deterministically on block type (KTD7, AGENTS rule 16). Fail closed = keep:
// a veto (`establishesMeaning: false`) is honored only when its `judgedSpan` grounds in
// that passage under the deterministic evidence normalizer; an ungrounded veto, a
// missing index, or an out-of-range index all coerce to keep, so the judge can never
// drop a passage on text absent from it and a transport blip never shrinks the core.
export class LiteLlmDefinitionPassageQualityJudgmentAdapter implements DefinitionPassageQualityJudgmentPort {
  readonly model: string;
  constructor(private readonly client: LiteLlmForcedToolClient, model: string = DEFINITION_PASSAGE_QUALITY_JUDGE_MODEL) {
    this.model = model;
  }

  async judgeDefinitions(input: {
    declaredDomain: string;
    subject: { canonicalLabel: string; aliases: string[] };
    passages: { sourceBlockId: string; evidenceQuote: string; blockType: string; headingPath: string[] }[];
  }): Promise<DefinitionPassageQualityJudgment[]> {
    const keep = (rationale: string): DefinitionPassageQualityJudgment => ({
      establishesMeaning: true,
      category: "establishes_meaning",
      judgedSpan: "",
      rationale
    });
    if (input.passages.length === 0) return [];

    const system = [
      "You judge whether quoted source text actually DEFINES a domain concept, for a learner-neutral concept graph.",
      "Each quote is already verified verbatim from the source; you are NOT checking grounding, only whether the quote conveys the concept's MEANING.",
      "A quote establishes meaning when it states the concept's defining properties, distinguishing criteria, the mechanism by which it works, or a contrast that pins down what the concept IS. Judge meaning, not length or wording: a terse but genuinely defining clause establishes meaning.",
      "A quote is HOLLOW when it carries no defining content: a bare repetition of the concept's own name or label (bare_name_repetition), a section heading or document title rather than prose about the concept (heading_or_title), or a citation, reference, or bibliographic phrase (citation_or_bibliographic).",
      "The blockType and headingPath are CONTEXT to help you recognize structure; they do not decide the verdict. A paragraph can still be hollow, and a list item can still define. Judge the text's meaning.",
      "Precision-first: when a quote plausibly defines the concept, set establishesMeaning=true. Only veto on a clear hollow passage. For judgedSpan, copy the minimal exact sub-quote your verdict rests on; it MUST be a verbatim substring of that passage.",
      "Return one judgment per listed passage, each carrying that passage's index."
    ].join("\n");
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      `Subject concept: "${input.subject.canonicalLabel}" (aliases: ${renderAliases(input.subject.aliases)}).`,
      "",
      "Candidate Definition Passages:",
      ...input.passages.map((passage, index) =>
        `[${index}] blockType=${passage.blockType}; headingPath=${renderHeadingPath(passage.headingPath)}; quote="${passage.evidenceQuote}"`
      ),
      "",
      "Call submit_definition_passage_quality_judgments: for each index, does the quote establish the concept's meaning, or is it a hollow passage?"
    ].join("\n");

    const result = await this.client.call({
      model: this.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      toolName: "submit_definition_passage_quality_judgments",
      toolDescription: "Submit, per Definition Passage index, whether the quote establishes the concept's meaning or is a hollow passage.",
      parameters: definitionPassageQualityJudgmentSchema,
      validator: definitionPassageQualityJudgmentValidator,
      tags: [STAGE_TAGS.definitionPassageQuality]
    });

    const byIndex = new Map(result.judgments.map((judgment) => [judgment.index, judgment] as const));
    return input.passages.map((passage, index) => {
      const judgment = byIndex.get(index);
      if (!judgment) return keep(`[no verdict for index ${index}: kept]`);
      if (judgment.establishesMeaning) {
        return { establishesMeaning: true, category: "establishes_meaning", judgedSpan: "", rationale: judgment.rationale };
      }
      const span = judgment.judgedSpan.trim();
      const grounded = span.length > 0 && evidenceQuoteMatches(passage.evidenceQuote, span);
      if (!grounded) {
        return keep(`${judgment.rationale} [ungrounded veto kept: judgedSpan=${JSON.stringify(span)}]`);
      }
      const category: DefinitionPassageVetoCategory =
        judgment.category === "establishes_meaning" ? "bare_name_repetition" : judgment.category;
      return { establishesMeaning: false, category, judgedSpan: span, rationale: judgment.rationale };
    });
  }
}

// Concept-vs-proposition admission judge (ADR-0005). Mirrors the claim-entailment
// adapter: forced named tool, independent model family, one bounded judgment per
// admitted-`core` label. The judge sees the proposed canonical label (+aliases)
// and the candidate's already-verbatim evidence. It decides whether the label
// NAMES a concept or ASSERTS a proposition about one. Fail closed: a
// proposition verdict whose `groundingSpan` or `underlyingNounPhrase` is not
// grounded in the cited evidence is coerced to `concept`, so the judge can never
// demote a candidate on text absent from its evidence. Grounding uses the same
// formatting-noise normalization as the deterministic evidence floor.
export class LiteLlmAdmissionLabelJudgmentAdapter implements AdmissionLabelJudgmentPort {
  readonly model: string;
  constructor(private readonly client: LiteLlmForcedToolClient, model: string = ADMISSION_LABEL_JUDGE_MODEL) {
    this.model = model;
  }

  async judge(input: {
    declaredDomain: string;
    label: string;
    aliases: string[];
    evidenceQuotes: string[];
  }): Promise<AdmissionLabelJudgment> {
    const system = [
      "You judge whether a candidate concept LABEL names a durable domain concept or instead asserts a full proposition/claim about one, for a learner-neutral concept graph.",
      "A Concept label is a NOUN PHRASE — a durable unit of domain knowledge — however long. 'Right to Be Forgotten' and 'Survival of the Fittest' are concept labels: they NAME things, even though they contain verbs or read like sentences.",
      "A proposition/claim label asserts a full predication ABOUT a concept: subject + relation + object. Labels shaped like '<Subject> as <Claimed Role>' or '<Subject> limited by <Constraint>' are propositions when they state a claim; the real concept is the underlying noun phrase for the subject.",
      "Decide from the LABEL's structure and the evidence's meaning, never from a fixed list of verbs or copulas. Being long, or containing a participle or 'as'/'by', does NOT by itself make a label a proposition. Precision-first: when unsure, return 'concept' (do not strip a legitimate concept).",
      "When labelKind is 'proposition_or_claim': set underlyingNounPhrase to the noun-phrase concept the label reduces to (copied verbatim from the label or evidence), and set groundingSpan to the minimal exact sub-quote from the evidence that shows the predication. Both must be verbatim substrings of a provided quote.",
      "When labelKind is 'concept': return empty underlyingNounPhrase and empty groundingSpan."
    ].join("\n");
    const user = [
      `Declared domain: ${input.declaredDomain}.`,
      `Candidate label: "${input.label}" (aliases: ${renderAliases(input.aliases)}).`,
      "",
      "Verbatim evidence quotes from the source:",
      ...input.evidenceQuotes.map((quote, index) => `[${index + 1}] "${quote}"`),
      "",
      "Call submit_admission_label_judgment: does this label NAME a concept, or ASSERT a proposition about one?"
    ].join("\n");

    const result = await this.client.call({
      model: this.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      toolName: "submit_admission_label_judgment",
      toolDescription: "Submit whether the candidate label names a concept or asserts a proposition, with the underlying noun phrase when it is a proposition.",
      parameters: admissionLabelJudgmentSchema,
      validator: admissionLabelJudgmentValidator,
      tags: [STAGE_TAGS.admissionLabelJudge]
    });

    return groundedAdmissionLabelJudgment(result, input.evidenceQuotes);
  }
}

// Fail closed = preserve recall (KTD5): a `proposition_or_claim` verdict may demote
// a `core` candidate ONLY when both the predication span and the underlying noun
// phrase are grounded in the candidate's cited evidence. An ungrounded positive is
// returned as `concept`, so an absent-text or hallucinated verdict never demotes.
function groundedAdmissionLabelJudgment(
  result: AdmissionLabelJudgment,
  evidenceQuotes: string[]
): AdmissionLabelJudgment {
  if (result.labelKind !== "proposition_or_claim") {
    return { labelKind: "concept", underlyingNounPhrase: "", groundingSpan: "", rationale: result.rationale };
  }
  const span = result.groundingSpan.trim();
  const nounPhrase = result.underlyingNounPhrase.trim();
  const spanGrounded = span.length > 0 && evidenceQuotes.some((quote) => evidenceQuoteMatches(quote, span));
  const nounPhraseGrounded = nounPhrase.length > 0 && evidenceQuotes.some((quote) => evidenceQuoteMatches(quote, nounPhrase));
  if (spanGrounded && nounPhraseGrounded) {
    return { labelKind: "proposition_or_claim", underlyingNounPhrase: nounPhrase, groundingSpan: span, rationale: result.rationale };
  }
  return {
    labelKind: "concept",
    underlyingNounPhrase: "",
    groundingSpan: "",
    rationale: `${result.rationale} [ungrounded proposition verdict kept core: spanGrounded=${spanGrounded}; nounPhraseGrounded=${nounPhraseGrounded}]`
  };
}

// Fail closed: an entailing span must be grounded in the provided evidence, so the
// judge can never "support" a claim with text absent from the cited quotes.
function groundedJudgment(
  result: { entailed: boolean; entailingSpan: string; rationale: string },
  evidenceQuotes: string[]
): AssertionEntailmentJudgment {
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

function renderHeadingPath(headingPath: string[]): string {
  return headingPath.length > 0 ? headingPath.map((heading) => `"${heading}"`).join(" › ") : "none";
}
