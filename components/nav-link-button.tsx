'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';
import { Button } from '@/components/ui/button';

type LegacyVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const variantMap: Record<LegacyVariant, ComponentProps<typeof Button>['variant']> = {
  primary: 'default',
  secondary: 'ghost',
  danger: 'destructive',
  ghost: 'ghost',
};

type NavLinkButtonProps = Omit<ComponentProps<typeof Button>, 'render' | 'nativeButton' | 'variant'> & {
  href: string;
  /** Matches LoadingButton legacy variants for drop-in replacement. */
  variant?: LegacyVariant;
};

/** Button-styled Next.js Link — prefetches routes and participates in client transitions. */
export function NavLinkButton({
  href,
  variant = 'primary',
  ...props
}: NavLinkButtonProps) {
  return (
    <Button
      nativeButton={false}
      variant={variantMap[variant]}
      render={<Link href={href} prefetch />}
      {...props}
    />
  );
}
