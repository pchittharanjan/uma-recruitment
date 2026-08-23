import type { TeamName } from '@/lib/db';
import { cn } from '@/lib/utils';

export const TEAM_ORDER: readonly TeamName[] = ['Strategy', 'Events', 'Design'];

export function isTeamName(name: string): name is TeamName {
  return name === 'Strategy' || name === 'Events' || name === 'Design';
}

const TEAM_BADGE: Record<TeamName, string> = {
  Strategy: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200',
  Events: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  Design: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200',
};

/** Pill/badge background for a team label. */
export function teamBadgeClass(teamName: string): string {
  if (isTeamName(teamName)) return TEAM_BADGE[teamName];
  return 'bg-muted text-muted-foreground';
}

const TEAM_LINK: Record<TeamName, string> = {
  Strategy:
    'text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300',
  Events:
    'text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300',
  Design:
    'text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300',
};

/** Text link styling for team-scoped actions (e.g. Advance). */
export function teamLinkClass(teamName: string): string {
  if (isTeamName(teamName)) return TEAM_LINK[teamName];
  return 'text-primary hover:text-primary/90';
}

const TEAM_CHECKBOX: Record<TeamName, string> = {
  Strategy:
    'data-checked:border-orange-600 data-checked:bg-orange-600 data-checked:text-white dark:data-checked:border-orange-500 dark:data-checked:bg-orange-600',
  Events:
    'data-checked:border-blue-600 data-checked:bg-blue-600 data-checked:text-white dark:data-checked:border-blue-500 dark:data-checked:bg-blue-600',
  Design:
    'data-checked:border-violet-600 data-checked:bg-violet-600 data-checked:text-white dark:data-checked:border-violet-500 dark:data-checked:bg-violet-600',
};

/** Checked-state accent for checkboxes inside team phase cards. */
export function teamCheckboxAccentClass(teamName: string): string {
  if (isTeamName(teamName)) return TEAM_CHECKBOX[teamName];
  return '';
}

const TEAM_UNLOCK_OPEN: Record<TeamName, string> = {
  Strategy: 'border-orange-500/50 bg-orange-500/12',
  Events: 'border-blue-500/50 bg-blue-500/12',
  Design: 'border-violet-500/50 bg-violet-500/12',
};

const TEAM_UNLOCK_CLOSED: Record<TeamName, string> = {
  Strategy: 'border-border/70 bg-background',
  Events: 'border-border/70 bg-background',
  Design: 'border-border/70 bg-background',
};

/** Unlock chip styling — open vs closed exec access. */
export function teamUnlockChipClass(
  teamName: string,
  open: boolean,
  options?: { disabled?: boolean },
): string {
  if (options?.disabled) {
    return 'border-border/40 bg-muted/25 opacity-50';
  }
  if (open) {
    return isTeamName(teamName) ? TEAM_UNLOCK_OPEN[teamName] : 'border-primary/40 bg-primary/10';
  }
  return isTeamName(teamName) ? TEAM_UNLOCK_CLOSED[teamName] : 'border-border/70 bg-background';
}

const TEAM_DOT: Record<TeamName, string> = {
  Strategy: 'bg-orange-500',
  Events: 'bg-blue-500',
  Design: 'bg-violet-500',
};

/** Small circular team indicator (sidebar dots, table rows). */
export function teamDotClass(teamName: string): string {
  if (isTeamName(teamName)) return TEAM_DOT[teamName];
  return 'bg-muted-foreground';
}

const TEAM_STAGE_BADGE: Record<TeamName, string> = {
  Strategy: 'bg-orange-500/10 text-orange-700 dark:text-orange-300',
  Events: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  Design: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
};

/** Compact phase badge on team cards — borderless soft fill (matches StageBadge / team pills). */
export function teamStageBadgeClass(teamName: string): string {
  if (isTeamName(teamName)) return TEAM_STAGE_BADGE[teamName];
  return 'bg-muted/40 text-muted-foreground';
}

