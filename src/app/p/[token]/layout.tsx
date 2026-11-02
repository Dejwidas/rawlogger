import type { Metadata } from 'next'

// Link do planu jest prywatny dla tych, którym go wysłano: nie do wyszukiwarek.
export const metadata: Metadata = {
  title: 'Plan treningowy — rawlogger',
  robots: { index: false, follow: false },
}

export default function SharedPlanLayout({ children }: { children: React.ReactNode }) {
  return children
}
