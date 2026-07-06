"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { CheckIcon } from "lucide-react";
import { motion } from "motion/react";
import type { MatchingAttemptTrace, StudyMatchingView } from "@lrnki/application";
import type { LearnerMatchingResult } from "@/app/learn/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GroundedBadge } from "./GroundedBadge";
import { canTryMatchingPair, matchingProgress } from "./matchingProgress";
import { useShuffledLookup } from "./useShuffledLookup";

type SelectedTile = { column: "prompt" | "match"; id: string } | null;

export function MatchingBoard({
  item,
  result,
  disabled,
  onAttempt,
  onComplete
}: Readonly<{
  item: StudyMatchingView;
  result: LearnerMatchingResult | null;
  disabled: boolean;
  onAttempt: (promptId: string, matchId: string) => Promise<boolean>;
  onComplete: (trace: MatchingAttemptTrace) => Promise<void>;
}>) {
  const { orderedIds: promptIds, byId: promptById } = useShuffledLookup(item.prompts, (prompt) => prompt.promptId);
  const { orderedIds: matchIds, byId: matchById } = useShuffledLookup(item.matches, (match) => match.matchId);
  const [selected, setSelected] = useState<SelectedTile>(null);
  const [matchedPairs, setMatchedPairs] = useState<{ promptId: string; matchId: string }[]>([]);
  const progress = useMemo(() => matchingProgress(matchedPairs, item.prompts.length), [matchedPairs, item.prompts.length]);
  const [wrong, setWrong] = useState<Set<string>>(() => new Set());
  const [submitted, setSubmitted] = useState(false);
  const traceRef = useRef<MatchingAttemptTrace>([]);
  const submittedRef = useRef(false);
  const wrongTimeoutRef = useRef<number | null>(null);
  const [pending, startTransition] = useTransition();

  const complete = result?.graded === true || submitted || progress.complete;
  const tryPair = (promptId: string, matchId: string) => {
    if (!canTryMatchingPair({
      disabled,
      pending,
      complete,
      lockedPromptIds: progress.lockedPromptIds,
      lockedMatchIds: progress.lockedMatchIds,
      promptId,
      matchId
    })) return;
    traceRef.current = [...traceRef.current, { promptId, chosenMatchId: matchId }];
    startTransition(async () => {
      const correct = await onAttempt(promptId, matchId);
      if (correct) {
        const nextMatchedPairs = [...matchedPairs, { promptId, matchId }];
        setMatchedPairs(nextMatchedPairs);
        setSelected(null);
        if (matchingProgress(nextMatchedPairs, item.prompts.length).complete && !submittedRef.current) {
          submittedRef.current = true;
          setSubmitted(true);
          await onComplete(traceRef.current);
        }
        return;
      }
      setWrong(new Set([promptId, matchId]));
      setSelected(null);
      if (wrongTimeoutRef.current !== null) window.clearTimeout(wrongTimeoutRef.current);
      wrongTimeoutRef.current = window.setTimeout(() => setWrong(new Set()), 420);
    });
  };

  const choose = (column: "prompt" | "match", id: string) => {
    if (selected && selected.column !== column) {
      const promptId = column === "prompt" ? id : selected.id;
      const matchId = column === "match" ? id : selected.id;
      tryPair(promptId, matchId);
      return;
    }
    setSelected({ column, id });
  };

  return (
    <section className="flex flex-col gap-4 rounded-md border border-border bg-card p-4">
      <div className="flex items-start gap-2">
        <h2 className="text-lg font-semibold leading-7">{item.question}</h2>
        <GroundedBadge provenance={item.groundingProvenance} />
      </div>
      <p className="text-sm text-muted-foreground">
        {matchedPairs.length} of {item.prompts.length} matched. Tap a clue on the left, then its match on the right.
      </p>
      {/* Two-column tap-pairs (R10): clues left, matches right, each independently shuffled.
          Tapping a tile in either column selects it; tapping one in the other column pairs them. */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Clues</h3>
          {promptIds.map((id) => {
            const prompt = promptById.get(id);
            if (!prompt) return null;
            return (
              <TileButton
                key={id}
                text={prompt.text}
                selected={selected?.column === "prompt" && selected.id === id}
                locked={progress.lockedPromptIds.has(id)}
                wrong={wrong.has(id)}
                disabled={disabled || pending || complete}
                onClick={() => choose("prompt", id)}
              />
            );
          })}
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Matches</h3>
          {matchIds.map((id) => {
            const match = matchById.get(id);
            if (!match) return null;
            return (
              <TileButton
                key={id}
                text={match.text}
                selected={selected?.column === "match" && selected.id === id}
                locked={progress.lockedMatchIds.has(id)}
                wrong={wrong.has(id)}
                disabled={disabled || pending || complete}
                onClick={() => choose("match", id)}
              />
            );
          })}
        </div>
      </div>
      {result?.graded ? (
        <div className="rounded-md border border-border bg-card p-3 text-sm">
          <p className="font-medium">{result.correct ? "Clean sweep." : "Partly matched."}</p>
          <p className="mt-1 text-muted-foreground">
            {result.correctFirstTry} of {result.pairCount} matched on the first try.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function TileButton({
  text,
  selected,
  locked,
  wrong,
  disabled,
  onClick
}: Readonly<{ text: string; selected: boolean; locked: boolean; wrong: boolean; disabled: boolean; onClick: () => void }>) {
  return (
    <motion.div animate={wrong ? { x: [0, -8, 8, -4, 4, 0] } : { x: 0 }} transition={{ duration: 0.32 }}>
      <Button
        type="button"
        variant={locked ? "secondary" : selected ? "secondary" : "outline"}
        disabled={disabled || locked}
        className={cn(
          "h-auto min-h-12 w-full justify-start whitespace-normal text-left",
          locked ? "border-[color:var(--journal-gem)] bg-[color:var(--journal-gem-soft)] text-[color:var(--journal-ink)]" : null,
          selected ? "ring-2 ring-[color:var(--journal-frontier)]" : null
        )}
        onClick={onClick}
      >
        <span className="flex items-start gap-2">
          {locked ? <CheckIcon data-icon="inline-start" /> : null}
          <span>{text}</span>
        </span>
      </Button>
    </motion.div>
  );
}