const TEAM_CARD_HOVER: Record<TeamName, string> = {
  Strategy: 'hover:border-orange-500/30',
  Events: 'hover:border-blue-500/30',
  Design: 'hover:border-violet-500/30',
};

/** Hover border on unlock-phase chips in team cards. */
export function teamCardHoverClass(teamName: string): string {
  if (isTeamName(teamName)) return TEAM_CARD_HOVER[teamName];
  return 'hover:border-primary/30';
}

const TEAM_ROW_HIGHLIGHT: Record<TeamName, string> = {
  Strategy: 'bg-orange-500/5',
  Events: 'bg-blue-500/5',
  Design: 'bg-violet-500/5',
};

/** Selected-row background for team pickers. */
export function teamRowHighlightClass(teamName: string): string {
  if (isTeamName(teamName)) return TEAM_ROW_HIGHLIGHT[teamName];
  return 'bg-primary/5';
}

export type TeamHexColors = {
  dot: string;
  badgeBg: string;
  badgeFg: string;
  avatarBg: string;
  avatarFg: string;
};

/** Hex palette for inline styles (final selection table). */
export const TEAM_HEX_COLORS: Record<TeamName, TeamHexColors> = {
  Strategy: {
    dot: '#f97316',
    badgeBg: '#ffedd5',
    badgeFg: '#9a3412',
    avatarBg: '#ffedd5',
    avatarFg: '#ea580c',
  },
  Events: {
    dot: '#2563eb',
    badgeBg: '#dbeafe',
    badgeFg: '#1e40af',
    avatarBg: '#dbeafe',
    avatarFg: '#1d4ed8',
  },
  Design: {
    dot: '#7c3aed',
    badgeBg: '#ede9fe',
    badgeFg: '#5b21b6',
    avatarBg: '#ede9fe',
    avatarFg: '#6d28d9',
  },
};

const DEFAULT_HEX: TeamHexColors = {
  dot: '#a3a3a3',
  badgeBg: '#f5f5f5',
  badgeFg: '#404040',
  avatarBg: '#f5f5f5',
  avatarFg: '#404040',
};

export function teamHexColors(teamName: string): TeamHexColors {
  if (isTeamName(teamName)) return TEAM_HEX_COLORS[teamName];
  return DEFAULT_HEX;
}

/** Numbered step circles — matches deliberations instructions / import wizard scale. */
const TEAM_STEP_CIRCLE: Record<TeamName, readonly string[]> = {
  Strategy: [
    'bg-orange-100 text-orange-800 ring-orange-200/80',
    'bg-orange-200/70 text-orange-900 ring-orange-300/80',
    'bg-orange-300/60 text-orange-950 ring-orange-400/70',
  ],
  Events: [
    'bg-blue-100 text-blue-800 ring-blue-200/80',
    'bg-blue-200/70 text-blue-900 ring-blue-300/80',
    'bg-blue-300/60 text-blue-950 ring-blue-400/70',
  ],
  Design: [
    'bg-violet-100 text-violet-800 ring-violet-200/80',
    'bg-violet-200/70 text-violet-900 ring-violet-300/80',
    'bg-violet-300/60 text-violet-950 ring-violet-400/70',
  ],
};

const DEFAULT_STEP_CIRCLE: readonly string[] = [
  'bg-muted/60 text-foreground ring-border/80',
  'bg-muted/80 text-foreground ring-border',
  'bg-muted text-foreground ring-border',
];

export function teamStepCircleClass(
  teamName: string | null | undefined,
  stepIndex: number,
  totalSteps: number,
): string {
  const ramps =
    teamName && isTeamName(teamName) ? TEAM_STEP_CIRCLE[teamName] : DEFAULT_STEP_CIRCLE;
  const idx =
    totalSteps <= 1
      ? 0
      : Math.min(
          ramps.length - 1,
          Math.round((stepIndex / Math.max(totalSteps - 1, 1)) * (ramps.length - 1)),
        );
  return cn(
    'flex size-8 shrink-0 items-center justify-center rounded-full ring-1 text-xs font-semibold',
    ramps[idx] ?? ramps[ramps.length - 1],
  );
}
