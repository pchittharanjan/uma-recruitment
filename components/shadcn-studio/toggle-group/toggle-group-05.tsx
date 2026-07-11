'use client'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Columns2Icon, LayoutGridIcon, ListIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type CompareLayoutMode = 'col' | 'layout' | 'list'

type ToggleGroupVerticalProps = {
  value?: CompareLayoutMode
  defaultValue?: CompareLayoutMode
  onValueChange?: (value: CompareLayoutMode) => void
  className?: string
}

const ToggleGroupVertical = ({
  value,
  defaultValue = 'layout',
  onValueChange,
  className,
}: ToggleGroupVerticalProps) => {
  const controlled = value !== undefined

  return (
    <ToggleGroup
      variant="outline"
      orientation="vertical"
      spacing={0}
      value={controlled ? [value] : undefined}
      defaultValue={controlled ? undefined : [defaultValue]}
      onValueChange={(next) => {
        const selected = next[0] as CompareLayoutMode | undefined
        if (selected) onValueChange?.(selected)
      }}
      className={cn(className)}
      aria-label="Compare layout"
    >
      <ToggleGroupItem value="col" aria-label="Two columns">
        <Columns2Icon />
      </ToggleGroupItem>
      <ToggleGroupItem value="layout" aria-label="Four-up grid">
        <LayoutGridIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value="list" aria-label="List">
        <ListIcon />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

export default ToggleGroupVertical
