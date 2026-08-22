export interface Assignment {
  applicationId: number;
  userId: number;
}

export const DEFAULT_GRADERS_PER_APPLICATION = 3;

export type AssignmentWorkStatus = 'pending' | 'completed';

export interface LiveAssignment {
  assignmentId: number;
  applicationId: number;
  userId: number;
  status: AssignmentWorkStatus;
  hasScores: boolean;
}

export interface AssignmentMove {
  assignmentId: number;
  applicationId: number;
  fromUserId: number;
  toUserId: number;
}

export interface LoadSummary {
  min: number;
  max: number;
  evenLow: number;
  evenHigh: number;
  uneven: boolean;
  rebalanceable: boolean;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function evenSplitRange(
  applicationCount: number,
  graderCount: number,
  gradersPerApplication: number,
): { low: number; high: number } | null {
  if (graderCount < 1 || applicationCount < 1 || gradersPerApplication < 1) return null;
  const slots = applicationCount * gradersPerApplication;
  return {
    low: Math.floor(slots / graderCount),
    high: Math.ceil(slots / graderCount),
  };
}

export function loadSummary(counts: number[]): LoadSummary | null {
  if (counts.length === 0) return null;
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const total = counts.reduce((sum, n) => sum + n, 0);
  const evenLow = Math.floor(total / counts.length);
  const evenHigh = Math.ceil(total / counts.length);
  const active = counts.filter((n) => n > evenLow - 2);
  const activeMin = active.length > 0 ? Math.min(...active) : min;
  const activeMax = active.length > 0 ? Math.max(...active) : max;
  return {
    min,
    max,
    evenLow,
    evenHigh,
    uneven: max - min > 1,
    rebalanceable: active.length >= 2 && activeMax - activeMin > 1,
  };
}

/**
 * Assign each application to `gradersPerApplication` distinct graders,
 * giving extra slots to people with the fewest so counts differ by at most 1
 * (unless a per-grader cap prevents that).
 */
export function assignGraders(
  applicationIds: number[],
  userIds: number[],
  gradersPerApplication: number = DEFAULT_GRADERS_PER_APPLICATION,
  maxAssignmentsByUserId?: Record<number, number>,
): Assignment[] {
  if (gradersPerApplication < 1) {
    throw new Error('At least 1 grader per application is required.');
  }
  if (userIds.length < gradersPerApplication) {
    throw new Error(
      `At least ${gradersPerApplication} graders are required for ${gradersPerApplication}-grader scoring.`,
    );
  }

  const uniqueUserIds = [...new Set(userIds)];
  if (uniqueUserIds.length < gradersPerApplication) {
    throw new Error(
      `At least ${gradersPerApplication} distinct graders are required for ${gradersPerApplication}-grader scoring.`,
    );
  }

  const slotsNeeded = applicationIds.length * gradersPerApplication;
  const cappedCapacity = uniqueUserIds.reduce((sum, id) => {
    const cap = maxAssignmentsByUserId?.[id];
    return sum + (typeof cap === 'number' && Number.isFinite(cap) ? cap : Number.POSITIVE_INFINITY);
  }, 0);
  if (cappedCapacity < slotsNeeded) {
    throw new Error(
      `Grader caps are too low: ${cappedCapacity} slots available, ${slotsNeeded} needed.`,
    );
  }

  const counts = new Map<number, number>(uniqueUserIds.map((id) => [id, 0]));
  const maxFor = (id: number): number => {
    const cap = maxAssignmentsByUserId?.[id];
    return typeof cap === 'number' && Number.isFinite(cap) ? cap : Number.POSITIVE_INFINITY;
  };

  const assignments: Assignment[] = [];

  for (const applicationId of shuffle(applicationIds)) {
    const eligible = uniqueUserIds.filter((id) => (counts.get(id) ?? 0) < maxFor(id));
    if (eligible.length < gradersPerApplication) {
      throw new Error(
        'Not enough remaining grader capacity to finish assignment. Raise a cap or add graders.',
      );
    }

    const ranked = shuffle(eligible).sort(
      (a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0),
    );
    const picked = ranked.slice(0, gradersPerApplication);
    for (const userId of picked) {
      counts.set(userId, (counts.get(userId) ?? 0) + 1);
      assignments.push({ applicationId, userId });
    }
  }

  return assignments;
}

function isMovable(assignment: LiveAssignment, includeInProgress = false): boolean {
  if (assignment.status === 'completed') return false;
  if (assignment.hasScores && !includeInProgress) return false;
  return assignment.status === 'pending';
}

function countsByUser(assignments: LiveAssignment[], userIds: number[]): Map<number, number> {
  const allowed = new Set(userIds);
  const counts = new Map<number, number>(userIds.map((id) => [id, 0]));
  for (const assignment of assignments) {
    if (!allowed.has(assignment.userId)) continue;
    counts.set(assignment.userId, (counts.get(assignment.userId) ?? 0) + 1);
  }
  return counts;
}

function appsByUser(assignments: LiveAssignment[]): Map<number, Set<number>> {
  const apps = new Map<number, Set<number>>();
  for (const assignment of assignments) {
    let set = apps.get(assignment.userId);
    if (!set) {
      set = new Set();
      apps.set(assignment.userId, set);
    }
    set.add(assignment.applicationId);
  }
  return apps;
}

function findMove(
  assignments: LiveAssignment[],
  donorId: number,
  receiverId: number,
  receiverApps: Set<number> | undefined,
  includeInProgress = false,
): LiveAssignment | undefined {
  return assignments.find(
    (assignment) =>
      assignment.userId === donorId &&
      isMovable(assignment, includeInProgress) &&
      !receiverApps?.has(assignment.applicationId),
  );
}

function applyMoveInMemory(
  assignments: LiveAssignment[],
  move: AssignmentMove,
  apps: Map<number, Set<number>>,
): void {
  const assignment = assignments.find((a) => a.assignmentId === move.assignmentId);
  if (!assignment) return;
  apps.get(move.fromUserId)?.delete(move.applicationId);
  assignment.userId = move.toUserId;
  let receiverApps = apps.get(move.toUserId);
  if (!receiverApps) {
    receiverApps = new Set();
    apps.set(move.toUserId, receiverApps);
  }
  receiverApps.add(move.applicationId);
}

/**
 * Move pending, unscored assignments from high-load graders to low-load graders
 * until counts differ by at most 1, or no legal move remains.
 *
 * Graders already 2+ below the even split are left alone so a later "even out"
 * does not undo someone you reduced on purpose.
 */
export function planRebalance(assignments: LiveAssignment[]): AssignmentMove[] {
  const userIds = [...new Set(assignments.map((a) => a.userId))];
  if (userIds.length < 2) return [];

  const working = assignments.map((a) => ({ ...a }));
  const apps = appsByUser(working);
  const initialCounts = countsByUser(working, userIds);
  const total = [...initialCounts.values()].reduce((sum, n) => sum + n, 0);
  const evenLow = Math.floor(total / userIds.length);
  const pinned = new Set(
    userIds.filter((id) => (initialCounts.get(id) ?? 0) <= evenLow - 2),
  );
  const activeIds = userIds.filter((id) => !pinned.has(id));
  if (activeIds.length < 2) return [];

  const moves: AssignmentMove[] = [];
  const maxIterations = working.length * activeIds.length + 8;

  for (let i = 0; i < maxIterations; i++) {
    const counts = countsByUser(working, activeIds);
    const values = [...counts.values()];
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (max - min <= 1) break;

    const donors = shuffle(activeIds.filter((id) => counts.get(id) === max));
    const receivers = shuffle(activeIds.filter((id) => counts.get(id) === min));
    let moved = false;

    for (const donorId of donors) {
      for (const receiverId of receivers) {
        const candidate = findMove(working, donorId, receiverId, apps.get(receiverId));
        if (!candidate) continue;
        const move: AssignmentMove = {
          assignmentId: candidate.assignmentId,
          applicationId: candidate.applicationId,
          fromUserId: donorId,
          toUserId: receiverId,
        };
        moves.push(move);
        applyMoveInMemory(working, move, apps);
        moved = true;
        break;
      }
      if (moved) break;
    }

    if (!moved) break;
  }

  return moves;
}

export function planSetLoad(
  assignments: LiveAssignment[],
  userId: number,
  target: number,
): AssignmentMove[] {
  if (!Number.isInteger(target) || target < 0) {
    throw new Error('Target load must be a whole number of 0 or more.');
  }

  const userIds = [...new Set(assignments.map((a) => a.userId))];
  if (!userIds.includes(userId)) {
    throw new Error('That grader has no assignments on this team.');
  }

  const current = assignments.filter((a) => a.userId === userId);
  if (target === current.length) return [];

  const completed = current.filter((a) => a.status === 'completed').length;
  if (target < completed) {
    throw new Error(
      `Cannot go below ${completed}: that grader already finished that many applications.`,
    );
  }

  const movable = current.filter((assignment) => isMovable(assignment));
  if (target < current.length - movable.length) {
    throw new Error(
      'Not enough ungraded applications to move. Finished or in-progress ones stay put.',
    );
  }

  const working = assignments.map((a) => ({ ...a }));
  const apps = appsByUser(working);
  const moves: AssignmentMove[] = [];
  const others = userIds.filter((id) => id !== userId);

  if (target < current.length) {
    const giveAway = current.length - target;
    for (let n = 0; n < giveAway; n++) {
      const counts = countsByUser(working, userIds);
      const receivers = shuffle(others).sort(
        (a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0),
      );
      let moved = false;
      for (const receiverId of receivers) {
        const candidate = findMove(working, userId, receiverId, apps.get(receiverId));
        if (!candidate) continue;
        const move: AssignmentMove = {
          assignmentId: candidate.assignmentId,
          applicationId: candidate.applicationId,
          fromUserId: userId,
          toUserId: receiverId,
        };
        moves.push(move);
        applyMoveInMemory(working, move, apps);
        moved = true;
        break;
      }
      if (!moved) {
        throw new Error(
          'Could not move enough applications without giving someone an app they already have.',
        );
      }
    }
    return moves;
  }

  const take = target - current.length;
  for (let n = 0; n < take; n++) {
    const counts = countsByUser(working, userIds);
    const donors = shuffle(others).sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
    let moved = false;
    for (const donorId of donors) {
      const candidate = findMove(working, donorId, userId, apps.get(userId));
      if (!candidate) continue;
      const move: AssignmentMove = {
        assignmentId: candidate.assignmentId,
        applicationId: candidate.applicationId,
        fromUserId: donorId,
        toUserId: userId,
      };
      moves.push(move);
      applyMoveInMemory(working, move, apps);
      moved = true;
      break;
    }
    if (!moved) {
      throw new Error(
        'Could not add enough applications without overlapping someone already assigned.',
      );
    }
  }

  return moves;
}

/**
 * Move `count` leftover apps from one grader onto specific people you pick.
 * Spreads them toward whoever currently has the fewest among the recipients.
 */
export function planMoveRemaining(
  assignments: LiveAssignment[],
  fromUserId: number,
  toUserIds: number[],
  count: number,
  includeInProgress = false,
): AssignmentMove[] {
  const uniqueTo = [...new Set(toUserIds.filter((id) => id !== fromUserId))];
  if (uniqueTo.length === 0) {
    throw new Error('Pick at least one person to receive the applications.');
  }
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('How many to move must be at least 1.');
  }

