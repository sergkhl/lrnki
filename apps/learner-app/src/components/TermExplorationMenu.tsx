import { useState } from "react";
import { View } from "react-native";
import { Compass, Search } from "lucide-react-native";
import { requestScaffoldDetour, type ScaffoldTermSource } from "@/lib/actions";
import { Button, IconButton, Text, colors } from "@/ui";
import { learnerTerm } from "@/learn/vocabulary";

// The quiet Explorable Term overflow (plan 2026-07-12-002 U6, KTD11, R4). One 44px More action
// in the Activity Sheet header area reveals AT MOST three `Explore "…"` actions as an inline
// disclosure — no inline highlights, no general Explain action. Selecting a term requests-or-
// restores a Scaffold Detour (server verifies the advertised term); success closes the activity
// into the root progress dialog via `onRequested`, a refusal keeps the disclosure open with
// retryable copy (R5). Renders nothing when the current activity advertises no terms (AE2).
export function TermExplorationMenu({
  enrichmentId,
  source,
  terms,
  onRequested
}: Readonly<{
  enrichmentId: string;
  source: ScaffoldTermSource;
  terms: string[];
  onRequested: (detourId: string) => void;
}>) {
  const [open, setOpen] = useState(false);
  const [busyTerm, setBusyTerm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Server caps at three, but slice defensively so the surface never over-renders (R4).
  const visible = terms.slice(0, 3);
  if (visible.length === 0) return null;

  const request = (term: string) => {
    if (busyTerm !== null) return; // a single in-flight request; a duplicate press cannot double-fire
    setBusyTerm(term);
    setError(null);
    void requestScaffoldDetour({ enrichmentId, source, term })
      .then((outcome) => {
        if (outcome.created) {
          setOpen(false);
          onRequested(outcome.detourId);
        } else {
          setError(learnerTerm("termRequestFailed"));
        }
      })
      .catch(() => setError(learnerTerm("termRequestFailed")))
      .finally(() => setBusyTerm(null));
  };

  return (
    <View className="border-b border-line bg-card px-4 py-2" testID="term-exploration-menu">
      <View className="mx-auto w-full max-w-3xl flex-row items-center gap-2">
        <Text variant="caption" color="muted" className="min-w-0 flex-1" numberOfLines={1}>
          {learnerTerm("termMenuHint")}
        </Text>
        <IconButton
          icon={<Search size={18} color={colors.ink} />}
          accessibilityLabel={learnerTerm("termMenuLabel")}
          variant="outline"
          expanded={open}
          onPress={() => setOpen((current) => !current)}
          testID="term-menu-toggle"
        />
      </View>
      {open ? (
        <View className="mx-auto mt-2 w-full max-w-3xl gap-2">
          {visible.map((term) => (
            <Button
              key={term}
              variant="outline"
              size="compact"
              busy={busyTerm === term}
              disabled={busyTerm !== null && busyTerm !== term}
              onPress={() => request(term)}
              icon={<Compass size={14} color={colors.ink} />}
              label={`${learnerTerm("exploreTermAction")} “${term}”`}
              accessibilityLabel={`${learnerTerm("exploreTermAction")} ${term}`}
              className="justify-start"
              testID={`explore-term-${term}`}
            />
          ))}
          {error ? (
            <Text variant="label" color="destructive" className="font-normal">
              {error}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
