import { randomUUID } from "node:crypto";
import { evidenceQuoteMatches, type Card, type CardAnswerKeyCitation } from "@lrnki/domain-core";
import type { CardBankStorePort, CardGenerationPort, GraphVersionStorePort } from "@lrnki/ports";

export type RejectedCard = { conceptId: string; canonicalLabel: string; reason: string };

export type CardBankGenerationResult = {
  graphVersionId: string;
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
  graphVersionId: string;
  configHash: string;
  graphStore: GraphVersionStorePort;
  cardGeneration: CardGenerationPort;
  cardBankStore: CardBankStorePort;
  newCardId?: () => string;
}): Promise<CardBankGenerationResult> {
  const newCardId = input.newCardId ?? randomUUID;
  const snapshot = await input.graphStore.getPublishedSnapshot(input.graphVersionId);
  if (!snapshot) throw new Error(`generateCardBank: graph version ${input.graphVersionId} is not published.`);

  const profileByConcept = new Map(snapshot.evidenceProfiles.map((profile) => [profile.conceptId, profile] as const));
  const cards: Card[] = [];
  const rejected: RejectedCard[] = [];

  for (const concept of snapshot.concepts) {
    const profile = profileByConcept.get(concept.conceptId);
    // Definitions and mentions are the citable, provenance-bearing CEP passages. A
    // thin CEP (no definition) still yields a card from mentions — the orchestration
    // does not special-case it; rule-14 inspection notes weak grounding (no
    // per-fixture patching, AGENTS rule 17).
    const citable = [
      ...(profile?.definitions ?? []).map((passage) => ({ ...passage, kind: "definition" as const })),
      ...(profile?.mentions ?? []).map((passage) => ({ ...passage, kind: "mention" as const }))
    ];
    if (citable.length === 0) {
      rejected.push({ conceptId: concept.conceptId, canonicalLabel: concept.canonicalLabel, reason: "no citable CEP passages" });
      continue;
    }
    const definesLiteral = profile?.assertions.find((assertion) => assertion.type === "defines")?.literalValue ?? null;

    let draft;
    try {
      draft = await input.cardGeneration.generate({
        declaredDomain: concept.declaredDomain,
        concept: { conceptId: concept.conceptId, canonicalLabel: concept.canonicalLabel, aliases: concept.aliases },
        cepPassages: citable.map((passage) => ({ sourceBlockId: passage.sourceBlockId, kind: passage.kind, evidenceQuote: passage.evidenceQuote })),
        definesLiteral
      });
    } catch (error) {
      rejected.push({ conceptId: concept.conceptId, canonicalLabel: concept.canonicalLabel, reason: `generation failed: ${error instanceof Error ? error.message : String(error)}` });
      continue;
    }

    const verified: CardAnswerKeyCitation[] = [];
    let unverifiable = false;
    for (const citation of draft.citations) {
      // A citation is trusted only when its quote is a verbatim substring of a CEP
      // passage from the cited block; sourceResourceId is resolved from that passage.
      const match = citable.find(
        (passage) => passage.sourceBlockId === citation.sourceBlockId && evidenceQuoteMatches(passage.evidenceQuote, citation.evidenceQuote)
      );
      if (!match) {
        unverifiable = true;
        break;
      }
      verified.push({ sourceResourceId: match.sourceResourceId, sourceBlockId: match.sourceBlockId, evidenceQuote: citation.evidenceQuote });
    }
    if (unverifiable || verified.length === 0) {
      rejected.push({ conceptId: concept.conceptId, canonicalLabel: concept.canonicalLabel, reason: unverifiable ? "unverifiable answer-key citation" : "no answer-key citation" });
      continue;
    }

    cards.push({
      cardId: newCardId(),
      graphVersionId: input.graphVersionId,
      conceptId: concept.conceptId,
      question: draft.question,
      answerKey: draft.answerKey,
      selfReportPrompt: draft.selfReportPrompt,
      citations: verified,
      generatingModel: input.cardGeneration.model,
      configHash: input.configHash
    });
  }

  await input.cardBankStore.persist(cards);
  return { graphVersionId: input.graphVersionId, cards, rejected };
}
