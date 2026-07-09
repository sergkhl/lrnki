import { Text, View } from "react-native";
import type { ConceptLessonView } from "@lrnki/application/projection";
import { GroundedBadge } from "./GroundedBadge";
import { lessonSectionHeading } from "@/learn/vocabulary";

export function LessonSections({ lesson }: Readonly<{ lesson: ConceptLessonView }>) {
  return (
    <View className="gap-5 rounded-xl border border-line bg-card p-4">
      {lesson.sections.map((section, index) => (
        <View key={`${section.kind}:${index}`} className="gap-2">
          <View className="flex-row items-center gap-2">
            <Text className="text-base font-semibold text-ink">{lessonSectionHeading(section.kind)}</Text>
            <GroundedBadge provenance={section.groundingProvenance} isSourceCited={section.isSourceCited} />
          </View>
          <Text className="text-base leading-7 text-ink">{section.text}</Text>
          {section.items?.length ? (
            <View className="gap-2 pl-2">
              {section.items.map((item, itemIndex) => (
                <View key={`${section.kind}:item:${itemIndex}`} className="flex-row gap-2">
                  <Text className="text-base leading-7 text-ink">{"•"}</Text>
                  <Text className="flex-1 text-base leading-7 text-ink">{item}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}