  const fromAssignments = assignments.filter((a) => a.userId === fromUserId);
  if (fromAssignments.length === 0) {
    throw new Error('That grader has no assignments on this team.');
  }

  const movable = fromAssignments.filter((a) => isMovable(a, includeInProgress));
  if (movable.length === 0) {
    throw new Error(
      includeInProgress
        ? 'Nothing left to move — remaining applications are already finished.'
        : 'Nothing left to move. Finished or in-progress ones stay put unless you include in-progress.',
    );
  }
  if (count > movable.length) {
    throw new Error(
      `Only ${movable.length} application${movable.length === 1 ? '' : 's'} can be moved.`,
    );
  }

  const working = assignments.map((a) => ({ ...a }));
  const apps = appsByUser(working);
  const allUserIds = [...new Set([...assignments.map((a) => a.userId), ...uniqueTo])];
  const moves: AssignmentMove[] = [];

  for (let n = 0; n < count; n++) {
    const counts = countsByUser(working, allUserIds);
    const receivers = shuffle(uniqueTo).sort(
      (a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0),
    );
    let moved = false;
    for (const receiverId of receivers) {
      const candidate = findMove(
        working,
        fromUserId,
        receiverId,
        apps.get(receiverId),
        includeInProgress,
      );
      if (!candidate) continue;
      const move: AssignmentMove = {
        assignmentId: candidate.assignmentId,
        applicationId: candidate.applicationId,
        fromUserId,
        toUserId: receiverId,
      };
      moves.push(move);
      applyMoveInMemory(working, move, apps);
      moved = true;
      break;
    }
    if (!moved) {
      throw new Error(
        'Could not move enough applications without giving someone an app they already have. Pick more people, or move fewer.',
      );
    }
  }

  return moves;
}
