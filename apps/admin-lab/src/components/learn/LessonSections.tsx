import type { ConceptLessonView } from "@lrnki/application";
import { GroundedBadge } from "./GroundedBadge";
import { lessonSectionHeading } from "./vocabulary";

export function LessonSections({ lesson }: Readonly<{ lesson: ConceptLessonView }>) {
  return (
    <section className="flex flex-col gap-5 rounded-md border border-[color:var(--journal-line)] bg-[color:var(--journal-panel)] p-4">
      {lesson.sections.map((section, index) => (
        <section key={`${section.kind}:${index}`} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">{lessonSectionHeading(section.kind)}</h3>
            <GroundedBadge provenance={section.groundingProvenance} isSourceCited={section.isSourceCited} />
          </div>
          <p className="max-w-prose text-base leading-7">{renderWithKeyTerms(section.text, section.keyTerms ?? [])}</p>
          {section.items?.length ? (
            <ul className="flex list-disc flex-col gap-2 pl-5 text-base leading-7">
              {section.items.map((item, itemIndex) => <li key={`${section.kind}:item:${itemIndex}`}>{renderWithKeyTerms(item, section.keyTerms ?? [])}</li>)}
            </ul>
          ) : null}
        </section>
      ))}
    </section>
  );
}

function renderWithKeyTerms(text: string, keyTerms: string[]) {
  const term = keyTerms.find((candidate) => text.includes(candidate));
  if (!term) return text;
  const index = text.indexOf(term);
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-sm bg-[color:var(--journal-gem-soft)] px-1 font-semibold text-[color:var(--journal-ink)]">{term}</mark>
      {text.slice(index + term.length)}
    </>
  );
}
