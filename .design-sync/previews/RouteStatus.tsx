import { RouteStatus } from "@lrnki/learner-app";

/** The whole-route status surface — what a screen renders INSTEAD of its content while
 * loading, or when it cannot proceed. It fills the route and reads safe-area insets, so
 * it is returned early from a route, never nested inside one. */
export function Loading() {
  return <RouteStatus tone="loading" title="Finding your expedition…" />;
}

/** `error` is a failure the learner can retry. Actions are ordered with the recovery
 * first; the fallback route out takes the `outline` variant. */
export function Error() {
  return (
    <RouteStatus
      tone="error"
      title="That expedition could not be loaded"
      message="The trail is still there — this was a problem reaching it."
      actions={[
        { label: "Try again", onPress: () => {} },
        { label: "Back to the map", variant: "outline", onPress: () => {} }
      ]}
    />
  );
}

/** `unavailable` is a state retrying cannot fix — nothing to show yet, rather than
 * something that went wrong. */
export function Unavailable() {
  return (
    <RouteStatus
      tone="unavailable"
      title="No expeditions yet"
      message="Add a source and the first expedition can be drawn from it."
      actions={[{ label: "Choose a source", onPress: () => {} }]}
    />
  );
}

/** An action can report its own in-flight state without blocking the surface. */
export function Retrying() {
  return (
    <RouteStatus
      tone="error"
      title="That expedition could not be loaded"
      message="The trail is still there — this was a problem reaching it."
      actions={[
        { label: "Trying again", busy: true, onPress: () => {} },
        { label: "Back to the map", variant: "outline", onPress: () => {} }
      ]}
    />
  );
}
