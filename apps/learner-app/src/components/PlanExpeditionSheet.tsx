import { useState } from "react";
import { ScrollView, View } from "react-native";
import { Plus, Sparkles } from "lucide-react-native";
import { BottomSheet, Button, Input, OverlayHeader, PressableSurface, Text, buttonIconColor, colors } from "@/ui";
import { learnerTerm } from "@/learn/vocabulary";

export function canPlanExpedition(topic: string): boolean {
  return topic.trim().length > 0;
}

// The plan-expedition entry (R9): a keyboard-safe bottom sheet with a topic field and
// tappable example chips. Dismissal is blocked while the creation request is pending
// (AE4); scouting begins as soon as the expedition is planned.
export function PlanExpeditionSheet({
  exampleTopics,
  onCreate
}: Readonly<{
  exampleTopics: readonly string[];
  onCreate: (topic: string) => Promise<void>;
}>) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [pending, setPending] = useState(false);
  const canSubmit = canPlanExpedition(topic);

  const submit = () => {
    if (!canSubmit || pending) return;
    setPending(true);
    void (async () => {
      try {
        await onCreate(topic.trim());
        setTopic("");
        setOpen(false);
      } finally {
        setPending(false);
      }
    })();
  };

  return (
    <>
      <Button
        variant="primary"
        onPress={() => setOpen(true)}
        icon={<Plus size={16} color={buttonIconColor("primary")} />}
        label="Plan a new expedition"
      />
      <BottomSheet open={open} onOpenChange={setOpen} dismissBlocked={pending}>
        <OverlayHeader
          icon={<Sparkles size={20} color={colors.ink} />}
          title="Plan a new expedition"
          description="Start with a topic. Scouting begins as soon as the expedition is planned."
          onClose={() => setOpen(false)}
          closeDisabled={pending}
        />
        <ScrollView contentContainerClassName="gap-4 p-4" keyboardShouldPersistTaps="handled">
          <Input
            label="Topic"
            hint="One topic, learning goal, or course idea."
            multiline
            value={topic}
            onChangeText={setTopic}
            placeholder="Build intuition for spaced practice, write safer database migrations, or understand supply chains"
            className="min-h-0"
            inputStyle={{ minHeight: 112, textAlignVertical: "top" }}
          />
          {exampleTopics.length ? (
            <View className="flex-row flex-wrap gap-2">
              {exampleTopics.map((example) => (
                <PressableSurface
                  key={example}
                  accessibilityLabel={`Use example topic: ${example}`}
                  onPress={() => setTopic(example)}
                  className="min-h-target justify-center rounded-control border border-line-strong bg-card px-3 py-1.5"
                  pressedClassName="bg-muted-panel"
                >
                  <Text variant="label">{example}</Text>
                </PressableSurface>
              ))}
            </View>
          ) : null}
          <Button
            disabled={!canSubmit}
            busy={pending}
            onPress={submit}
            icon={<Sparkles size={16} color={buttonIconColor("primary")} />}
            label={learnerTerm("topicDoor")}
          />
        </ScrollView>
      </BottomSheet>
    </>
  );
}
