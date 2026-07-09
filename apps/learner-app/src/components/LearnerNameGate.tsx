import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { Compass, UserPlus } from "lucide-react-native";
import { enterSession } from "@/lib/session";
import { Btn, Card, CardDescription, CardTitle } from "./ui";
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
export function LearnerNameGate({ onEntered }: { onEntered: () => void }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<GateError | "rate_limited" | null>(null);
  const [pending, setPending] = useState(false);

  const submit = (intent: "enter" | "create") => {
    setPending(true);
    void (async () => {
      try {
        const result = await enterSession({ intent, learnerStateRef: name, pin });
        if (result.ok) {
          setError(null);
          onEntered();
          return;
        }
        setError(result.error);
      } finally {
        setPending(false);
      }
    })();
  };

  return (
    <Card className="w-full max-w-md gap-4">
      <View className="gap-1">
        <CardTitle>{learnerTerm("gateTitle")}</CardTitle>
        <CardDescription>{learnerTerm("gateDescription")}</CardDescription>
      </View>
      {error ? (
        <View className="rounded-xl border border-destructive bg-card px-3 py-2">
          <Text className="text-sm text-destructive">{gateErrorMessage(error)}</Text>
        </View>
      ) : null}
      <View className="gap-1.5">
        <Text className="text-sm font-medium text-ink">{learnerTerm("learnerRefLabel")}</Text>
        <TextInput
          autoComplete="username"
          autoCapitalize="none"
          placeholder={learnerTerm("learnerRefPlaceholder")}
          placeholderTextColor="#6d6152"
          value={name}
          onChangeText={setName}
          className="rounded-xl border border-line bg-card px-3 py-2.5 text-sm text-ink"
        />
        <Text className="text-xs text-muted">{learnerTerm("gateNameHint")}</Text>
      </View>
      <View className="gap-1.5">
        <Text className="text-sm font-medium text-ink">{learnerTerm("pinLabel")}</Text>
        <TextInput
          inputMode="numeric"
          secureTextEntry
          autoComplete="current-password"
          placeholder={learnerTerm("pinPlaceholder")}
          placeholderTextColor="#6d6152"
          value={pin}
          onChangeText={setPin}
          className="rounded-xl border border-line bg-card px-3 py-2.5 text-sm text-ink"
        />
        <Text className="text-xs text-muted">{learnerTerm("gatePinHint")}</Text>
      </View>
      <View className="gap-2">
        <Btn
          variant="secondary"
          disabled={pending}
          onPress={() => submit("enter")}
          icon={<Compass size={16} color="#241f18" />}
          label={learnerTerm("enterExplorerAction")}
        />
        <Btn
          disabled={pending}
          onPress={() => submit("create")}
          icon={<UserPlus size={16} color="#fdfaf2" />}
          label={learnerTerm("createAction")}
        />
      </View>
    </Card>
  );
}
