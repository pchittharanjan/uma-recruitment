'use client'

import type { ComponentProps } from 'react'
import { useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanColumnContent,
  KanbanColumnHandle,
  KanbanItem,
  KanbanItemHandle,
  KanbanOverlay
} from '@/components/ui/kanban'

import { cn } from '@/lib/utils'
import { CalendarClockIcon, GripVerticalIcon } from 'lucide-react'

type ColumnId = 'intake' | 'execution' | 'release'
type Health = 'onTrack' | 'atRisk' | 'blocked'

interface Initiative {
  id: string
  title: string
  area: string
  progress: number
  dueDate: string
  health: Health
  owner: {
    name: string
    avatar: string
    initials: string
  }
}

const COLUMN_META: Record<ColumnId, { title: string; accent: string }> = {
  intake: {
    title: 'Intake',
    accent: 'bg-sky-600 dark:bg-sky-400'
  },
  execution: {
    title: 'Execution',
    accent: 'bg-amber-600 dark:bg-amber-400'
  },
  release: {
    title: 'Release',
    accent: 'bg-green-600 dark:bg-green-400'
  }
}

const HEALTH_META: Record<
  Health,
  { label: string; variant: ComponentProps<typeof Badge>['variant']; className: string }
> = {
  onTrack: {
    label: 'On track',
    variant: 'outline',
    className: 'border-green-600/50 text-green-600 dark:border-green-400/50 dark:text-green-400'
  },
  atRisk: {
    label: 'At risk',
    variant: 'outline',
    className: 'border-destructive text-destructive'
  },
  blocked: {
    label: 'Blocked',
    variant: 'destructive',
    className: 'border-transparent'
  }
}

const INITIAL_COLUMNS: Record<ColumnId, Initiative[]> = {
  intake: [
    {
      id: 'initiative-1',
      title: 'Customer health dashboard',
      area: 'Analytics',
      progress: 18,
      dueDate: 'Jul 08',
      health: 'onTrack',
      owner: {
        name: 'Alex Johnson',
        avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-1.png',
        initials: 'AJ'
      }
    },
    {
      id: 'initiative-2',
      title: 'Usage limit notifications',
      area: 'Growth',
      progress: 12,
      dueDate: 'Jul 12',
      health: 'atRisk',
      owner: {
        name: 'Sarah Chen',
        avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-2.png',
        initials: 'SC'
      }
    },
    {
      id: 'initiative-3',
      title: 'Team audit log export',
      area: 'Admin',
      progress: 38,
      dueDate: 'Jul 18',
      health: 'onTrack',
      owner: {
        name: 'Emma Wilson',
        avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-3.png',
        initials: 'EW'
      }
    },
    {
      id: 'initiative-4',
      title: 'New billing plan cards',
      area: 'Billing',
      progress: 44,
      dueDate: 'Jul 20',
      health: 'onTrack',
      owner: {
        name: 'Michael Rodriguez',
        avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-4.png',
        initials: 'MR'
      }
    }
  ],
  execution: [
    {
      id: 'initiative-5',
      title: 'Role based navigation',
      area: 'Platform',
      progress: 67,
      dueDate: 'Jul 24',
      health: 'atRisk',
      owner: {
        name: 'David Kim',
        avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-5.png',
        initials: 'DK'
      }
    },
    {
      id: 'initiative-6',
      title: 'Workspace invite refresh',
      area: 'Identity',
      progress: 72,
      dueDate: 'Jul 26',
      health: 'blocked',
      owner: {
        name: 'Nina Patel',
        avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-6.png',
        initials: 'NP'
      }
    }
  ],
  release: [
    {
      id: 'initiative-7',
      title: 'Saved report templates',
      area: 'Reports',
      progress: 91,
      dueDate: 'Jul 30',
      health: 'onTrack',
      owner: {
        name: 'James Brown',
        avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-7.png',
        initials: 'JB'
      }
    }
  ]
}

interface InitiativeCardProps extends Omit<ComponentProps<typeof KanbanItem>, 'value' | 'children'> {
  initiative: Initiative
  isOverlay?: boolean
}

