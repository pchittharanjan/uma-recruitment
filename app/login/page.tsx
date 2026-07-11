import Image from 'next/image';
import { LoginForm } from '@/components/login-form';
import { absans } from '@/lib/fonts';
import { cn } from '@/lib/utils';

export default function LoginPage() {
  return (
    <div className="relative min-h-svh overflow-hidden bg-[#faf8f5]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="uma-marketing-gradient absolute -left-1/4 top-0 h-[55vh] w-[70vw] opacity-[0.14] blur-3xl" />
        <div className="absolute -right-1/4 bottom-0 h-[45vh] w-[60vw] rounded-full bg-[#5c59b6]/15 blur-3xl" />
      </div>

      <div className="relative z-10 grid min-h-svh lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section className="uma-marketing-gradient relative flex min-h-[28vh] flex-col justify-center px-6 py-10 text-white sm:min-h-[34vh] sm:px-10 lg:min-h-svh lg:px-12 xl:px-16 2xl:px-20">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.12),transparent_45%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(0,0,0,0.12),transparent_50%)]" />
          <div className="relative space-y-6">
            <div className="flex items-center gap-2.5">
              <Image
                src="/uma-logo.png"
                alt=""
                width={28}
                height={28}
                className="size-7 shrink-0 object-contain brightness-0 invert"
              />
              <p className="text-sm font-medium leading-snug text-white/85 sm:text-base">
                Undergraduate Marketing Association
              </p>
            </div>
            <h1
              className={cn(
                absans.className,
                'max-w-2xl text-[clamp(1.8rem,4.8vw,4rem)] leading-[0.95] tracking-tight text-white',
              )}
            >
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
