import { View } from "react-native";
import type { ConceptLessonView } from "@lrnki/application/projection";
import { Card, Text } from "@/ui";
import { ExplorableTheoryText } from "./ExplorableTheoryText";
import { GroundedBadge } from "./GroundedBadge";
import { lessonSectionHeading } from "@/learn/vocabulary";

// Lesson theory sections. When the caller wires `onPressTerm` (the neutral Activity Sheet),
// each section's PROSE gains first-occurrence Explorable Term highlights for the terms
// anchored to that section's kind (plan 2026-07-13-002 U3, KTD2/KTD3; R5). List items and
// generated Support Step lessons (which pass no handler) render plain text.
export function LessonSections({
  lesson,
  onPressTerm
}: Readonly<{ lesson: ConceptLessonView; onPressTerm?: (term: string) => void }>) {
  return (
    <Card className="gap-5">
      {lesson.sections.map((section, index) => (
        <View key={`${section.kind}:${index}`} className="gap-2">
          <View className="flex-row items-center gap-2">
            <Text variant="title">{lessonSectionHeading(section.kind)}</Text>
            <GroundedBadge provenance={section.groundingProvenance} isSourceCited={section.isSourceCited} />
          </View>
          {onPressTerm ? (
            <ExplorableTheoryText
              text={section.text}
              terms={lesson.explorableTerms.filter((entry) => entry.sectionKind === section.kind).map((entry) => entry.term)}
              onPressTerm={onPressTerm}
            />
          ) : (
            <Text variant="body">{section.text}</Text>
          )}
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
