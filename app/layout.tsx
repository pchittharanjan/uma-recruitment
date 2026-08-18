import type { Metadata } from 'next';
import { absans, futuraStd } from '@/lib/fonts';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import './globals.css';

export const metadata: Metadata = {
  title: 'UMA Recruitment Hub',
  description: 'Application Grading platform',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${absans.variable} ${futuraStd.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <TooltipProvider>
          {children}
          <Toaster closeButton position="bottom-right" />
        </TooltipProvider>
      </body>
    </html>
  );
}
