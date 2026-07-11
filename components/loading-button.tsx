'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ComponentProps } from 'react';

type LegacyVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const variantMap: Record<LegacyVariant, ComponentProps<typeof Button>['variant']> = {
  primary: 'default',
  secondary: 'ghost',
  danger: 'destructive',
  ghost: 'ghost',
};

interface LoadingButtonProps extends Omit<ComponentProps<typeof Button>, 'variant'> {
  variant?: LegacyVariant;
  loading?: boolean;
}

export default function LoadingButton({
  variant = 'primary',
  loading,
  disabled,
  children,
  className,
  ...props
}: LoadingButtonProps) {
  return (
    <Button
      variant={variantMap[variant]}
      disabled={disabled || loading}
      className={className}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </Button>
  );
}
