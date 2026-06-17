import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'rawlogger — prosty dziennik treningowy',
    short_name: 'rawlogger',
    description: 'Zapisuj serie, ciężary i powtórzenia. Śledź postępy.',
    start_url: '/today',
    display: 'standalone',
    background_color: '#0e0e0e',
    theme_color: '#0e0e0e',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}