import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  const base: MetadataRoute.Manifest = {
    name: 'rawlogger — prosty dziennik treningowy',
    short_name: 'rawlogger',
    description: 'Zapisuj serie, ciężary i powtórzenia. Śledź postępy.',
    start_url: '/today',
    // Linki z całej domeny (np. /p/<token>) należą do aplikacji. Na Androidzie
    // system otwiera je wtedy w zainstalowanej aplikacji, w już otwartym oknie.
    scope: '/',
    display: 'standalone',
    launch_handler: { client_mode: 'navigate-existing' },
    background_color: '#0e0e0e',
    theme_color: '#0e0e0e',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
  // handle_links nie ma jeszcze w typach Next, a Chrome je obsługuje.
  return { ...base, handle_links: 'preferred' } as MetadataRoute.Manifest
}
