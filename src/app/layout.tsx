import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'

export const metadata: Metadata = { title: 'rawlogger', description: 'surowy dziennik treningowy' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body style={{ margin: 0, background: '#0e0e0e', color: '#e8e8e8',
        fontFamily: 'system-ui, sans-serif', minHeight: '100vh' }}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}