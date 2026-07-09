import { Pressable, Text, View } from "react-native";
import { Check, X } from "lucide-react-native";
import type { StudyImpostorView, StudyOptionSelectView } from "@lrnki/application/projection";
import type { LearnerGradingResult } from "@/lib/api";
import { GroundedBadge } from "./GroundedBadge";
import { useShuffledLookup } from "@/learn/useShuffledLookup";

type ActivityResult = LearnerGradingResult | null;

// One-tap graded choice tile shared by option-select and impostor: outline before
// grading, gem-filled for the keyed answer, destructive for a wrong pick.
function ChoiceTile({
  text,
  chosen,
  keyed,
  graded,
  disabled,
  onPress
}: Readonly<{ text: string; chosen: boolean; keyed: boolean; graded: boolean; disabled: boolean; onPress: () => void }>) {
  const box = !graded
    ? chosen
      ? "border-frontier bg-gem-soft"
      : "border-line bg-card"
    : keyed
      ? "border-trail bg-trail"
      : chosen
        ? "border-destructive bg-destructive"
        : "border-line bg-card";
  const ink = graded && (keyed || chosen) ? "text-[#fdfaf2]" : "text-ink";
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || graded}
      onPress={onPress}
      className={`min-h-12 flex-row items-start gap-2 rounded-xl border px-3 py-2.5 ${box} ${disabled && !graded ? "opacity-50" : ""}`}
    >
      {graded && keyed ? <Check size={16} color="#fdfaf2" style={{ marginTop: 2 }} /> : null}
      {graded && chosen && !keyed ? <X size={16} color="#fdfaf2" style={{ marginTop: 2 }} /> : null}
      <Text className={`flex-1 text-sm font-medium ${ink}`}>{text}</Text>
    </Pressable>
  );
}

export function OptionSelectBody({
  item,
  selectedId,
  result,
  disabled,
  onSelect
}: Readonly<{
  item: StudyOptionSelectView;
  selectedId: string | null;
  result: ActivityResult;
  disabled: boolean;
  onSelect: (optionId: string) => void;
}>) {
  const { orderedIds, byId: optionById } = useShuffledLookup(item.options, (option) => option.optionId);
  const graded = result?.graded === true;
  return (
    <View className="gap-4 rounded-xl border border-line bg-card p-4">
      <View className="flex-row items-start gap-2">
        <Text className="flex-1 text-lg font-semibold leading-7 text-ink">{item.question}</Text>
        <GroundedBadge provenance={item.groundingProvenance} />
      </View>
      <View className="gap-2">
        {orderedIds.map((optionId) => {
          const option = optionById.get(optionId);
          if (!option) return null;
          return (
            <ChoiceTile
              key={option.optionId}
              text={option.text}
              chosen={graded && result.graded ? option.optionId === result.chosenId : option.optionId === selectedId}
              keyed={graded && result.graded && option.optionId === result.keyedCorrectId}
              graded={graded}
              disabled={disabled}
              onPress={() => onSelect(option.optionId)}
            />
          );
        })}
      </View>
      {result?.graded ? (
        <View className="rounded-xl border border-line bg-card p-3">
          <Text className="text-sm font-medium text-ink">{result.correct ? "Correct." : "Not quite."}</Text>
          <Text className="mt-1 text-sm text-muted">{item.explanation}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function ImpostorBody({
  item,
  selectedId,
  result,
  disabled,
  onSelect
}: Readonly<{
  item: StudyImpostorView;
  selectedId: string | null;
  result: ActivityResult;
  disabled: boolean;
  onSelect: (statementId: string) => void;
}>) {
  const { orderedIds, byId: statementById } = useShuffledLookup(item.statements, (statement) => statement.statementId);
  const graded = result?.graded === true;
  return (
    <View className="gap-4 rounded-xl border border-line bg-card p-4">
      <View className="flex-row items-start gap-2">
        <Text className="flex-1 text-lg font-semibold leading-7 text-ink">{item.question}</Text>
        <GroundedBadge provenance={item.groundingProvenance} />
      </View>
      <View className="gap-2">
        {orderedIds.map((statementId) => {
          const statement = statementById.get(statementId);
          if (!statement) return null;
          return (
            <ChoiceTile
              key={statement.statementId}
              text={statement.text}
              chosen={graded && result.graded ? statement.statementId === result.chosenId : statement.statementId === selectedId}
              keyed={graded && result.graded && statement.statementId === result.keyedCorrectId}
              graded={graded}
              disabled={disabled}
              onPress={() => onSelect(statement.statementId)}
            />
          );
        })}
      </View>
      {result?.graded ? (
        <View className="rounded-xl border border-line bg-card p-3">
          <Text className="text-sm font-medium text-ink">
            {result.correct ? "Correct. You spotted the fake." : "Not quite. That statement is true."}
          </Text>
          <Text className="mt-1 text-sm text-muted">{item.reveal}</Text>
          {item.lieSource === "sibling" && item.siblingLabel ? (
            <Text className="mt-1 text-xs text-muted">
              Actually true of <Text className="font-medium text-ink">{item.siblingLabel}</Text>.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
