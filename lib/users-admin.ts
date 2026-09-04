import { getDb, getTeams, getUserByEmail, rowToUser, type User } from '@/lib/db';
import { isBerkeleyEmail } from '@/lib/auth';
import { isAdminCreatableRole, type AdminCreatableRole } from '@/lib/roles';
import { validateDirectorTeamAssignments } from '@/lib/directors';

export type { AdminCreatableRole } from '@/lib/roles';
export { isAdminCreatableRole } from '@/lib/roles';

export interface UserTeamAccess {
  id: number;
  name: string;
  isDirector: boolean;
}

export interface UserWithTeams {
  id: number;
  name: string;
  email: string;
  role: User['role'];
  teams: UserTeamAccess[];
  createdAt: number;
}

export interface CreateUserInput {
  name: string;
  email: string;
  role: AdminCreatableRole;
  teamIds: number[];
  directorTeamIds: number[];
  invitedBy: number;
}

export interface UpdateUserInput {
  userId: number;
  name: string;
  email: string;
  role: AdminCreatableRole;
  teamIds: number[];
  directorTeamIds: number[];
  updatedBy: number;
}

export async function listUsersWithTeams(): Promise<UserWithTeams[]> {
  const db = getDb();
  const usersResult = await db.execute('SELECT * FROM users ORDER BY created_at DESC');
  const grantsResult = await db.execute({
    sql: `SELECT ag.user_id, ag.team_id, ag.is_director, t.name as team_name
          FROM access_grants ag
          JOIN teams t ON t.id = ag.team_id
          WHERE ag.revoked_at IS NULL
          ORDER BY t.name ASC`,
  });

  const teamsByUser = new Map<number, UserTeamAccess[]>();
  for (const row of grantsResult.rows) {
    const userId = row.user_id as number;
    if (!teamsByUser.has(userId)) teamsByUser.set(userId, []);
    teamsByUser.get(userId)!.push({
      id: row.team_id as number,
      name: row.team_name as string,
      isDirector: Boolean(row.is_director),
    });
  }

  return usersResult.rows.map((row) => {
    const user = rowToUser(row);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      teams: user.role === 'admin' ? [] : (teamsByUser.get(user.id) ?? []),
      createdAt: user.created_at,
    };
  });
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();

  await validateUserFields(name, email, input.role, input.teamIds, input.directorTeamIds);

  const existing = await getUserByEmail(email);
  if (existing) throw new UserAdminError('A user with this email already exists.');

  await validateDirectorTeamAssignments(
    input.teamIds.map((teamId) => ({
      teamId,
      isDirector: input.directorTeamIds.includes(teamId),
    })),
  );

  const db = getDb();
  const result = await db.execute({
    sql: 'INSERT INTO users (email, name, role, invited_by) VALUES (?, ?, ?, ?)',
    args: [email, name, input.role, input.invitedBy],
  });

  const userId = Number(result.lastInsertRowid);
  await replaceUserTeamGrants(userId, input.role, input.teamIds, input.directorTeamIds, input.invitedBy);

  const user = await getUserByEmail(email);
  if (!user) throw new Error('Failed to create user.');
  return user;
}

async function validateUserFields(
  name: string,
  email: string,
  role: AdminCreatableRole,
  teamIds: number[],
  directorTeamIds: number[],
): Promise<void> {
  if (!name) throw new UserAdminError('Name is required.');
  if (!isBerkeleyEmail(email)) throw new UserAdminError('Use a @berkeley.edu email address.');
  if (!isAdminCreatableRole(role)) throw new UserAdminError('Invalid role.');

  const allTeams = await getTeams();
  const teamIdSet = new Set(allTeams.map((t) => t.id));

  if (role === 'exec') {
    if (teamIds.length === 0) {
      throw new UserAdminError('Select at least one team for an Exec.');
    }
    for (const teamId of teamIds) {
      if (!teamIdSet.has(teamId)) throw new UserAdminError('Invalid team selected.');
    }
    for (const teamId of directorTeamIds) {
      if (!teamIdSet.has(teamId)) throw new UserAdminError('Invalid director team selected.');
      if (!teamIds.includes(teamId)) {
        throw new UserAdminError('Director teams must also have team access.');
      }
    }
  }
}

async function replaceUserTeamGrants(
  userId: number,
  role: AdminCreatableRole,
  teamIds: number[],
  directorTeamIds: number[],
  grantedBy: number,
): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: 'UPDATE access_grants SET revoked_at = unixepoch() WHERE user_id = ? AND revoked_at IS NULL',
    args: [userId],
  });

  if (role !== 'exec') return;

  const directorSet = new Set(directorTeamIds);
  const uniqueTeamIds = [...new Set(teamIds)];
  for (const teamId of uniqueTeamIds) {
    await db.execute({
      sql: `INSERT INTO access_grants (user_id, team_id, is_director, granted_by)
            VALUES (?, ?, ?, ?)`,
      args: [userId, teamId, directorSet.has(teamId) ? 1 : 0, grantedBy],
    });
  }
}

