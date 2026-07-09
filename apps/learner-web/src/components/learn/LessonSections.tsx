import type { ConceptLessonView } from "@lrnki/application/projection";
import { GroundedBadge } from "./GroundedBadge";
import { lessonSectionHeading } from "./vocabulary";

export function LessonSections({ lesson }: Readonly<{ lesson: ConceptLessonView }>) {
  return (
    <section className="flex flex-col gap-5 rounded-md border border-border bg-card p-4">
      {lesson.sections.map((section, index) => (
        <section key={`${section.kind}:${index}`} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">{lessonSectionHeading(section.kind)}</h3>
            <GroundedBadge provenance={section.groundingProvenance} isSourceCited={section.isSourceCited} />
          </div>
          <p className="max-w-prose text-base leading-7">{section.text}</p>
          {section.items?.length ? (
            <ul className="flex list-disc flex-col gap-2 pl-5 text-base leading-7">
              {section.items.map((item, itemIndex) => <li key={`${section.kind}:item:${itemIndex}`}>{item}</li>)}
            </ul>
          ) : null}
        </section>
      ))}
    </section>
  );
}
