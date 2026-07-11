'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { PartyPopperIcon } from 'lucide-react';
import { fireRecruitmentConfetti } from '@/lib/confetti-fireworks';

export interface FinalSelectionOffer {
  applicationId: number;
  name: string;
  grade: string;
  teamName: string;
}

const TEAM_ORDER = ['Strategy', 'Events', 'Design'] as const;

const TEAM_COLORS: Record<
  string,
  { dot: string; badgeBg: string; badgeFg: string; avatarBg: string; avatarFg: string }
> = {
  Strategy: {
    dot: '#0ea5e9',
    badgeBg: '#e0f2fe',
    badgeFg: '#0c4a6e',
    avatarBg: '#e0f2fe',
    avatarFg: '#075985',
  },
  Events: {
    dot: '#f59e0b',
    badgeBg: '#fef3c7',
    badgeFg: '#78350f',
    avatarBg: '#fef3c7',
    avatarFg: '#92400e',
  },
  Design: {
    dot: '#8b5cf6',
    badgeBg: '#ede9fe',
    badgeFg: '#4c1d95',
    avatarBg: '#ede9fe',
    avatarFg: '#5b21b6',
  },
};

function teamColors(teamName: string) {
  return (
    TEAM_COLORS[teamName] ?? {
      dot: '#a3a3a3',
      badgeBg: '#f5f5f5',
      badgeFg: '#404040',
      avatarBg: '#f5f5f5',
      avatarFg: '#404040',
    }
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

function sortTeams(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const ai = TEAM_ORDER.indexOf(a as (typeof TEAM_ORDER)[number]);
    const bi = TEAM_ORDER.indexOf(b as (typeof TEAM_ORDER)[number]);
    const aRank = ai === -1 ? 99 : ai;
    const bRank = bi === -1 ? 99 : bi;
    if (aRank !== bRank) return aRank - bRank;
    return a.localeCompare(b);
  });
}

const chipBaseStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  height: 32,
  paddingLeft: 12,
  paddingRight: 12,
  margin: 0,
  borderRadius: 9999,
  borderWidth: 1,
  borderStyle: 'solid',
  fontSize: 14,
  lineHeight: 1,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

function chipStyle(selected: boolean): CSSProperties {
  return {
    ...chipBaseStyle,
    backgroundColor: selected ? '#171717' : '#ffffff',
    color: selected ? '#ffffff' : '#1a1816',
    borderColor: selected ? 'transparent' : 'rgba(0,0,0,0.12)',
  };
}

