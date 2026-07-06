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

export function ChartCourseForm({
  learnerStateRef,
  createExpeditionAction
}: Readonly<{
  learnerStateRef: string;
  createExpeditionAction: (formData: FormData) => Promise<void>;
}>) {
  const [topic, setTopic] = useState("");
  const [isPending, startTransition] = useTransition();
  const canSubmit = canPlanExpedition(topic);

  function submitCreate() {
    const formData = new FormData();
    formData.set("learnerStateRef", learnerStateRef);
    formData.set("topic", topic.trim());
    return createExpeditionAction(formData);
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        startTransition(async () => {
          await submitCreate();
        });
      }}
    >
      <input type="hidden" name="learnerStateRef" value={learnerStateRef} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="chart-topic">Topic</FieldLabel>
          <Textarea
            id="chart-topic"
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
      <Button type="submit" disabled={isPending || !canSubmit}>
        <SparklesIcon data-icon="inline-start" />
        {isPending ? "Planning" : learnerTerm("topicDoor")}
      </Button>
    </form>
  );
}
