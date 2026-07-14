import { ActivityIndicator, View } from "react-native";
import { Button, type ButtonVariant } from "./actions";
import { AppText, Screen } from "./foundation";
import { colors } from "./tokens";

// One presentational route-status surface (plan 2026-07-14-001 KTD4). It renders a
// consistent progress / message / action anatomy for a route's non-data states; it does
// NOT interpret React Query — each route decides which of its pending/error/unavailable
// branches maps to which tone and supplies its own copy and recovery actions (R6). This is
// deliberately not a data-fetching wrapper: keeping the branching at the route boundary is
// what lets Journal keep the seeded session on a Journal-fetch failure while Bootstrap and
// the trail routes make their own recovery choices.

export type RouteStatusTone = "loading" | "error" | "unavailable";

export type RouteStatusAction = Readonly<{
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  busy?: boolean;
}>;

export function RouteStatus({
  tone,
  title,
  message,
  actions
}: Readonly<{
  tone: RouteStatusTone;
  title: string;
  // A loading tone reads `title` as the accessible progress label; `title` is always the
  // visible headline for error/unavailable tones.
  message?: string;
  actions?: readonly RouteStatusAction[];
}>) {
  return (
    <Screen className="items-center justify-center gap-3 p-6">
      <View testID="route-status" accessibilityRole={tone === "loading" ? "progressbar" : undefined} className="items-center gap-3">
        {tone === "loading" ? <ActivityIndicator size="large" color={colors.gem} accessibilityLabel={title} /> : null}
        <AppText variant={tone === "loading" ? "label" : "title"} color={tone === "loading" ? "muted" : "ink"} className="text-center">
          {title}
        </AppText>
        {message ? (
          <AppText variant="label" color="muted" className="text-center font-normal">
            {message}
          </AppText>
        ) : null}
        {actions && actions.length > 0 ? (
          <View className="flex-row flex-wrap justify-center gap-2">
            {actions.map((action) => (
              <Button
                key={action.label}
                variant={action.variant ?? "primary"}
                busy={action.busy}
                onPress={action.onPress}
                label={action.label}
              />
            ))}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
