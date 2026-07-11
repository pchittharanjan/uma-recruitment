import type { PickerOption } from '@/components/picker-dropdown';

export const USER_UI_ROLE_OPTIONS: PickerOption<'exec' | 'director' | 'admin'>[] = [
  { value: 'exec', label: 'Exec' },
  { value: 'director', label: 'Director' },
  { value: 'admin', label: 'Admin' },
];
