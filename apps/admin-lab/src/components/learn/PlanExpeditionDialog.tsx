"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PlanExpeditionForm } from "./PlanExpeditionForm";

export function PlanExpeditionDialog({
  learnerStateRef,
  exampleTopics,
  createExpeditionAction
}: Readonly<{
  learnerStateRef: string;
  exampleTopics: readonly string[];
  createExpeditionAction: (formData: FormData) => Promise<void>;
}>) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" size="sm" />}>
        <PlusIcon data-icon="inline-start" />
        Plan a new expedition
      </DialogTrigger>
      <DialogContent className="learn-theme sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Plan a new expedition</DialogTitle>
          <DialogDescription>Start with a topic. Scouting begins as soon as the expedition is planned.</DialogDescription>
        </DialogHeader>
        <PlanExpeditionForm
          learnerStateRef={learnerStateRef}
          createExpeditionAction={createExpeditionAction}
          exampleTopics={exampleTopics}
          onSubmitted={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
