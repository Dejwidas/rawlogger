import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { UserProvider } from '@/lib/UserContext'

export const metadata: Metadata = {
  title: 'rawlogger — prosty dziennik treningowy',
  description: 'Rawlogger to prosta aplikacja treningowa do prowadzenia dziennika treningowego. Zapisuj serie, ciężary, powtórzenia i śledź swoje postępy.',
  keywords: ['dziennik treningowy', 'aplikacja treningowa', 'notatnik treningowy', 'logowanie treningów', 'śledzenie postępów siłownia', 'trening siłowy', 'rekordy treningowe'],
  openGraph: {
    title: 'rawlogger — prosty dziennik treningowy',
    description: 'Zapisuj treningi, śledź rekordy i planuj kolejne sesje. Prosta aplikacja treningowa dla każdego.',
    url: 'https://rawlogger.pl',
    siteName: 'rawlogger',
    locale: 'pl_PL',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: 'https://rawlogger.pl',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body style={{ margin:0, background:'#0e0e0e', color:'#e8e8e8',
        fontFamily:'system-ui, sans-serif', minHeight:'100vh' }}>
        <UserProvider>
          {children}
        </UserProvider>
        <Analytics />
      </body>
    </html>
  )
}