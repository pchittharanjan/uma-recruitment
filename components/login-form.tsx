'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

const BERKELEY_DOMAIN = 'berkeley.edu';

function isBerkeleyEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${BERKELEY_DOMAIN}`);
}

/**
 * When the value has a local part + `@` and the domain is empty or a prefix of
 * berkeley.edu, suggest completing to `{local}@berkeley.edu`.
 */
function getBerkeleyDomainSuggestion(email: string): string | null {
  const atIndex = email.indexOf('@');
  if (atIndex <= 0) return null;

  const local = email.slice(0, atIndex);
  if (!local || local.includes('@')) return null;

  const domainPart = email.slice(atIndex + 1);
  const completed = `${local}@${BERKELEY_DOMAIN}`;

  if (email.trim().toLowerCase() === completed.toLowerCase()) return null;

  const domainLower = domainPart.toLowerCase();
  if (
    domainPart !== '' &&
    !BERKELEY_DOMAIN.toLowerCase().startsWith(domainLower)
  ) {
    return null;
  }

  return completed;
}

/** Enter in a field → same path as clicking the submit button. */
function handleFieldEnterKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.shiftKey) return;
  e.preventDefault();
  e.currentTarget.form?.requestSubmit();
}

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<'form'>) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);

  const domainSuggestion = getBerkeleyDomainSuggestion(email);
  const showDomainSuggestion =
    Boolean(domainSuggestion) && !suggestionDismissed && emailFocused;
  const ghostSuffix =
    showDomainSuggestion && domainSuggestion
      ? domainSuggestion.slice(email.length)
      : '';

  const acceptDomainSuggestion = () => {
    if (!domainSuggestion) return;
    setEmail(domainSuggestion);
    setSuggestionDismissed(true);
    if (emailError) setEmailError('');
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Keep the button hoverable while loading so :disabled doesn't reset the wipe.
    if (loadingRef.current) return;

    setError('');

    // Prefer live DOM values so browser autofill (which may skip onChange) still signs in.
    const formData = new FormData(e.currentTarget);
    const emailValue = String(formData.get('email') ?? email);
    const passwordValue = String(formData.get('password') ?? password);
    if (emailValue !== email) setEmail(emailValue);
    if (passwordValue !== password) setPassword(passwordValue);

    const nextEmailError = !emailValue.trim()
      ? 'Email is required.'
      : !isBerkeleyEmail(emailValue)
        ? 'Use your @berkeley.edu email address.'
        : '';
    const nextPasswordError = !passwordValue ? 'Password is required.' : '';

    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);

    if (nextEmailError || nextPasswordError) {
      return;
    }

    loadingRef.current = true;
    setLoading(true);

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailValue, password: passwordValue }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.user.role === 'admin') {
        router.push('/admin/dashboard');
      } else {
        router.push('/team');
      }
      return;
    }

    const data = await res.json().catch(() => ({}));
    setError(data.error ?? 'Sign in failed.');
    loadingRef.current = false;
    setLoading(false);
  };

  const handleEmailKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;

    if (showDomainSuggestion && domainSuggestion && ghostSuffix) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setSuggestionDismissed(true);
        return;
      }

      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        acceptDomainSuggestion();
        return;
      }

      // ArrowRight at end of input accepts ghost completion (URL-bar pattern).
      if (e.key === 'ArrowRight') {
        const input = e.currentTarget;
        const atEnd =
          input.selectionStart === input.value.length &&
          input.selectionEnd === input.value.length;
        if (atEnd) {
          e.preventDefault();
          acceptDomainSuggestion();
          return;
        }
      }
    }

    handleFieldEnterKeyDown(e);
  };

  return (
    <form
      className={cn('login-form flex flex-col gap-6', className)}
      {...props}
      onSubmit={handleSubmit}
      noValidate
    >
      <FieldGroup className="gap-4">
        <div className="login-form-header space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.2em] uma-gradient-text">
            Welcome back
          </p>
          <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
          {/* Same text-sm slot as the helper — swap in place so layout never shifts. */}
          <div
            className="login-form-error-slot"
            aria-live="polite"
            aria-atomic="true"
          >
            {error ? (
              <p
                className="login-form-error-banner text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Use your @berkeley.edu email and role password.
              </p>
            )}
          </div>
        </div>

        <Field data-invalid={emailError ? true : undefined}>
          <FieldLabel htmlFor="email" required>
            Berkeley email
          </FieldLabel>
          <div className="login-email-field">
            {showDomainSuggestion && ghostSuffix ? (
              <div aria-hidden className="login-email-ghost">
                <span className="login-email-ghost__typed">{email}</span>
                <span className="login-email-ghost__suffix">{ghostSuffix}</span>
              </div>
            ) : null}
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@berkeley.edu"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setSuggestionDismissed(false);
                if (emailError) setEmailError('');
              }}
              onKeyDown={handleEmailKeyDown}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              className={cn(
                'login-form-input focus-visible:ring-0',
                showDomainSuggestion &&
                  ghostSuffix &&
                  'login-form-input--ghosting',
              )}
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? 'email-error' : undefined}
              aria-autocomplete="both"
              autoComplete="email"
            />
          </div>
          <div className="login-form-field-error-slot">
            {emailError ? (
              <FieldError id="email-error">{emailError}</FieldError>
            ) : null}
          </div>
        </Field>

        <Field data-invalid={passwordError ? true : undefined}>
          <FieldLabel htmlFor="password" required>
            Password
          </FieldLabel>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (passwordError) setPasswordError('');
              }}
              onKeyDown={handleFieldEnterKeyDown}
              className="login-form-input pr-10 focus-visible:ring-0"
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={passwordError ? 'password-error' : undefined}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-[#ef9251]/10 hover:text-foreground"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <div className="login-form-field-error-slot">
            {passwordError ? (
              <FieldError id="password-error">{passwordError}</FieldError>
            ) : null}
          </div>
        </Field>

        <Field>
          <Button
            type="submit"
            variant="ghost"
            aria-busy={loading}
            data-loading={loading ? 'true' : undefined}
            className="login-signin-button h-11 w-full rounded-full text-base font-medium"
          >
            <span className="login-signin-button__label">
              <span
                className={cn(
                  'login-signin-button__label-state inline-flex items-center justify-center gap-2',
                  loading && 'invisible',
                )}
                aria-hidden={loading}
              >
                Sign in
              </span>
              <span
                className={cn(
                  'login-signin-button__label-state login-signin-button__label-state--loading inline-flex items-center justify-center gap-2',
                  !loading && 'invisible',
                )}
                aria-hidden={!loading}
              >
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Signing in…
              </span>
            </span>
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
