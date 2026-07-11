import type { KeyboardEvent } from 'react';

/** Enter in a single-line field: commit edit and optionally move focus. */
export function handleSingleLineEnterKeyDown(
  e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
  next?: HTMLElement | null,
) {
  if (e.key !== 'Enter' || e.shiftKey) return;
  e.preventDefault();
  if (next) {
    next.focus();
  } else {
    e.currentTarget.blur();
  }
}

/** Focus the next bulk-table cell in the same row (name → email → role). */
export function handleBulkRowEnterKeyDown(
  e: KeyboardEvent<HTMLInputElement>,
  rowNumber: number,
  field: 'name' | 'email',
) {
  if (e.key !== 'Enter' || e.shiftKey) return;
  e.preventDefault();
  const next =
    field === 'name'
      ? document.querySelector<HTMLInputElement>(`[data-bulk-row="${rowNumber}"][data-bulk-field="email"]`)
      : document.getElementById(`bulk-row-${rowNumber}-role`);
  next?.focus();
}
