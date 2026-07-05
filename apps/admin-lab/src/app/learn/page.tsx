import { redirect } from "next/navigation";
import type { Route } from "next";
import { LearnerNameGate } from "@/components/learn/LearnerNameGate";
import { encodeLearnerStateRef } from "@/components/learn/vocabulary";

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
      <LearnerNameGate action={openJournal} />
    </section>
  );
}
