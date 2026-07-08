import { useState, useTransition } from "react";
import { CompassIcon, UserPlusIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { enterSession } from "@/lib/session";
import { learnerTerm } from "./vocabulary";

export type GateError = "name_taken" | "wrong_pin" | "invalid_pin" | "invalid_name";

// Map a session refusal code to its themed copy (ADR-0033 keeps copy in the UI).
export function gateErrorMessage(error: GateError | "rate_limited"): string {
  switch (error) {
    case "name_taken":
      return learnerTerm("nameTakenMessage");
    case "wrong_pin":
      return learnerTerm("wrongPinMessage");
    case "invalid_pin":
      return learnerTerm("invalidPinMessage");
    case "invalid_name":
      return learnerTerm("invalidNameMessage");
    case "rate_limited":
      return learnerTerm("rateLimitedMessage");
  }
}

// The registry gate: one identifier + secret form with two intents. Both branches call
// POST /session, the single PIN-aware route; a wrong PIN never swaps the stored token.
export function LearnerNameGate({ onEntered }: { onEntered: () => void }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<GateError | "rate_limited" | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (intent: "enter" | "create") => {
    startTransition(async () => {
      const result = await enterSession({ intent, learnerStateRef: name, pin });
      if (result.ok) {
        setError(null);
        onEntered();
        return;
      }
      setError(result.error);
    });
  };

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

        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit("enter");
          }}
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="learner-name">{learnerTerm("learnerRefLabel")}</FieldLabel>
              <Input
                id="learner-name"
                name="learnerStateRef"
                autoComplete="username"
                placeholder={learnerTerm("learnerRefPlaceholder")}
                value={name}
                onChange={(event) => setName(event.target.value)}
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
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                required
              />
              <FieldDescription>{learnerTerm("gatePinHint")}</FieldDescription>
            </Field>
          </FieldGroup>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" variant="secondary" className="flex-1" disabled={pending}>
              <CompassIcon data-icon="inline-start" />
              {learnerTerm("enterExplorerAction")}
            </Button>
            <Button type="button" className="flex-1" disabled={pending} onClick={() => submit("create")}>
              <UserPlusIcon data-icon="inline-start" />
              {learnerTerm("createAction")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
