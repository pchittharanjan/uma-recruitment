'use client';

import { createContext, useContext, type ReactNode } from 'react';

export type ShellUser = {
  id?: number;
  name: string;
  email: string;
  role: string;
};

export type ShellImpersonation = {
  active: true;
  admin: { name: string; email: string };
};

type ShellUserContextValue = {
  user: ShellUser;
  teams: { id: number; name: string }[];
  impersonation: ShellImpersonation | null;
};

const ShellUserContext = createContext<ShellUserContextValue | null>(null);

export function ShellUserProvider({
  user,
  teams = [],
  impersonation = null,
  children,
}: {
  user: ShellUser;
  teams?: { id: number; name: string }[];
  impersonation?: ShellImpersonation | null;
  children: ReactNode;
}) {
  return (
    <ShellUserContext.Provider value={{ user, teams, impersonation }}>
      {children}
    </ShellUserContext.Provider>
  );
}

export function useShellUser(): ShellUserContextValue {
  const ctx = useContext(ShellUserContext);
  if (!ctx) {
    throw new Error('useShellUser must be used within ShellUserProvider');
  }
  return ctx;
}

export function useOptionalShellUser(): ShellUserContextValue | null {
  return useContext(ShellUserContext);
}
