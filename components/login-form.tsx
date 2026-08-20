'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

const BERKELEY_DOMAIN = 'berkeley.edu';

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  google_not_configured:
    'Google sign-in is not configured yet. Ask an admin to set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
  access_denied: 'Google sign-in was cancelled.',
  not_berkeley: 'Use your @berkeley.edu Google account.',
  no_access: "You don't have access yet. Ask an admin to add your email.",
  invalid_role: 'This account cannot sign in here.',
  email_unverified: 'Verify your Google email, then try again.',
  oauth_failed: 'Google sign-in failed. Try again, or use your role password.',
};

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

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export function LoginForm({
  googleEnabled = false,
  className,
  ...props
}: React.ComponentProps<'form'> & { googleEnabled?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const loadingRef = useRef(false);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  useEffect(() => {
    const code = searchParams.get('error');
    if (!code) return;
    setError(OAUTH_ERROR_MESSAGES[code] ?? OAUTH_ERROR_MESSAGES.oauth_failed);
  }, [searchParams]);

  useEffect(() => {
    if (!showPasswordForm) return;
    const id = window.requestAnimationFrame(() => {
      document.getElementById('email')?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [showPasswordForm]);

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

  const handleGoogleSignIn = () => {
    if (googleLoading || loadingRef.current) return;
    setError('');
    setGoogleLoading(true);
    window.location.href = '/api/auth/google';
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // data-loading keeps the wipe filled until auth resolves (or error resets it).
    if (loadingRef.current || googleLoading) return;

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

  const passwordFormOpen = !googleEnabled || showPasswordForm;

  const helperText = googleEnabled
    ? 'Continue with your @berkeley.edu Google account.'
    : 'Use your @berkeley.edu email and role password.';

  return (
    <form
      className={cn('login-form flex flex-col gap-6', className)}
      {...props}
      onSubmit={handleSubmit}
      noValidate
    >
      <FieldGroup>
        <div className="login-form-header space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.2em] uma-gradient-text">
            Welcome
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
              <p className="text-sm text-muted-foreground">{helperText}</p>
            )}
          </div>
        </div>

        {googleEnabled ? (
          <Field>
            <Button
              type="button"
              variant="ghost"
              aria-busy={googleLoading}
              data-loading={googleLoading ? 'true' : undefined}
              onClick={handleGoogleSignIn}
              disabled={loading}
              className={cn(
                'login-signin-button h-11 w-full rounded-full text-base font-medium normal-case',
                googleLoading && 'pointer-events-none',
              )}
            >
              <span className="login-signin-button__label">
                <span
                  className={cn(
                    'login-signin-button__label-state inline-flex items-center justify-center gap-2 normal-case',
                    googleLoading && 'invisible',
                  )}
                  aria-hidden={googleLoading}
                >
                  <GoogleMark className="size-4 shrink-0" />
                  Continue with Google
                </span>
                <span
                  className={cn(
                    'login-signin-button__label-state login-signin-button__label-state--loading inline-flex items-center justify-center gap-2',
                    !googleLoading && 'invisible',
                  )}
                  aria-hidden={!googleLoading}
                >
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Redirecting…
                </span>
              </span>
            </Button>
          </Field>
        ) : null}

        <div className={cn(googleEnabled && 'login-password-slot')}>
          {googleEnabled && !showPasswordForm ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowPasswordForm(true)}
              className="h-11 w-full rounded-full text-base font-medium normal-case"
            >
              Sign in with password
            </Button>
          ) : (
            <div
              className={cn(
                'login-password-slot__form',
                googleEnabled && 'login-password-slot__form--revealed',
              )}
            >
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
                    tabIndex={passwordFormOpen ? undefined : -1}
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
                {emailError ? (
                  <div className="login-form-field-error-slot">
                    <FieldError id="email-error">{emailError}</FieldError>
                  </div>
                ) : null}
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
                    tabIndex={passwordFormOpen ? undefined : -1}
                    className="login-form-input pr-10 focus-visible:ring-0"
                    aria-invalid={passwordError ? true : undefined}
                    aria-describedby={passwordError ? 'password-error' : undefined}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    tabIndex={passwordFormOpen ? undefined : -1}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-[#ef9251]/10 hover:text-foreground"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {passwordError ? (
                  <div className="login-form-field-error-slot">
                    <FieldError id="password-error">{passwordError}</FieldError>
                  </div>
                ) : null}
              </Field>

              <Field>
                <Button
                  type="submit"
                  variant="ghost"
                  aria-busy={loading}
                  data-loading={loading ? 'true' : undefined}
                  disabled={googleLoading}
                  tabIndex={passwordFormOpen ? undefined : -1}
                  className={cn(
                    'h-11 w-full rounded-full text-base font-medium',
                    googleEnabled
                      ? 'border border-border bg-background text-foreground hover:bg-muted/50'
                      : 'login-signin-button',
                  )}
                >
                  {googleEnabled ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      {loading ? (
                        <>
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                          Signing in…
                        </>
                      ) : (
                        'Sign in with password'
                      )}
                    </span>
                  ) : (
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
                  )}
                </Button>
              </Field>
            </div>
          )}
        </div>
      </FieldGroup>
    </form>
  );
}
