"use client";

import { useState, useTransition } from "react";
import { SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { learnerTerm } from "./vocabulary";

type InferDomainResult = { ok: true; declaredDomain: string } | { ok: false; message: string };

export type ChartCourseSubmitStep = "idle" | "infer" | "create" | "blocked";

export function nextChartCourseSubmitStep(input: {
  topic: string;
  declaredDomain: string;
  domainConfirmationRevealed: boolean;
}): ChartCourseSubmitStep {
  if (!input.topic.trim()) return "blocked";
  if (input.declaredDomain.trim()) return "create";
  return input.domainConfirmationRevealed ? "blocked" : "infer";
}

export function ChartCourseForm({
  learnerStateRef,
  inferDomainAction,
  createExpeditionAction
}: Readonly<{
  learnerStateRef: string;
  inferDomainAction: (input: { topic: string }) => Promise<InferDomainResult>;
  createExpeditionAction: (formData: FormData) => Promise<void>;
}>) {
  const [topic, setTopic] = useState("");
  const [declaredDomain, setDeclaredDomain] = useState("");
  const [domainConfirmationRevealed, setDomainConfirmationRevealed] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const submitStep = nextChartCourseSubmitStep({ topic, declaredDomain, domainConfirmationRevealed });

  function submitCreate() {
    const formData = new FormData();
    formData.set("learnerStateRef", learnerStateRef);
    formData.set("topic", topic.trim());
    formData.set("declaredDomain", declaredDomain.trim());
    return createExpeditionAction(formData);
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage("");
        if (submitStep === "blocked") {
          setMessage(topic.trim() ? "Name the field before charting." : "Add a topic first.");
          setDomainConfirmationRevealed(true);
          return;
        }
        startTransition(async () => {
          if (submitStep === "create") {
            await submitCreate();
            return;
          }
          const result = await inferDomainAction({ topic: topic.trim() });
          setDomainConfirmationRevealed(true);
          if (result.ok) {
            setDeclaredDomain(result.declaredDomain);
            setMessage("Check the field, then chart the course.");
          } else {
            setDeclaredDomain("");
            setMessage(result.message);
          }
        });
      }}
    >
      <input type="hidden" name="learnerStateRef" value={learnerStateRef} />
      <FieldGroup>
        <Field data-invalid={message && !topic.trim() ? true : undefined}>
          <FieldLabel htmlFor="chart-topic">Topic</FieldLabel>
          <Textarea
            id="chart-topic"
            name="topic"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="Build intuition for spaced practice, write safer database migrations, or understand supply chains"
            required
            aria-invalid={message && !topic.trim() ? true : undefined}
            className="min-h-28"
          />
          <FieldDescription>One topic, learning goal, or course idea.</FieldDescription>
        </Field>
        <Field data-invalid={message && domainConfirmationRevealed && !declaredDomain.trim() ? true : undefined}>
          <FieldLabel htmlFor="chart-domain">Declared Domain</FieldLabel>
          <Input
            id="chart-domain"
            name="declaredDomain"
            value={declaredDomain}
            onChange={(event) => {
              setDeclaredDomain(event.target.value);
              setDomainConfirmationRevealed(true);
            }}
            placeholder="Optional field of study"
            aria-invalid={message && domainConfirmationRevealed && !declaredDomain.trim() ? true : undefined}
          />
          <FieldDescription>
            {domainConfirmationRevealed ? "Edit the field before charting." : "Leave blank to infer and confirm it first."}
          </FieldDescription>
          {message ? <FieldError>{message}</FieldError> : null}
        </Field>
      </FieldGroup>
      <Button type="submit" disabled={isPending || submitStep === "blocked"}>
        <SparklesIcon data-icon="inline-start" />
        {isPending ? "Charting" : submitStep === "infer" ? "Find field" : learnerTerm("topicDoor")}
      </Button>
    </form>
  );
}
