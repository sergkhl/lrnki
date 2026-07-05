"use client";

import type { Route } from "next";
import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { CompassIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { encodeLearnerStateRef, learnerTerm } from "./vocabulary";

const STORAGE_KEY = "lrnki:learner-state-ref";
const noStorageSubscription = () => () => {};
const getStoredLearnerRef = () => {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved?.trim() ? saved : null;
};

export function LearnerNameGate({ action }: Readonly<{ action: (formData: FormData) => void }>) {
  const router = useRouter();
  const storedRef = useSyncExternalStore(noStorageSubscription, getStoredLearnerRef, () => null);
  const [switching, setSwitching] = useState(false);

  const openStored = () => {
    if (!storedRef) return;
    router.push(`/learn/${encodeLearnerStateRef(storedRef)}` as Route);
  };

  const rememberAndOpen = (formData: FormData) => {
    const ref = String(formData.get("learnerStateRef") ?? "");
    const encoded = encodeLearnerStateRef(ref);
    if (encoded.length === 0) return;
    window.localStorage.setItem(STORAGE_KEY, ref);
    router.push(`/learn/${encoded}` as Route);
  };

  return (
    <Card className="w-full max-w-md border-[color:var(--journal-line)] bg-[color:var(--journal-panel)]">
      <CardHeader>
        <CardTitle>{learnerTerm("routeName")}</CardTitle>
        <CardDescription>Enter the name on your learning link.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {storedRef && !switching ? (
          <>
            <Button type="button" onClick={openStored}>
              <CompassIcon data-icon="inline-start" />
              Continue as {storedRef}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setSwitching(true)}>
              Use a different name
            </Button>
          </>
        ) : (
          <form action={action} onSubmit={(event) => {
            event.preventDefault();
            rememberAndOpen(new FormData(event.currentTarget));
          }} className="flex flex-col gap-3">
            <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="learnerStateRef">
              {learnerTerm("learnerRefLabel")}
              <Input id="learnerStateRef" name="learnerStateRef" autoComplete="name" placeholder={learnerTerm("learnerRefPlaceholder")} required />
            </label>
            <Button type="submit">
              <CompassIcon data-icon="inline-start" />
              {learnerTerm("enterAction")}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
