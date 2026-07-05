"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { CheckIcon } from "lucide-react";
import { motion } from "motion/react";
import type { MatchingAttemptTrace, StudyMatchingView } from "@lrnki/application";
import type { LearnerMatchingResult } from "@/app/learn/[learnerStateRef]/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GroundedBadge } from "./GroundedBadge";
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
  const lockedPromptIds = useMemo(() => new Set(matchedPairs.map((pair) => pair.promptId)), [matchedPairs]);
  const lockedMatchIds = useMemo(() => new Set(matchedPairs.map((pair) => pair.matchId)), [matchedPairs]);
  const [wrong, setWrong] = useState<Set<string>>(() => new Set());
  const [submitted, setSubmitted] = useState(false);
  const traceRef = useRef<MatchingAttemptTrace>([]);
  const submittedRef = useRef(false);
  const wrongTimeoutRef = useRef<number | null>(null);
  const [pending, startTransition] = useTransition();

  const complete = result?.graded === true || submitted;
  const tryPair = (promptId: string, matchId: string) => {
    if (disabled || pending || complete || lockedPromptIds.has(promptId)) return;
    traceRef.current = [...traceRef.current, { promptId, chosenMatchId: matchId }];
    startTransition(async () => {
      const correct = await onAttempt(promptId, matchId);
      if (correct) {
        const nextMatchedPairs = [...matchedPairs, { promptId, matchId }];
        setMatchedPairs(nextMatchedPairs);
        setSelected(null);
        if (nextMatchedPairs.length === item.prompts.length && !submittedRef.current) {
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
    <section className="flex flex-col gap-4 rounded-md border border-[color:var(--journal-line)] bg-[color:var(--journal-panel)] p-4">
      <div className="flex items-start gap-2">
        <h2 className="text-lg font-semibold leading-7">{item.question}</h2>
        <GroundedBadge provenance={item.groundingProvenance} />
      </div>
      <p className="text-sm text-muted-foreground">
        {matchedPairs.length} of {item.prompts.length} matched. Tap a field clue, then tap its match.
      </p>
      <div className="flex flex-wrap gap-2">
        {promptIds.map((id) => {
          const prompt = promptById.get(id);
          if (!prompt) return null;
          return (
            <TileButton
              key={id}
              text={prompt.text}
              compact
              selected={selected?.column === "prompt" && selected.id === id}
              locked={lockedPromptIds.has(id)}
              wrong={wrong.has(id)}
              disabled={disabled || pending || complete}
              onClick={() => choose("prompt", id)}
            />
          );
        })}
      </div>
      <div className="flex flex-col gap-2">
        {matchIds.map((id) => {
          const match = matchById.get(id);
          if (!match) return null;
          return (
            <TileButton
              key={id}
              text={match.text}
              selected={selected?.column === "match" && selected.id === id}
              locked={lockedMatchIds.has(id)}
              wrong={wrong.has(id)}
              disabled={disabled || pending || complete}
              onClick={() => choose("match", id)}
            />
          );
        })}
      </div>
      {result?.graded ? (
        <div className="rounded-md border border-[color:var(--journal-line)] bg-[color:var(--journal-panel)] p-3 text-sm">
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
  compact = false,
  onClick
}: Readonly<{ text: string; selected: boolean; locked: boolean; wrong: boolean; disabled: boolean; compact?: boolean; onClick: () => void }>) {
  return (
    <motion.div animate={wrong ? { x: [0, -8, 8, -4, 4, 0] } : { x: 0 }} transition={{ duration: 0.32 }}>
      <Button
        type="button"
        variant={locked ? "default" : selected ? "secondary" : "outline"}
        disabled={disabled || locked}
        className={cn(
          "h-auto whitespace-normal text-left",
          compact ? "min-h-9 max-w-full justify-start px-3 py-2 text-sm" : "min-h-12 w-full justify-start",
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
