import type { InterviewGuide } from '@/lib/interview-guide';

export function InterviewGuideDisplay({ guide }: { guide: InterviewGuide }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
        Interview materials
      </p>

      {guide.intro?.trim() && (
        <p className="mb-3 whitespace-pre-wrap text-sm text-amber-900 dark:text-amber-100">
          {guide.intro.trim()}
        </p>
      )}

      {guide.format === 'questions' ? (
        <ol className="list-decimal space-y-2 pl-5 text-sm text-amber-900 dark:text-amber-100">
          {(guide.questions ?? []).map((q, i) => (
            <li key={i} className="whitespace-pre-wrap">
              {q}
            </li>
          ))}
        </ol>
      ) : (
        <div className="space-y-3 text-sm text-amber-900 dark:text-amber-100">
          {guide.caseStudy?.title?.trim() && (
            <p className="font-semibold">{guide.caseStudy.title.trim()}</p>
          )}
          <p className="whitespace-pre-wrap">{guide.caseStudy?.prompt}</p>
          {guide.caseStudy?.discussionPoints && guide.caseStudy.discussionPoints.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
                Discussion points
              </p>
              <ul className="list-disc space-y-1 pl-5">
                {guide.caseStudy.discussionPoints.map((point, i) => (
                  <li key={i} className="whitespace-pre-wrap">
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
