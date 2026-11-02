import type { Metadata } from 'next'

// Osobisty link zaproszenia: nie do wyszukiwarek.
export const metadata: Metadata = {
  title: 'Zaproszenie do znajomych — rawlogger',
  robots: { index: false, follow: false },
}

export default function FriendInviteLayout({ children }: { children: React.ReactNode }) {
  return children
}
