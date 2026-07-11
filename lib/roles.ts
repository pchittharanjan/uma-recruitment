/** Canonical user roles stored in `users.role`. */
export type UserRole = 'admin' | 'exec' | 'ad_hoc_exec' | 'general_member';

/** @deprecated Legacy value — normalized to `exec` on read. */
export const LEGACY_EXEC_ROLE = 'team_exec';

export const ADMIN_CREATABLE_ROLES = ['admin', 'exec'] as const;
export type AdminCreatableRole = (typeof ADMIN_CREATABLE_ROLES)[number];

export const LOGIN_ROLES = ['admin', 'exec'] as const;
export type LoginRole = (typeof LOGIN_ROLES)[number];

export function normalizeUserRole(role: string): UserRole {
  if (role === LEGACY_EXEC_ROLE) return 'exec';
  return role as UserRole;
}

export function roleLabel(role: string): string {
  switch (normalizeUserRole(role)) {
    case 'admin':
      return 'Admin';
    case 'exec':
      return 'Exec';
    case 'ad_hoc_exec':
      return 'Ad Hoc Exec';
    case 'general_member':
      return 'Member';
    default:
      return role;
  }
}

export function isExecRole(role: string): boolean {
  const normalized = normalizeUserRole(role);
  return normalized === 'exec' || normalized === 'ad_hoc_exec';
}

export function isAdminCreatableRole(role: string): role is AdminCreatableRole {
  if (role === LEGACY_EXEC_ROLE) return true;
  return (ADMIN_CREATABLE_ROLES as readonly string[]).includes(role);
}

/** Roles accepted in API auth checks (includes legacy slug). */
export function authRoleMatches(userRole: string, allowed: UserRole[]): boolean {
  const normalized = normalizeUserRole(userRole);
  return allowed.includes(normalized);
}

/** SQL IN clause values for exec-tier users (legacy + canonical). */
export const EXEC_ROLE_SQL_VALUES = ['exec', LEGACY_EXEC_ROLE] as const;
