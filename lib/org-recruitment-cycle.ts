export type RecruitmentSemester = 'fall' | 'spring';

export interface OrgRecruitmentCycle {
  semester: RecruitmentSemester;
  year: number;
}

export const RECRUITMENT_CYCLE_MIN_YEAR = 2026;
export const RECRUITMENT_CYCLE_MAX_YEAR = 2035;

const SEMESTER_LABELS: Record<RecruitmentSemester, string> = {
  fall: 'Fall',
  spring: 'Spring',
};

export function formatRecruitmentCycleLabel(semester: RecruitmentSemester, year: number): string {
  return `${SEMESTER_LABELS[semester]} ${year} Recruitment Cycle`;
}

export function formatRecruitmentCycleShort(semester: RecruitmentSemester, year: number): string {
  return `${SEMESTER_LABELS[semester]} ${year}`;
}

/** Infer semester/year from the current date when org config is unset. */
export function inferRecruitmentCycleFromDate(date = new Date()): OrgRecruitmentCycle {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  if (month >= 1 && month <= 6) {
    return { semester: 'spring', year };
  }
  return { semester: 'fall', year };
}

export function parseRecruitmentSemester(value: unknown): RecruitmentSemester | null {
  if (value === 'fall' || value === 'spring') return value;
  return null;
}

export function isValidRecruitmentCycleYear(year: number): boolean {
  return (
    Number.isInteger(year) &&
    year >= RECRUITMENT_CYCLE_MIN_YEAR &&
    year <= RECRUITMENT_CYCLE_MAX_YEAR
  );
}

export function validateRecruitmentCycle(cycle: OrgRecruitmentCycle): void {
  if (!parseRecruitmentSemester(cycle.semester)) {
    throw new Error('Semester must be Fall or Spring.');
  }
  if (!isValidRecruitmentCycleYear(cycle.year)) {
    throw new Error(
      `Year must be between ${RECRUITMENT_CYCLE_MIN_YEAR} and ${RECRUITMENT_CYCLE_MAX_YEAR}.`,
    );
  }
}
