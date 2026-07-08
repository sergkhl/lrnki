import { CompassIcon, UserPlusIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { learnerTerm } from "./vocabulary";

export type GateError = "name_taken" | "wrong_pin" | "invalid_pin" | "invalid_name";

// Map a session-route refusal code to its themed copy (ADR-0033 keeps copy in the UI).
function gateErrorMessage(error: GateError): string {
  switch (error) {
    case "name_taken":
      return learnerTerm("nameTakenMessage");
    case "wrong_pin":
      return learnerTerm("wrongPinMessage");
    case "invalid_pin":
      return learnerTerm("invalidPinMessage");
    case "invalid_name":
      return learnerTerm("invalidNameMessage");
  }
}

// The registry gate: one identifier + secret form with two intents. Both branches post to
// `/learn/session`, the single PIN-aware route. Plain server-rendered form — no client state.
export function LearnerNameGate({ error, defaultName }: { error?: GateError; defaultName?: string }) {
  return (
    <Card className="w-full max-w-md border-border bg-card">
      <CardHeader>
        <CardTitle>{learnerTerm("gateTitle")}</CardTitle>
        <CardDescription>{learnerTerm("gateDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{gateErrorMessage(error)}</AlertDescription>
          </Alert>
        ) : null}

        <form action="/learn/session" method="post" className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="learner-name">{learnerTerm("learnerRefLabel")}</FieldLabel>
              <Input
                id="learner-name"
                name="learnerStateRef"
                autoComplete="username"
                placeholder={learnerTerm("learnerRefPlaceholder")}
                defaultValue={defaultName}
                required
              />
              <FieldDescription>{learnerTerm("gateNameHint")}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="learner-pin">{learnerTerm("pinLabel")}</FieldLabel>
              <Input
                id="learner-pin"
                name="pin"
                inputMode="numeric"
                autoComplete="current-password"
                placeholder={learnerTerm("pinPlaceholder")}
                required
              />
              <FieldDescription>{learnerTerm("gatePinHint")}</FieldDescription>
            </Field>
          </FieldGroup>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" name="intent" value="enter" variant="secondary" className="flex-1">
              <CompassIcon data-icon="inline-start" />
              {learnerTerm("enterExplorerAction")}
            </Button>
            <Button type="submit" name="intent" value="create" className="flex-1">
              <UserPlusIcon data-icon="inline-start" />
              {learnerTerm("createAction")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
