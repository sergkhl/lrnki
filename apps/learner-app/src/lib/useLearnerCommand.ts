import { useRef, useState } from "react";
import { commandFeedback, learnerTerm } from "@/learn/vocabulary";
import { dispatchLearnerCommand, type LearnerCommandDto, type LearnerTransitionDto } from "./actions";

export type AppliedTransition = Extract<LearnerTransitionDto, { status: "applied" }>;

// The ref guards two taps in the same render, before disabled state reaches the UI.
export function useLearnerCommand(stateVersion: string, onBusyChange?: (busy: boolean) => void) {
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (command: LearnerCommandDto, onApplied?: (result: AppliedTransition) => void) => {
    if (inFlight.current) return null;
    inFlight.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    try {
      const result = await dispatchLearnerCommand({ expectedStateVersion: stateVersion, command, onApplied });
      if (result.status !== "applied") {
        setError(commandFeedback(result.status, result.status === "refused" ? result.reason : null));
      }
      return result;
    } catch {
      setError(learnerTerm("commandUnavailable"));
      return null;
    } finally {
      inFlight.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  };
  return { busy, error, run, isPending: () => inFlight.current };
}
