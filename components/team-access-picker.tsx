'use client';

import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface Team {
  id: number;
  name: string;
}

interface TeamAccessPickerProps {
  teams: Team[];
  selectedTeamIds: Set<number>;
  directorTeamIds: Set<number>;
  role: 'exec' | 'director';
  onToggleTeam: (teamId: number) => void;
  onToggleDirector: (teamId: number) => void;
}

export default function TeamAccessPicker({
  teams,
  selectedTeamIds,
  directorTeamIds,
  role,
  onToggleTeam,
  onToggleDirector,
}: TeamAccessPickerProps) {
  if (teams.length === 0) {
    return <p className="text-sm text-muted-foreground">No teams available.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-b border-border bg-muted/40 hover:bg-muted/40">
          <TableHead className="h-auto p-4 text-left font-medium text-muted-foreground">
            Team
          </TableHead>
          <TableHead className="h-auto w-24 p-4 text-center font-medium text-muted-foreground">
            Access
          </TableHead>
          <TableHead className="h-auto w-24 p-4 text-center font-medium text-muted-foreground">
            Director
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {teams.map((team) => {
          const selected = selectedTeamIds.has(team.id);
          const isDirector = directorTeamIds.has(team.id);

          return (
            <TableRow
              key={team.id}
              className={cn('hover:bg-muted/20', selected && 'bg-primary/5')}
            >
              <TableCell className="p-4 font-medium">{team.name}</TableCell>
              <TableCell className="p-4 text-center">
                <div className="flex justify-center">
                  <Checkbox
                    checked={selected}
                    onCheckedChange={() => onToggleTeam(team.id)}
                    aria-label={`Access to ${team.name}`}
                  />
                </div>
              </TableCell>
              <TableCell className="p-4 text-center">
                {role === 'director' ? (
                  selected ? (
                    <div className="flex justify-center">
                      <Checkbox checked disabled aria-label={`Director on ${team.name}`} />
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground/50" aria-hidden>
                      —
                    </span>
                  )
                ) : selected ? (
                  <div className="flex justify-center">
                    <Checkbox
                      checked={isDirector}
                      onCheckedChange={() => onToggleDirector(team.id)}
                      aria-label={`Director on ${team.name}`}
                    />
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground/50" aria-hidden>
                    —
                  </span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
