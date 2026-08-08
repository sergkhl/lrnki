import { useState } from "react";
import { View } from "react-native";
import { Compass, LogIn, UserPlus } from "lucide-react-native";
import { signInWithEmail, signInWithGoogle, signUpWithEmail, type SessionError } from "@/lib/session";
import { Button, Card, Input, PressableSurface, Text, buttonIconColor } from "@/ui";
import { learnerTerm } from "@/learn/vocabulary";

// Map a refusal to its themed copy (ADR-0033 keeps copy in the UI).
export function sessionErrorMessage(error: SessionError): string {
  switch (error) {
    case "invalid_credentials":
      return learnerTerm("invalidCredentialsMessage");
    case "email_taken":
      return learnerTerm("emailTakenMessage");
    case "invalid_email":
      return learnerTerm("invalidEmailMessage");
    case "weak_password":
      return learnerTerm("weakPasswordMessage");
    case "rate_limited":
      return learnerTerm("rateLimitedMessage");
    case "unavailable":
      return learnerTerm("authUnavailableMessage");
  }
}

type Intent = "enter" | "create";

// The sign-in gate (ADR-0041). Google is the primary route and email + password the fallback,
// which is also the only route the rigs drive — never Google, whose consent screen actively
// blocks automation. The two intents are one form with a toggle rather than two competing
// buttons: sign-up needs a third field, and a learner who mistypes an email on the "Enter"
// path must not silently create a second explorer.
//
// `pending` remembers WHICH route is in flight so only that control shows busy while all of
// them stay locked (single-flight). On success the session module seeds the `me` query itself
// (plan 2026-07-14-001 KTD1/KTD2), so the mounted observer flips onward with no callback —
// the gate simply clears its error and unwinds.
export function SignInGate() {
  const [intent, setIntent] = useState<Intent>("enter");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<SessionError | null>(null);
  const [pending, setPending] = useState<Intent | "google" | null>(null);

  const run = (route: Intent | "google", attempt: () => Promise<{ ok: true } | { ok: false; error: SessionError }>) => {
    if (pending) return;
    setPending(route);
    void (async () => {
      try {
        const result = await attempt();
        setError(result.ok ? null : result.error);
      } finally {
        setPending(null);
      }
    })();
  };

  const creating = intent === "create";

  return (
    <Card className="w-full max-w-md gap-4">
      <View className="gap-1">
        <Text variant="heading">{learnerTerm("gateTitle")}</Text>
        <Text variant="caption" color="muted">{learnerTerm("gateDescription")}</Text>
      </View>
      {error ? (
        <View accessibilityLiveRegion="polite" className="rounded-card border border-destructive bg-card px-3 py-2">
          <Text variant="label" color="destructive">{sessionErrorMessage(error)}</Text>
        </View>
      ) : null}
      <Button
        testID="gate-google"
        disabled={pending !== null && pending !== "google"}
        busy={pending === "google"}
        onPress={() => run("google", signInWithGoogle)}
        icon={<LogIn size={16} color={buttonIconColor("primary")} />}
        label={learnerTerm("googleAction")}
      />
      <View className="flex-row items-center gap-3">
        <View className="h-px flex-1 bg-line" />
        <Text variant="caption" color="muted">{learnerTerm("gateEmailDivider")}</Text>
        <View className="h-px flex-1 bg-line" />
      </View>
      {creating ? (
        <Input
          testID="gate-name"
          label={learnerTerm("learnerRefLabel")}
          hint={learnerTerm("gateNameHint")}
          autoComplete="name"
          placeholder={learnerTerm("learnerRefPlaceholder")}
          value={name}
          onChangeText={setName}
        />
      ) : null}
      <Input
        testID="gate-email"
        label={learnerTerm("emailLabel")}
        hint={learnerTerm("gateEmailHint")}
        autoComplete="email"
        autoCapitalize="none"
        inputMode="email"
        placeholder={learnerTerm("emailPlaceholder")}
        value={email}
        onChangeText={setEmail}
      />
      <Input
        testID="gate-password"
        label={learnerTerm("passwordLabel")}
        hint={learnerTerm("gatePasswordHint")}
        secureTextEntry
        autoCapitalize="none"
        autoComplete={creating ? "new-password" : "current-password"}
        placeholder={learnerTerm("passwordPlaceholder")}
        value={password}
        onChangeText={setPassword}
      />
      <Button
        testID={creating ? "gate-create" : "gate-enter"}
        variant="secondary"
        disabled={pending !== null && pending !== intent}
        busy={pending === intent}
        onPress={() =>
          run(intent, () =>
            creating
              ? signUpWithEmail({ email, password, name })
              : signInWithEmail({ email, password })
          )
        }
        icon={
          creating
            ? <UserPlus size={16} color={buttonIconColor("secondary")} />
            : <Compass size={16} color={buttonIconColor("secondary")} />
        }
        label={creating ? learnerTerm("createAction") : learnerTerm("enterExplorerAction")}
      />
      <PressableSurface
        testID="gate-toggle-intent"
        accessibilityRole="button"
        disabled={pending !== null}
        onPress={() => {
          setIntent(creating ? "enter" : "create");
          setError(null);
        }}
      >
        <Text variant="caption" color="muted">
          {creating ? learnerTerm("toEnterAction") : learnerTerm("toCreateAction")}
        </Text>
      </PressableSurface>
    </Card>
  );
}
