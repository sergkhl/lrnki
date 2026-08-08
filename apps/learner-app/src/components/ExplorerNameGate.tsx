import { useState } from "react";
import { View } from "react-native";
import { UserPlus } from "lucide-react-native";
import { nameExplorer, type SessionError } from "@/lib/session";
import { sessionErrorMessage } from "./SignInGate";
import { Button, Card, Input, Text, buttonIconColor } from "@/ui";
import { learnerTerm } from "@/learn/vocabulary";

// First-run explorer naming (D7), shown exactly once — `profileComplete` is what makes it once,
// and `nameExplorer` writes the name and the flag in a single call.
//
// The point of the screen is consent, not data entry: Google hands back a real legal name, and
// the weekly leaderboard is shared across every learner on the shared environment. Prefilling
// the provider name keeps it one tap for anyone who does not care, while making the moment where
// a real name becomes public an explicit choice for anyone who does.
export function ExplorerNameGate({ suggestedName }: Readonly<{ suggestedName: string }>) {
  const [name, setName] = useState(suggestedName);
  const [error, setError] = useState<SessionError | "invalid_name" | null>(null);
  const [pending, setPending] = useState(false);

  const submit = () => {
    if (pending) return;
    const chosen = name.trim();
    // Refused locally rather than at the server: Better Auth accepts an empty name, so nothing
    // upstream would stop a blank explorer from reaching the board.
    if (!chosen) {
      setError("invalid_name");
      return;
    }
    setPending(true);
    void (async () => {
      try {
        const result = await nameExplorer(chosen);
        setError(result.ok ? null : result.error);
      } finally {
        setPending(false);
      }
    })();
  };

  return (
    <Card className="w-full max-w-md gap-4">
      <View className="gap-1">
        <Text variant="heading">{learnerTerm("nameGateTitle")}</Text>
        <Text variant="caption" color="muted">{learnerTerm("nameGateDescription")}</Text>
      </View>
      {error ? (
        <View accessibilityLiveRegion="polite" className="rounded-card border border-destructive bg-card px-3 py-2">
          <Text variant="label" color="destructive">
            {error === "invalid_name" ? learnerTerm("invalidNameMessage") : sessionErrorMessage(error)}
          </Text>
        </View>
      ) : null}
      <Input
        testID="name-gate-name"
        label={learnerTerm("learnerRefLabel")}
        hint={learnerTerm("gateNameHint")}
        autoComplete="name"
        placeholder={learnerTerm("learnerRefPlaceholder")}
        value={name}
        onChangeText={setName}
      />
      <Button
        testID="name-gate-submit"
        busy={pending}
        onPress={submit}
        icon={<UserPlus size={16} color={buttonIconColor("primary")} />}
        label={learnerTerm("createAction")}
      />
    </Card>
  );
}
