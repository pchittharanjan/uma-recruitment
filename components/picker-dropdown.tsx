'use client';

import { ChevronDownIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface PickerOption<T extends string | number = string> {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
  indicatorClassName?: string;
}

interface PickerDropdownBaseProps {
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  align?: 'start' | 'center' | 'end';
  id?: string;
  'aria-label'?: string;
}

export function PickerDropdown<T extends string>({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  allowClear = false,
  clearLabel = 'Not set',
  disabled = false,
  className,
  triggerClassName,
  contentClassName,
  align = 'start',
  id,
  'aria-label': ariaLabel,
}: PickerDropdownBaseProps & {
  value: T | null;
  onChange: (value: T | null) => void;
  options: PickerOption<T>[];
  allowClear?: boolean;
  clearLabel?: string;
}) {
  const selected = options.find((option) => option.value === value);
  const summary = selected?.label ?? placeholder;

  return (
    <div className={cn('min-w-0', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger
          id={id}
          disabled={disabled}
          aria-label={ariaLabel}
          render={
            <Button
              type="button"
              size="default"
              variant="outline"
              className={cn(
                'h-8 w-full min-w-0 justify-between gap-3 rounded-md px-3 text-left font-normal',
                triggerClassName,
              )}
            />
          }
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            {selected?.indicatorClassName ? (
              <span
                aria-hidden
                className={cn('size-2 shrink-0 rounded-full', selected.indicatorClassName)}
              />
            ) : null}
            <span
              className={cn(
                'whitespace-nowrap',
                !selected && 'text-muted-foreground',
              )}
            >
              {summary}
            </span>
          </span>
          <ChevronDownIcon className="size-3.5 shrink-0 opacity-70" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={align}
          className={cn(
            'max-h-72 w-max min-w-[10rem] overflow-x-visible overflow-y-auto p-2',
            contentClassName,
          )}
        >
          {allowClear ? (
            <>
              <DropdownMenuItem
                onClick={() => onChange(null)}
                className={cn('rounded-md px-3 py-2', value === null && 'bg-primary/10 text-primary')}
              >
                {clearLabel}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-2" />
            </>
          ) : null}
          <DropdownMenuRadioGroup
            value={value ?? ''}
            onValueChange={(next) => onChange(next as T)}
          >
            {options.map((option) => (
              <DropdownMenuRadioItem
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className="rounded-md px-3 py-2"
              >
                <span className="flex items-center gap-2 whitespace-nowrap">
                  {option.indicatorClassName ? (
                    <span
                      aria-hidden
                      className={cn('size-2 shrink-0 rounded-full', option.indicatorClassName)}
                    />
                  ) : null}
                  <span>{option.label}</span>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function MultiPickerDropdown<T extends string | number>({
  options,
  selectedValues,
  onToggleValue,
  placeholder = 'Select…',
  disabledLabel,
  disabled = false,
  className,
  triggerClassName,
  contentClassName,
  align = 'end',
  id,
  'aria-label': ariaLabel,
}: PickerDropdownBaseProps & {
  options: PickerOption<T>[];
  selectedValues: T[];
  onToggleValue: (value: T) => void;
  disabledLabel?: string;
}) {
  const selectedLabels = options
    .filter((option) => selectedValues.includes(option.value))
    .map((option) => option.label);
  const summary = disabled
    ? (disabledLabel ?? placeholder)
    : selectedLabels.length > 0
      ? selectedLabels.join(', ')
      : placeholder;

  return (
    <div className={cn('min-w-0', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger
          id={id}
          disabled={disabled}
          aria-label={ariaLabel}
          render={
            <Button
              type="button"
              size="default"
              variant="outline"
              className={cn(
                'h-8 w-full justify-between gap-3 rounded-md px-3 text-left font-normal',
                triggerClassName,
              )}
            />
          }
        >
          <span
            className={cn(
              'min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap',
              !disabled && selectedLabels.length === 0 && 'text-muted-foreground',
            )}
          >
            {summary}
          </span>
          <ChevronDownIcon className="size-3.5 shrink-0 opacity-70" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={align}
          className={cn('max-h-72 min-w-72 overflow-y-auto p-2', contentClassName)}
        >
          {options.map((option) => {
            const checked = selectedValues.includes(option.value);
            return (
              <div
                key={String(option.value)}
                onClick={() => !option.disabled && onToggleValue(option.value)}
                role="button"
                tabIndex={option.disabled ? -1 : 0}
                onKeyDown={(event) => {
                  if (option.disabled) return;
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  onToggleValue(option.value);
                }}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm capitalize transition-colors',
                  option.disabled
                    ? 'cursor-not-allowed opacity-50'
                    : checked
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-muted',
                )}
              >
                <span>{option.label}</span>
                <Checkbox
                  checked={checked}
                  disabled={option.disabled}
                  onCheckedChange={() => onToggleValue(option.value)}
                  onClick={(event) => event.stopPropagation()}
                  aria-label={`Select ${option.label}`}
                />
              </div>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
