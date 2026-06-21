"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { StudyOptionSelectView } from "@/components/study/studyView";

export function OptionSelectCard({
  item,
  onSelect,
  pending = false
}: Readonly<{
  item: StudyOptionSelectView;
  onSelect: (optionId: string) => void;
  pending?: boolean;
}>) {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const selected = item.options.find((option) => option.optionId === selectedOptionId) ?? null;
  const disabled = pending || selectedOptionId !== null;

  const choose = (optionId: string) => {
    if (disabled) return;
    setSelectedOptionId(optionId);
    onSelect(optionId);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{item.groundingProvenance}</Badge>
        <Badge variant="secondary">option select</Badge>
      </div>
      <p className="text-sm font-medium">{item.question}</p>
      <Separator />
      <div className="flex flex-col gap-2">
        {item.options.map((option) => {
          const isSelected = option.optionId === selectedOptionId;
          const variant = isSelected ? (option.isCorrect ? "default" : "destructive") : "outline";
          return (
            <Button
              key={option.optionId}
              type="button"
              variant={variant}
              className="h-auto justify-start whitespace-normal text-left"
              disabled={disabled}
              onClick={() => choose(option.optionId)}
            >
              {option.text}
            </Button>
          );
        })}
      </div>
      {selected ? (
        <p className="text-sm text-muted-foreground">
          {selected.isCorrect ? "Correct. Recording mastery..." : "Incorrect. Recording the attempt..."}
        </p>
      ) : null}
    </div>
  );
}
