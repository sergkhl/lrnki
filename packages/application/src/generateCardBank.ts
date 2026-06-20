import { randomUUID } from "node:crypto";
import {
  evidenceQuoteMatches,
  type Card,
  type CardAnswerKeyCitation,
  type DerivedGraphNode,
  type GraphSnapshot,
  type PublishedConceptEvidenceProfile
} from "@lrnki/domain-core";
import type { CardBankStorePort, CardGenerationPort, EnrichmentRunStorePort, GraphVersionStorePort } from "@lrnki/ports";

export type RejectedCard = { derivedNodeId: string; canonicalLabel: string; reason: string };

export type CardBankGenerationResult = {
  graphVersionId: string;
  enrichmentId: string;
  cards: Card[];
  rejected: RejectedCard[];
};

// Card Bank generation (U2, R1–R3). For each published anchor Concept, condition the
// generator on that Concept's published CEP, then VERIFY every returned citation
// verbatim against the cited CEP passage before promoting the draft to a Card. A
// draft with any unverifiable citation — or none — is rejected fail-closed (AGENTS
// rule 6), not silently kept: the gate enforces a provable guarantee (the quote
// traces to a published passage), which is exactly the symbolic veto rule 16 allows.
// Learner-neutral and regenerable; never touches the asserted graph (AGENTS rule 3).
export async function generateCardBank(input: {
  enrichmentId: string;
  configHash: string;
  graphStore: GraphVersionStorePort;
  enrichmentStore: EnrichmentRunStorePort;
  cardGeneration: CardGenerationPort;
  cardBankStore: CardBankStorePort;
  newCardId?: () => string;
}): Promise<CardBankGenerationResult> {
  const newCardId = input.newCardId ?? randomUUID;
  const layer = await input.enrichmentStore.getLayer(input.enrichmentId);
  if (!layer) throw new Error(`generateCardBank: enrichment ${input.enrichmentId} was not found.`);
  const snapshot = await input.graphStore.getPublishedSnapshot(layer.graphVersionId);
  if (!snapshot) throw new Error(`generateCardBank: graph version ${layer.graphVersionId} is not published.`);

  const profileByConcept = new Map(snapshot.evidenceProfiles.map((profile) => [profile.conceptId, profile] as const));
  const cards: Card[] = [];
  const rejected: RejectedCard[] = [];

  for (const node of layer.derivedNodes) {
    const grounding = selectNodeGrounding(node, snapshot, profileByConcept);
    if (!grounding || grounding.passages.length === 0) {
      rejected.push({ derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, reason: "no usable grounding passages" });
      continue;
    }

    let draft;
    try {
      draft = await input.cardGeneration.generate({
        declaredDomain: node.declaredDomain,
        node: { derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, aliases: node.aliases },
        groundingProvenance: grounding.provenance,
        groundingPassages: grounding.passages,
        definesLiteral: grounding.definesLiteral
      });
    } catch (error) {
      rejected.push({ derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, reason: `generation failed: ${error instanceof Error ? error.message : String(error)}` });
      continue;
    }

    const verified: CardAnswerKeyCitation[] = [];
    let unverifiable = false;
    for (const citation of draft.citations) {
      const match = grounding.passages.find(
        (passage) => passage.passageId === citation.sourceBlockId && evidenceQuoteMatches(passage.text, citation.evidenceQuote)
      );
      if (!match) {
        unverifiable = true;
        break;
      }
      if ("sourceResourceId" in match) {
        verified.push({ provenance: "source", sourceResourceId: match.sourceResourceId, sourceBlockId: match.sourceBlockId, evidenceQuote: citation.evidenceQuote });
      } else {
        verified.push({ provenance: "generated", derivedNodeId: node.derivedNodeId, passageText: citation.evidenceQuote });
      }
    }
    if (unverifiable || verified.length === 0) {
      rejected.push({ derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, reason: unverifiable ? "unverifiable answer-key citation" : "no answer-key citation" });
      continue;
    }

    cards.push({
      cardId: newCardId(),
      graphVersionId: layer.graphVersionId,
      enrichmentId: layer.enrichmentId,
      derivedNodeId: node.derivedNodeId,
      groundingProvenance: grounding.provenance,
      question: draft.question,
      answerKey: draft.answerKey,
      selfReportPrompt: draft.selfReportPrompt,
      citations: verified,
      generatingModel: input.cardGeneration.model,
      configHash: input.configHash
    });
  }

  await input.cardBankStore.persist(cards);
  return { graphVersionId: layer.graphVersionId, enrichmentId: layer.enrichmentId, cards, rejected };
}

type GroundingPassage =
  | { passageId: string; kind: "definition" | "mention"; text: string; sourceResourceId: string; sourceBlockId: string }
  | { passageId: string; kind: "definition" | "mention"; text: string; derivedNodeId: string };

type NodeGrounding = {
  provenance: Card["groundingProvenance"];
  passages: GroundingPassage[];
  definesLiteral: string | null;
};

function selectNodeGrounding(
  node: DerivedGraphNode,
  snapshot: GraphSnapshot,
  profileByConcept: Map<string, PublishedConceptEvidenceProfile>
): NodeGrounding | undefined {
  if (node.nodeKind === "anchor") {
    const profile = profileByConcept.get(node.conceptId);
    const passages: GroundingPassage[] = [
      ...(profile?.definitions ?? []).map((passage) => ({
        passageId: passage.sourceBlockId,
        kind: "definition" as const,
        text: passage.evidenceQuote,
        sourceResourceId: passage.sourceResourceId,
        sourceBlockId: passage.sourceBlockId
      })),
      ...(profile?.mentions ?? []).map((passage) => ({
        passageId: passage.sourceBlockId,
        kind: "mention" as const,
        text: passage.evidenceQuote,
        sourceResourceId: passage.sourceResourceId,
        sourceBlockId: passage.sourceBlockId
      }))
    ];
    return {
      provenance: "source_cep",
      passages,
      definesLiteral: profile?.assertions.find((assertion) => assertion.type === "defines")?.literalValue ?? null
    };
  }

  if (node.groundingOrigin === "source_mentioned") {
    return {
      provenance: "source_mentioned",
      passages: node.groundingPassages
        .filter((passage) => passage.verbatimCheck.disposition === "verified")
        .map((passage) => ({
          passageId: passage.sourceBlockId,
          kind: passage.passageType,
          text: passage.evidenceQuote,
          sourceResourceId: passage.sourceResourceId,
          sourceBlockId: passage.sourceBlockId
        })),
      definesLiteral: null
    };
  }

  const generated = [
    ...node.groundingBundle.definitions.map((passage, index) => ({ passage, kind: "definition" as const, index })),
    ...node.groundingBundle.mentions.map((passage, index) => ({ passage, kind: "mention" as const, index }))
  ];
  return {
    provenance: "generated",
    passages: generated.map(({ passage, kind, index }) => ({
      passageId: `${node.derivedNodeId}:${kind}:${index}`,
      kind,
      text: passage.text,
      derivedNodeId: node.derivedNodeId
    })),
    definesLiteral: node.groundingBundle.definitions[0]?.text ?? null
  };
}