export function FinalSelectionOffers({
  cycleLabel,
  members,
  emptyHint,
}: {
  cycleLabel: string;
  members: FinalSelectionOffer[];
  emptyHint?: string;
}) {
  const [activeTeam, setActiveTeam] = useState<string | 'all'>('all');
  const [listOpacity, setListOpacity] = useState(1);
  const isFirstFilter = useRef(true);

  useEffect(() => {
    if (isFirstFilter.current) {
      isFirstFilter.current = false;
      return;
    }
    setListOpacity(0);
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setListOpacity(1));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTeam]);

  const teamCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const member of members) {
      counts.set(member.teamName, (counts.get(member.teamName) ?? 0) + 1);
    }
    return sortTeams([...counts.keys()]).map((name) => ({
      name,
      count: counts.get(name) ?? 0,
    }));
  }, [members]);

  const visible = useMemo(() => {
    const filtered =
      activeTeam === 'all'
        ? members
        : members.filter((m) => m.teamName === activeTeam);
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [members, activeTeam]);

  const title = cycleLabel ? `${cycleLabel} Newbies` : 'Final selection';

  return (
    <div style={{ margin: '0 auto', width: '100%', maxWidth: 1024 }}>
      <header
        style={{
          backgroundImage: 'linear-gradient(90deg, #e4e3f0 0%, #f2efe9 48%, #f6e8df 100%)',
          borderRadius: 12,
          padding: '24px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ minWidth: 0, flex: '1 1 200px' }}>
            <h1
              style={{
                margin: 0,
                fontSize: 28,
                lineHeight: 1.2,
                fontWeight: 500,
                letterSpacing: '-0.02em',
                color: '#1a1816',
              }}
            >
              {title}
            </h1>
            {members.length === 0 ? (
              <p style={{ margin: '8px 0 0', fontSize: 14, color: '#6b6560' }}>
                {emptyHint ?? 'No offers have been locked in yet.'}
              </p>
            ) : null}
          </div>

          {members.length > 0 ? (
            <button
              type="button"
              onClick={() => fireRecruitmentConfetti(2500)}
              style={{
                ...chipBaseStyle,
                backgroundColor: '#ffffff',
                color: '#1a1816',
                borderColor: 'rgba(0,0,0,0.12)',
              }}
            >
              <PartyPopperIcon style={{ width: 12, height: 12 }} />
              Celebrate
            </button>
          ) : null}
        </div>

        {members.length > 0 ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              marginTop: 20,
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTeam('all')}
              style={chipStyle(activeTeam === 'all')}
            >
              <span>Everyone</span>
              <span
                style={{
                  color: activeTeam === 'all' ? 'rgba(255,255,255,0.7)' : '#6b6560',
                }}
              >
                {members.length}
              </span>
            </button>
            {teamCounts.map((team) => {
              const colors = teamColors(team.name);
              const selected = activeTeam === team.name;
              return (
                <button
                  key={team.name}
                  type="button"
                  onClick={() => setActiveTeam(team.name)}
                  style={chipStyle(selected)}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 9999,
                      backgroundColor: selected ? 'rgba(255,255,255,0.8)' : colors.dot,
                      flexShrink: 0,
                    }}
                  />
                  <span>{team.name}</span>
                  <span
                    style={{
                      color: selected ? 'rgba(255,255,255,0.7)' : '#6b6560',
                    }}
                  >
                    {team.count}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </header>

      {members.length === 0 ? null : (
        <div
          style={{
            marginTop: 24,
            overflowX: 'auto',
            borderRadius: 12,
            border: '1px solid rgba(26,24,22,0.08)',
            backgroundColor: '#ffffff',
            fontSize: 14,
            opacity: listOpacity,
            transition: 'opacity 180ms ease',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              tableLayout: 'fixed',
              textAlign: 'left',
            }}
          >
            <colgroup>
              <col style={{ width: '46%' }} />
              <col style={{ width: '32%' }} />
              <col style={{ width: '22%' }} />
            </colgroup>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(26,24,22,0.08)', color: '#6b6560' }}>
                <th style={{ padding: '10px 24px', fontWeight: 700 }}>Name</th>
                <th style={{ padding: '10px 24px', fontWeight: 700 }}>Grade</th>
                <th style={{ padding: '10px 24px', fontWeight: 700 }}>Team</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((member) => {
                const colors = teamColors(member.teamName);
                return (
                  <tr
                    key={`${member.teamName}-${member.applicationId}`}
                    style={{ borderBottom: '1px solid rgba(26,24,22,0.08)' }}
                  >
                    <td style={{ padding: '12px 24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            width: 24,
                            height: 24,
                            flexShrink: 0,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 9999,
                            backgroundColor: colors.avatarBg,
                            color: colors.avatarFg,
                            fontSize: 12,
                            fontWeight: 500,
                          }}
                        >
                          {initials(member.name)}
                        </span>
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            color: '#1a1816',
                          }}
                        >
                          {member.name}
                        </span>
                      </div>
                    </td>
                    <td
                      style={{
                        padding: '12px 24px',
                        color: '#6b6560',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {member.grade || '—'}
                    </td>
                    <td style={{ padding: '12px 24px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          borderRadius: 9999,
                          padding: '2px 10px',
                          fontSize: 14,
                          backgroundColor: colors.badgeBg,
                          color: colors.badgeFg,
                        }}
                      >
                        {member.teamName}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
