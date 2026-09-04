'use client';

import { useState, type ComponentProps } from 'react';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type PasswordInputProps = Omit<ComponentProps<typeof Input>, 'type'> & {
  wrapperClassName?: string;
};

/** Text input with show/hide toggle (password eye). */
export function PasswordInput({
  className,
  wrapperClassName,
  id,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={cn('relative w-full max-w-xs', wrapperClassName)}>
      <Input
        id={id}
        type={visible ? 'text' : 'password'}
        autoComplete="new-password"
        className={cn('pr-10', className)}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
        aria-label={visible ? 'Hide code' : 'Show code'}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
      </button>
    </div>
  );
}
