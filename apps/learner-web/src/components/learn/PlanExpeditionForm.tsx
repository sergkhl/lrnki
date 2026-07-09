"use client";

import { useState, useTransition } from "react";
import { SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { learnerTerm } from "./vocabulary";

export function canPlanExpedition(topic: string): boolean {
  return topic.trim().length > 0;
}

export function PlanExpeditionForm({
  onCreate,
  exampleTopics = [],
  onSubmitted
}: Readonly<{
  onCreate: (topic: string) => Promise<void>;
  exampleTopics?: readonly string[];
  onSubmitted?: () => void;
}>) {
  const [topic, setTopic] = useState("");
  const [isPending, startTransition] = useTransition();
  const canSubmit = canPlanExpedition(topic);

  function submitCreate() {
    return onCreate(topic.trim());
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        startTransition(async () => {
          await submitCreate();
          onSubmitted?.();
        });
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="generate-topic">Topic</FieldLabel>
          <Textarea
            id="generate-topic"
            name="topic"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="Build intuition for spaced practice, write safer database migrations, or understand supply chains"
            required
            aria-invalid={!canSubmit && topic.length > 0 ? true : undefined}
            className="min-h-28"
          />
          <FieldDescription>One topic, learning goal, or course idea.</FieldDescription>
        </Field>
      </FieldGroup>
      {exampleTopics.length ? (
        <div className="flex flex-wrap gap-2" aria-label="Example topics">
          {exampleTopics.map((example) => (
            <Button key={example} type="button" variant="outline" size="sm" onClick={() => setTopic(example)}>
              {example}
            </Button>
          ))}
        </div>
      ) : null}
      <Button type="submit" disabled={isPending || !canSubmit}>
        <SparklesIcon data-icon="inline-start" />
        {isPending ? "Planning" : learnerTerm("topicDoor")}
      </Button>
    </form>
  );
}
