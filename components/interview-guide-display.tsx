import {
  interviewNoteSectionsFromGuide,
  interviewScaleMax,
  interviewWeightPercents,
  normalizeInterviewRubric,
  type InterviewGuide,
} from '@/lib/interview-guide';

function CaseStudyBlock({ guide, partLabel }: { guide: InterviewGuide; partLabel?: string }) {
  const rubric = normalizeInterviewRubric(guide.rubric);
  const percents = rubric ? interviewWeightPercents(rubric.criteria) : [];
  const noteSections = interviewNoteSectionsFromGuide(guide);

  return (
    <div className="space-y-3 text-sm text-amber-900 dark:text-amber-100">
      {partLabel && (
        <p className="uma-section-label text-amber-700 dark:text-amber-300">
          {partLabel}
        </p>
      )}
      {guide.caseStudy?.title?.trim() && (
        <p className="font-semibold">{guide.caseStudy.title.trim()}</p>
      )}
      <p className="whitespace-pre-wrap">{guide.caseStudy?.prompt}</p>
      {noteSections.length > 0 && (
        <div className="space-y-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Case questions
          </p>
          {noteSections.map((section, sectionIndex) => (
            <div key={`${sectionIndex}-${section.title || 'points'}`}>
              {section.title ? (
                <p className="mb-1 text-sm font-semibold">{section.title}</p>
              ) : null}
              <ul className="list-disc space-y-1 pl-5">
                {section.points.map((point, i) => (
                  <li key={i} className="whitespace-pre-wrap">
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {rubric ? (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Evaluation (1–{interviewScaleMax(guide)})
          </p>
          {rubric.categories && rubric.categories.length > 0 ? (
            <ul className="space-y-2">
              {rubric.categories.map((category, categoryIndex) => {
                const within = interviewWeightPercents(category.criteria);
                return (
                  <li key={categoryIndex}>
                    <p className="font-medium">
                      {category.name} ({category.weight}%)
                    </p>
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {category.criteria.map((criterion, i) => (
                        <li key={i}>
                          {criterion.name} ({within[i]}%)
                          {criterion.description?.trim() ? (
                            <span className="block text-xs opacity-80">
                              {criterion.description.trim()}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="list-disc space-y-1 pl-5">
              {rubric.criteria.map((criterion, i) => (
                <li key={i}>
                  {criterion.name} ({percents[i]}%)
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function QuestionsBlock({
  questions,
  partLabel,
}: {
  questions: string[];
  partLabel?: string;
}) {
  return (
    <div className="space-y-2">
      {partLabel && (
        <p className="uma-section-label text-amber-700 dark:text-amber-300">
          {partLabel}
        </p>
      )}
      <ol className="list-decimal space-y-2 pl-5 text-sm text-amber-900 dark:text-amber-100">
        {questions.map((q, i) => (
          <li key={i} className="whitespace-pre-wrap">
            {q}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function InterviewGuideDisplay({ guide }: { guide: InterviewGuide }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
      <p className="mb-2 uma-section-label text-amber-700 dark:text-amber-300">
        Interview materials
      </p>

      {guide.intro?.trim() && (
        <p className="mb-3 whitespace-pre-wrap text-sm text-amber-900 dark:text-amber-100">
          {guide.intro.trim()}
        </p>
      )}

      {guide.format === 'questions' && (
        <QuestionsBlock questions={guide.questions ?? []} />
      )}

      {guide.format === 'case_study' && <CaseStudyBlock guide={guide} />}

      {guide.format === 'case_and_behavioral' && (
        <div className="space-y-5">
          <CaseStudyBlock guide={guide} partLabel="Part 1: Case" />
          <QuestionsBlock
            questions={guide.questions ?? []}
            partLabel="Part 2: Behavioral"
          />
          {(guide.questionBank?.length ?? 0) > 0 ? (
            <QuestionsBlock
              questions={guide.questionBank ?? []}
              partLabel="Optional question bank"
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
