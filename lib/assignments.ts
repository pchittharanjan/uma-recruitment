export interface Assignment {
  applicationId: number;
  userId: number;
}

export const DEFAULT_GRADERS_PER_APPLICATION = 3;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickGradersForApp(
  shuffled: number[],
  base: number,
  gradersPerApplication: number,
  userIds: number[],
): number[] {
  const picked: number[] = [];

  for (let k = 0; k < gradersPerApplication; k++) {
    let graderId = shuffled[base + k];

    if (picked.includes(graderId)) {
      let swapped = false;
      for (let j = base + gradersPerApplication; j < shuffled.length; j++) {
        if (!picked.includes(shuffled[j])) {
          [shuffled[base + k], shuffled[j]] = [shuffled[j], shuffled[base + k]];
          graderId = shuffled[base + k];
          swapped = true;
          break;
        }
      }
      if (!swapped) {
        const alt = userIds.find((id) => !picked.includes(id));
        if (alt !== undefined) graderId = alt;
      }
    }

    picked.push(graderId);
  }

  return picked;
}

export function assignGraders(
  applicationIds: number[],
  userIds: number[],
  gradersPerApplication: number = DEFAULT_GRADERS_PER_APPLICATION,
): Assignment[] {
  if (gradersPerApplication < 1) {
    throw new Error('At least 1 grader per application is required.');
  }
  if (userIds.length < gradersPerApplication) {
    throw new Error(
      `At least ${gradersPerApplication} graders are required for ${gradersPerApplication}-grader scoring.`,
    );
  }

  const n = applicationIds.length;
  const g = userIds.length;

  const slotsNeeded = n * gradersPerApplication;
  const pool: number[] = [];
  for (let i = 0; i < slotsNeeded; i++) {
    pool.push(userIds[i % g]);
  }
  const shuffled = shuffle(pool);

  const assignments: Assignment[] = [];

  for (let i = 0; i < n; i++) {
    const appId = applicationIds[i];
    const graders = pickGradersForApp(shuffled, i * gradersPerApplication, gradersPerApplication, userIds);
    for (const userId of graders) {
      assignments.push({ applicationId: appId, userId });
    }
  }

  return assignments;
}
