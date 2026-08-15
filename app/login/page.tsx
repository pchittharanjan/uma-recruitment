import Image from 'next/image';
import { LoginForm } from '@/components/login-form';

export default function LoginPage() {
  return (
    <div className="relative min-h-svh overflow-hidden bg-[#faf8f5]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="uma-marketing-gradient absolute -left-1/4 top-0 h-[55vh] w-[70vw] opacity-[0.14] blur-3xl" />
        <div className="absolute -right-1/4 bottom-0 h-[45vh] w-[60vw] rounded-full bg-[#5c59b6]/15 blur-3xl" />
      </div>

      <div className="relative z-10 grid min-h-svh lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section className="relative flex min-h-[28vh] flex-col justify-center overflow-hidden bg-[#9c5e8d] px-6 py-10 text-white sm:min-h-[34vh] sm:px-10 lg:min-h-svh lg:px-12 xl:px-16 2xl:px-20">
          {/* Soft base only — animated blobs carry the color motion */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,#5c59b6_0%,#9c5e8d_40%,#dd6a56_75%,#ef9251_100%)] opacity-55"
          />
          <div
            aria-hidden
            className="uma-gradient-blob uma-gradient-blob-purple pointer-events-none absolute -inset-[40%]"
          />
          <div
            aria-hidden
            className="uma-gradient-blob uma-gradient-blob-magenta pointer-events-none absolute -inset-[40%]"
          />
          <div
            aria-hidden
            className="uma-gradient-blob uma-gradient-blob-coral pointer-events-none absolute -inset-[40%]"
          />
          <div
            aria-hidden
            className="uma-gradient-blob uma-gradient-blob-orange pointer-events-none absolute -inset-[40%]"
          />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.1),transparent_45%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(0,0,0,0.1),transparent_50%)]" />
          <div aria-hidden className="uma-login-hero-grain" />
          {/*
            Hero copy grid — logo column is the rendered logo width at h-7 (28px):
            28 × (730 ÷ 838) ≈ 24.39px. Logo and h1 both start on column line 1.
          */}
          <div
            className="login-hero-grid relative z-[2] max-w-2xl"
            style={{
              ['--login-logo-width' as string]: 'calc(1.75rem * 730 / 838)',
              ['--login-col-gap' as string]: '0.625rem',
              ['--login-row-gap' as string]: '1.5rem',
              ['--login-title-offset' as string]: '-3px',
            }}
          >
            <Image
              src="/uma-logo.png"
              alt=""
              width={730}
              height={838}
              className="login-hero-grid__logo h-7 w-auto shrink-0 object-contain object-left brightness-0 invert"
            />
            <p className="login-hero-grid__org text-sm font-medium leading-snug text-white/85 sm:text-base">
              Undergraduate Marketing Association
            </p>
            <h1 className="login-hero-grid__title font-heading text-[clamp(1.8rem,4.8vw,4rem)] leading-[0.95] tracking-tight text-white">
              Recruitment Hub
            </h1>
          </div>
        </section>

        <section className="flex items-center justify-center px-5 py-10 sm:px-8 lg:px-12 xl:px-16 2xl:px-20">
          <div className="w-full max-w-md">
            <LoginForm />
          </div>
        </section>
      </div>
    </div>
  );
}
