import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Plus, Sparkles, X } from "lucide-react-native";
import { Btn } from "./ui";
import { learnerTerm } from "@/learn/vocabulary";

export function canPlanExpedition(topic: string): boolean {
  return topic.trim().length > 0;
}

// The plan-expedition entry (web Dialog + form merged into one Modal): a topic textarea
// with tappable example chips. Scouting begins as soon as the expedition is planned.
export function PlanExpeditionModal({
  exampleTopics,
  onCreate
}: Readonly<{
  exampleTopics: readonly string[];
  onCreate: (topic: string) => Promise<void>;
}>) {
  const insets = useSafeAreaInsets();
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
      <Btn
        variant="primary"
        onPress={() => setOpen(true)}
        icon={<Plus size={16} color="#fdfaf2" />}
        label="Plan a new expedition"
      />
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 bg-black/40" onPress={() => setOpen(false)} />
        <View className="rounded-t-2xl border border-line bg-card" style={{ paddingBottom: insets.bottom }}>
          <View className="flex-row items-start justify-between border-b border-line px-4 py-3">
            <View className="min-w-0 flex-1">
              <Text className="text-base font-semibold text-ink">Plan a new expedition</Text>
              <Text className="text-sm text-muted">Start with a topic. Scouting begins as soon as the expedition is planned.</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setOpen(false)} className="p-1">
              <X size={20} color="#6d6152" />
            </Pressable>
          </View>
          <ScrollView contentContainerClassName="gap-4 p-4" keyboardShouldPersistTaps="handled">
            <View className="gap-1.5">
              <Text className="text-sm font-medium text-ink">Topic</Text>
              <TextInput
                multiline
                value={topic}
                onChangeText={setTopic}
                placeholder="Build intuition for spaced practice, write safer database migrations, or understand supply chains"
                placeholderTextColor="#6d6152"
                className="min-h-28 rounded-xl border border-line bg-card px-3 py-2.5 text-sm text-ink"
                style={{ textAlignVertical: "top" }}
              />
              <Text className="text-xs text-muted">One topic, learning goal, or course idea.</Text>
            </View>
            {exampleTopics.length ? (
              <View className="flex-row flex-wrap gap-2">
                {exampleTopics.map((example) => (
                  <Pressable
                    key={example}
                    accessibilityRole="button"
                    onPress={() => setTopic(example)}
                    className="rounded-xl border border-line bg-card px-3 py-1.5 active:bg-background"
                  >
                    <Text className="text-sm text-ink">{example}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <Btn
              disabled={pending || !canSubmit}
              onPress={submit}
              icon={<Sparkles size={16} color="#fdfaf2" />}
              label={pending ? "Planning" : learnerTerm("topicDoor")}
            />
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
