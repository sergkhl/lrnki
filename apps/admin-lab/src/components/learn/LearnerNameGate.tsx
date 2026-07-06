import { CompassIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { learnerTerm } from "./vocabulary";

export function LearnerNameGate() {
  return (
    <Card className="w-full max-w-md border-border bg-card">
      <CardHeader>
        <CardTitle>{learnerTerm("routeName")}</CardTitle>
        <CardDescription>Enter the name on your learning link.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <form action="/learn/session" method="post" className="flex flex-col gap-3">
          <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="learnerStateRef">
            {learnerTerm("learnerRefLabel")}
            <Input id="learnerStateRef" name="learnerStateRef" autoComplete="name" placeholder={learnerTerm("learnerRefPlaceholder")} required />
          </label>
          <Button type="submit">
            <CompassIcon data-icon="inline-start" />
            {learnerTerm("enterAction")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
