import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, LockIcon } from "lucide-react";
import { faker } from "@faker-js/faker";
import { DUEL_QUESTION_COUNT } from "@lrnki/application";
import { DuelScreen, type DuelQuestion } from "@/components/learn/DuelScreen";
import { learnerTerm } from "@/components/learn/vocabulary";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { duelSetupQuery } from "@/lib/queries";

// Draw N distinct questions from the eligible pool (session-only; a fresh draw each duel).
function drawQuestions<T>(pool: T[], count: number): T[] {
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

export function DuelPage() {
  const setup = useQuery(duelSetupQuery);

  // One duel per mount: the id, seeded rival name, and question draw are fixed the
  // moment the pool arrives (the SSR page did this per request).
  const duel = useMemo(() => {
    if (!setup.data?.unlocked) return null;
    const duelId = crypto.randomUUID();
    faker.seed(Math.abs([...duelId].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) | 0, 7)));
    const rivalName = faker.person.firstName();
    const questions: DuelQuestion[] = drawQuestions(setup.data.pool, DUEL_QUESTION_COUNT).map((item) => ({
      view: item.view,
      band: item.band
    }));
    return { duelId, rivalName, questions };
  }, [setup.data]);

  if (setup.isPending) return null;

  if (!duel) {
    const have = setup.data?.duelReadyCrystalCount ?? 0;
    const need = setup.data?.requiredCrystals ?? 6;
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
            <Link to="/" className={buttonVariants({ size: "sm", variant: "ghost" })}>
              <ArrowLeftIcon data-icon="inline-start" />
              {learnerTerm("returnToTrail")}
            </Link>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-lg flex-col gap-4 py-6">
      <DuelScreen duelId={duel.duelId} rivalName={duel.rivalName} questions={duel.questions} />
    </section>
  );
}