function InitiativeCard({ initiative, isOverlay, ...props }: InitiativeCardProps) {
  const health = HEALTH_META[initiative.health]

  const card = (
    <Card
      size='sm'
      className={cn(
        'overflow-hidden transition-colors',
        isOverlay && 'ring-primary/20 ring-2'
      )}
    >
      <CardContent className='space-y-3'>
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0 space-y-1'>
            <Badge variant='secondary' className='rounded'>
              {initiative.area}
            </Badge>
            <h3 className='line-clamp-2 text-sm leading-snug font-semibold'>{initiative.title}</h3>
          </div>
          <Avatar className='size-7 shrink-0 border'>
            <AvatarImage src={initiative.owner.avatar} alt={initiative.owner.name} />
            <AvatarFallback className='text-xs'>{initiative.owner.initials}</AvatarFallback>
          </Avatar>
        </div>

        <div className='space-y-1.5'>
          <div className='text-muted-foreground flex items-center justify-between text-[11px]'>
            <span>Progress</span>
            <span className='font-medium tabular-nums'>{initiative.progress}%</span>
          </div>
          <Progress value={initiative.progress} className='h-1.5' />
        </div>

        <Separator />

        <div className='flex items-center justify-between gap-2'>
          <Badge variant={health.variant} className={cn('rounded font-normal', health.className)}>
            {health.label}
          </Badge>
          <span className='text-muted-foreground flex items-center gap-1 text-xs whitespace-nowrap tabular-nums'>
            <CalendarClockIcon className='size-3' />
            {initiative.dueDate}
          </span>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <KanbanItem value={initiative.id} {...props}>
      {isOverlay ? card : <KanbanItemHandle>{card}</KanbanItemHandle>}
    </KanbanItem>
  )
}

interface PipelineColumnProps extends Omit<ComponentProps<typeof KanbanColumn>, 'children' | 'value'> {
  value: ColumnId
  initiatives: Initiative[]
  isOverlay?: boolean
}

function PipelineColumn({ value, initiatives, isOverlay, ...props }: PipelineColumnProps) {
  const meta = COLUMN_META[value]

  return (
    <KanbanColumn value={value} {...props}>
      <div className='flex h-full flex-col p-2'>
        <div className='flex items-center justify-between gap-3 px-1 py-0.5'>
          <div className='flex min-w-0 items-center gap-2'>
            <span className={cn('size-2 rounded-full', meta.accent)} />
            <h2 className='truncate text-sm font-semibold'>{meta.title}</h2>
          </div>
          <div className='flex items-center gap-1.5'>
            <Badge variant='outline'>{initiatives.length}</Badge>
            <KanbanColumnHandle
              className='opacity-100!'
              render={handleProps => (
                <Button {...handleProps} size='icon-xs' variant='ghost' aria-label={`Move ${meta.title} column`}>
                  <GripVerticalIcon />
                </Button>
              )}
            />
          </div>
        </div>

        <KanbanColumnContent value={value} className='mt-2 min-h-80 gap-2.5'>
          {initiatives.map(initiative => (
            <InitiativeCard key={initiative.id} initiative={initiative} isOverlay={isOverlay} />
          ))}
        </KanbanColumnContent>
      </div>
    </KanbanColumn>
  )
}

const KanbanDemoOutline = () => {
  const [columns, setColumns] = useState<Record<string, Initiative[]>>(INITIAL_COLUMNS)

  return (
    <div className='space-y-4 overflow-x-auto'>
      <Kanban
        value={columns}
        onValueChange={setColumns}
        getItemValue={item => item.id}
        className='mx-auto w-full max-w-4xl'
      >
        <KanbanBoard className='grid auto-rows-fr grid-cols-[repeat(3,minmax(16rem,1fr))] gap-3'>
          {Object.entries(columns).map(([columnId, initiatives]) => (
            <PipelineColumn key={columnId} value={columnId as ColumnId} initiatives={initiatives} />
          ))}
        </KanbanBoard>
        <KanbanOverlay>
          {({ value, variant }) => {
            const activeValue = String(value)

            if (variant === 'column') {
              return (
                <PipelineColumn value={activeValue as ColumnId} initiatives={columns[activeValue] ?? []} isOverlay />
              )
            }

            const initiative = Object.values(columns)
              .flat()
              .find(i => i.id === activeValue)

            return initiative ? <InitiativeCard initiative={initiative} isOverlay /> : null
          }}
        </KanbanOverlay>
      </Kanban>
    </div>
  )
}

export default KanbanDemoOutline
