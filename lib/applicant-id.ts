/** Blind applicant number within a team (1-based; legacy rows may still store 0). */
export function displayApplicantId(rowIndex: number): number {
  return rowIndex > 0 ? rowIndex : 1;
}