export async function updateUser(input: UpdateUserInput): Promise<User> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();

  await validateUserFields(name, email, input.role, input.teamIds, input.directorTeamIds);

  const db = getDb();
  const existingResult = await db.execute({
    sql: 'SELECT * FROM users WHERE id = ?',
    args: [input.userId],
  });
  if (existingResult.rows.length === 0) {
    throw new UserAdminError('User not found.');
  }

  const existing = rowToUser(existingResult.rows[0]);
  const emailTaken = await getUserByEmail(email);
  if (emailTaken && emailTaken.id !== input.userId) {
    throw new UserAdminError('A user with this email already exists.');
  }

  await validateDirectorTeamAssignments(
    input.teamIds.map((teamId) => ({
      teamId,
      isDirector: input.directorTeamIds.includes(teamId),
    })),
    input.userId,
  );

  await db.execute({
    sql: 'UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?',
    args: [name, email, input.role, input.userId],
  });

  await replaceUserTeamGrants(
    input.userId,
    input.role,
    input.teamIds,
    input.directorTeamIds,
    input.updatedBy,
  );

  const updated = await getUserByEmail(email);
  if (!updated) throw new Error('Failed to update user.');
  return updated;
}

export interface DeleteUserInput {
  userId: number;
  deletedBy: number;
}

async function getUserDeleteBlocker(userId: number): Promise<string | null> {
  const db = getDb();
  const checks: { sql: string; message: string }[] = [
    {
      sql: 'SELECT 1 FROM assignments WHERE user_id = ? LIMIT 1',
      message:
        'This person has grading assignments. Their scores are part of the recruitment record and cannot be removed.',
    },
    {
      sql: 'SELECT 1 FROM flags WHERE author_id = ? LIMIT 1',
      message: 'This person has added candidate flags that are part of the recruitment record.',
    },
    {
      sql: 'SELECT 1 FROM coffee_chats WHERE submitter_id = ? LIMIT 1',
      message: 'This person has submitted coffee chat notes that are part of the recruitment record.',
    },
    {
      sql: 'SELECT 1 FROM team_advancement_submissions WHERE submitted_by = ? LIMIT 1',
      message: 'This person has submitted advancement lists that are part of the recruitment record.',
    },
    {
      sql: 'SELECT 1 FROM pre_application_notes WHERE logged_by = ? LIMIT 1',
      message: 'This person has pre-application notes that are part of the recruitment record.',
    },
    {
      sql: 'SELECT 1 FROM round_stage_unlocks WHERE unlocked_by = ? LIMIT 1',
      message: 'This person unlocked recruitment stages and cannot be removed.',
    },
    {
      sql: 'SELECT 1 FROM deliberation_sessions WHERE facilitator_id = ? LIMIT 1',
      message: 'This person facilitated deliberation sessions and cannot be removed.',
    },
  ];

  for (const check of checks) {
    const result = await db.execute({ sql: check.sql, args: [userId] });
    if (result.rows.length > 0) return check.message;
  }

  return null;
}

export async function deleteUser(input: DeleteUserInput): Promise<void> {
  if (input.userId === input.deletedBy) {
    throw new UserAdminError('You cannot remove your own account.');
  }

  const db = getDb();
  const existingResult = await db.execute({
    sql: 'SELECT * FROM users WHERE id = ?',
    args: [input.userId],
  });
  if (existingResult.rows.length === 0) {
    throw new UserAdminError('User not found.');
  }

  const existing = rowToUser(existingResult.rows[0]);

  if (existing.role === 'admin') {
    const adminCountResult = await db.execute({
      sql: "SELECT COUNT(*) AS count FROM users WHERE role = 'admin'",
    });
    const adminCount = Number(adminCountResult.rows[0].count);
    if (adminCount <= 1) {
      throw new UserAdminError('Cannot remove the last admin. Add another admin first.');
    }
  }

  const blocker = await getUserDeleteBlocker(input.userId);
  if (blocker) {
    throw new UserAdminError(blocker);
  }

  await db.batch(
    [
      {
        sql: 'DELETE FROM notifications WHERE user_id = ?',
        args: [input.userId],
      },
      {
        sql: 'DELETE FROM access_grants WHERE user_id = ?',
        args: [input.userId],
      },
      {
        sql: 'DELETE FROM interview_slot_interviewers WHERE user_id = ?',
        args: [input.userId],
      },
      {
        sql: 'DELETE FROM follow_state WHERE follower_id = ? OR following_user_id = ?',
        args: [input.userId, input.userId],
      },
      {
        sql: 'DELETE FROM canvas_cards WHERE user_id = ?',
        args: [input.userId],
      },
      {
        sql: 'DELETE FROM deliberation_personal_boards WHERE user_id = ?',
        args: [input.userId],
      },
      {
        sql: 'UPDATE users SET invited_by = NULL WHERE invited_by = ?',
        args: [input.userId],
      },
      {
        sql: 'UPDATE access_grants SET granted_by = ? WHERE granted_by = ?',
        args: [input.deletedBy, input.userId],
      },
      {
        sql: 'UPDATE team_advancement_submissions SET reviewed_by = NULL WHERE reviewed_by = ?',
        args: [input.userId],
      },
      {
        sql: 'DELETE FROM users WHERE id = ?',
        args: [input.userId],
      },
    ],
    'write',
  );
}

export class UserAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserAdminError';
  }
}
