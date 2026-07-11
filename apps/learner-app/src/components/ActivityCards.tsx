import { View } from "react-native";
import { Check, X } from "lucide-react-native";
import type { StudyImpostorView, StudyOptionSelectView } from "@lrnki/application/projection";
import type { LearnerGradingResult } from "@/lib/api";
import { GroundedBadge } from "./GroundedBadge";
import { useShuffledLookup } from "@/learn/useShuffledLookup";
import { Card, PressableSurface, Text, colors } from "@/ui";

type ActivityResult = LearnerGradingResult | null;

// One-tap graded choice tile shared by option-select and impostor: outline before
// grading, gem-filled for the keyed answer, destructive for a wrong pick. State is
// never color-alone: the keyed answer gets a check, a wrong pick gets an X (U7.3).
function ChoiceTile({
  text,
  chosen,
  keyed,
  graded,
  disabled,
  onPress
}: Readonly<{ text: string; chosen: boolean; keyed: boolean; graded: boolean; disabled: boolean; onPress: () => void }>) {
  // Selection reads as a surface tint, not a boxed frontier border (U6 visual pass):
  // the announced `selected` state plus the fill keeps it accessible without shouting.
  const box = !graded
    ? chosen
      ? "border-line-strong bg-gem-soft"
      : "border-line-strong bg-card"
    : keyed
      ? "border-trail bg-trail"
      : chosen
        ? "border-destructive bg-destructive"
        : "border-line bg-card";
  const onFill = graded && (keyed || chosen);
  return (
    <PressableSurface
      accessibilityLabel={text}
      disabled={disabled || graded}
      selected={chosen}
      busy={disabled && chosen && !graded}
      haptic="selection"
      onPress={onPress}
      className={`min-h-target flex-row items-start gap-2 rounded-control border px-3 py-2.5 ${box} ${disabled && !graded ? "opacity-50" : ""}`}
      pressedClassName="bg-muted-panel"
    >
      {graded && keyed ? <Check size={16} color={colors["on-accent"]} style={{ marginTop: 2 }} /> : null}
      {graded && chosen && !keyed ? <X size={16} color={colors["on-accent"]} style={{ marginTop: 2 }} /> : null}
      <Text variant="label" color={onFill ? "on-accent" : "ink"} className="flex-1">{text}</Text>
    </PressableSurface>
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
    <Card className="gap-4">
      <View className="flex-row items-start gap-2">
        <Text variant="heading" className="flex-1 leading-7">{item.question}</Text>
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
        <View className="rounded-card border border-line bg-card p-3">
          <Text variant="label">{result.correct ? "Correct." : "Not quite."}</Text>
          <Text variant="label" color="muted" className="mt-1 font-normal">{item.explanation}</Text>
        </View>
      ) : null}
    </Card>
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
    <Card className="gap-4">
      <View className="flex-row items-start gap-2">
        <Text variant="heading" className="flex-1 leading-7">{item.question}</Text>
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
        <View className="rounded-card border border-line bg-card p-3">
          <Text variant="label">
            {result.correct ? "Correct. You spotted the fake." : "Not quite. That statement is true."}
          </Text>
          <Text variant="label" color="muted" className="mt-1 font-normal">{item.reveal}</Text>
          {item.lieSource === "sibling" && item.siblingLabel ? (
            <Text variant="caption" color="muted" className="mt-1">
              Actually true of <Text variant="caption" className="font-medium">{item.siblingLabel}</Text>.
            </Text>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}
