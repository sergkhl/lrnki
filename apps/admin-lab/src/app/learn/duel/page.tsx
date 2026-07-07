import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftIcon, LockIcon } from "lucide-react";
import { faker } from "@faker-js/faker";
import { DUEL_QUESTION_COUNT } from "@lrnki/application";
import { DuelScreen } from "@/components/learn/DuelScreen";
import { learnerTerm } from "@/components/learn/vocabulary";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { loadDuelSetup } from "@/lib/duel";
import { readLearnerRef } from "@/lib/learnerSession";

// Draw N distinct questions from the eligible pool (session-only; a fresh draw each duel).
function drawQuestions<T>(pool: T[], count: number): T[] {
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

export default async function DuelPage() {
  const learnerStateRef = await readLearnerRef();
  if (!learnerStateRef) redirect("/learn");
  const setup = await loadDuelSetup(learnerStateRef);

  if (!setup || !setup.unlocked) {
    const have = setup?.duelReadyCrystalCount ?? 0;
    const need = setup?.requiredCrystals ?? 6;
    return (
      <section className="mx-auto flex w-full max-w-md flex-col gap-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LockIcon className="size-5" aria-hidden />
              {learnerTerm("duelLockedTitle")}
            </CardTitle>
            <CardDescription>{learnerTerm("duelTagline")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {learnerTerm("duelLockedProgress").replace("{have}", String(have)).replace("{need}", String(need))}
            </p>
            <Progress value={Math.min(100, (have / need) * 100)} />
            <Link href="/learn" className={buttonVariants({ size: "sm", variant: "ghost" })}>
              <ArrowLeftIcon data-icon="inline-start" />
              {learnerTerm("returnToTrail")}
            </Link>
          </CardContent>
        </Card>
      </section>
    );
  }

  const duelId = randomUUID();
  faker.seed(Math.abs([...duelId].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) | 0, 7)));
  const rivalName = faker.person.firstName();
  const questions = drawQuestions(setup.pool, DUEL_QUESTION_COUNT).map((item) => ({ view: item.view, band: item.band }));

  return (
    <section className="mx-auto flex w-full max-w-lg flex-col gap-4 py-6">
      <DuelScreen learnerStateRef={learnerStateRef} duelId={duelId} rivalName={rivalName} questions={questions} />
    </section>
  );
}
