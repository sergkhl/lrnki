import { useState } from "react";
import { View } from "react-native";
import { Compass, UserPlus } from "lucide-react-native";
import { enterSession } from "@/lib/session";
import { Button, Card, Input, Text, buttonIconColor } from "@/ui";
import { learnerTerm } from "@/learn/vocabulary";

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
// `pending` remembers WHICH intent is in flight so only that button shows busy while
// both stay locked (single-flight, U2 scenario 2). On success `enterSession` seeds the
// `me` query itself (plan 2026-07-14-001 KTD1/KTD2), so the mounted observer flips to the
// Journal with no callback — the gate simply clears its error and unwinds.
export function LearnerNameGate() {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<GateError | "rate_limited" | null>(null);
  const [pending, setPending] = useState<"enter" | "create" | null>(null);

  const submit = (intent: "enter" | "create") => {
    if (pending) return;
    setPending(intent);
    void (async () => {
      try {
        const result = await enterSession({ intent, learnerStateRef: name, pin });
        if (result.ok) {
          setError(null);
          return;
        }
        setError(result.error);
      } finally {
        setPending(null);
      }
    })();
  };

  return (
    <Card className="w-full max-w-md gap-4">
      <View className="gap-1">
        <Text variant="heading">{learnerTerm("gateTitle")}</Text>
        <Text variant="caption" color="muted">{learnerTerm("gateDescription")}</Text>
      </View>
      {error ? (
        <View accessibilityLiveRegion="polite" className="rounded-card border border-destructive bg-card px-3 py-2">
          <Text variant="label" color="destructive">{gateErrorMessage(error)}</Text>
        </View>
      ) : null}
      <Input
        testID="gate-name"
        label={learnerTerm("learnerRefLabel")}
        hint={learnerTerm("gateNameHint")}
        autoComplete="username"
        autoCapitalize="none"
        placeholder={learnerTerm("learnerRefPlaceholder")}
        value={name}
        onChangeText={setName}
      />
      <Input
        testID="gate-pin"
        label={learnerTerm("pinLabel")}
        hint={learnerTerm("gatePinHint")}
        inputMode="numeric"
        secureTextEntry
        autoComplete="current-password"
        placeholder={learnerTerm("pinPlaceholder")}
        value={pin}
        onChangeText={setPin}
      />
      <View className="gap-2">
        <Button
          variant="secondary"
          disabled={pending === "create"}
          busy={pending === "enter"}
          onPress={() => submit("enter")}
          icon={<Compass size={16} color={buttonIconColor("secondary")} />}
          label={learnerTerm("enterExplorerAction")}
        />
        <Button
          disabled={pending === "enter"}
          busy={pending === "create"}
          onPress={() => submit("create")}
          icon={<UserPlus size={16} color={buttonIconColor("primary")} />}
          label={learnerTerm("createAction")}
        />
      </View>
    </Card>
  );
}
