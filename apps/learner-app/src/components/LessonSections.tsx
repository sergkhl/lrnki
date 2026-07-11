import { View } from "react-native";
import type { ConceptLessonView } from "@lrnki/application/projection";
import { Card, Text } from "@/ui";
import { GroundedBadge } from "./GroundedBadge";
import { lessonSectionHeading } from "@/learn/vocabulary";

export function LessonSections({ lesson }: Readonly<{ lesson: ConceptLessonView }>) {
  return (
    <Card className="gap-5">
      {lesson.sections.map((section, index) => (
        <View key={`${section.kind}:${index}`} className="gap-2">
          <View className="flex-row items-center gap-2">
            <Text variant="title">{lessonSectionHeading(section.kind)}</Text>
            <GroundedBadge provenance={section.groundingProvenance} isSourceCited={section.isSourceCited} />
          </View>
          <Text variant="body">{section.text}</Text>
          {section.items?.length ? (
            <View className="gap-2 pl-2">
              {section.items.map((item, itemIndex) => (
                <View key={`${section.kind}:item:${itemIndex}`} className="flex-row gap-2">
                  <Text variant="body">{"•"}</Text>
                  <Text variant="body" className="flex-1">{item}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ))}
    </Card>
  );
}
