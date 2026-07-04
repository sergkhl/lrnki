import { redirect } from "next/navigation";
import type { Route } from "next";
import { CompassIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { encodeLearnerStateRef, learnerTerm } from "@/components/learn/vocabulary";

async function openJournal(formData: FormData) {
  "use server";

  const learnerStateRef = String(formData.get("learnerStateRef") ?? "");
  const encoded = encodeLearnerStateRef(learnerStateRef);
  if (encoded.length === 0) {
    redirect("/learn" as Route);
  }
  redirect(`/learn/${encoded}` as Route);
}

export default function LearnLandingPage() {
  return (
    <section className="flex min-h-[calc(100svh-2rem)] items-center justify-center">
      <Card className="w-full max-w-md border-[color:var(--journal-line)] bg-[color:var(--journal-panel)]">
        <CardHeader>
          <CardTitle>{learnerTerm("routeName")}</CardTitle>
          <CardDescription>Enter the name on your learning link.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={openJournal} className="flex flex-col gap-3">
            <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="learnerStateRef">
              {learnerTerm("learnerRefLabel")}
              <Input
                id="learnerStateRef"
                name="learnerStateRef"
                autoComplete="name"
                placeholder={learnerTerm("learnerRefPlaceholder")}
                required
              />
            </label>
            <Button type="submit">
              <CompassIcon data-icon="inline-start" />
              {learnerTerm("enterAction")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
