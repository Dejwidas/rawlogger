'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const T = { surface:'#181818', border:'#2a2a2a', muted2:'#888', accent:'#c8f135' }

const TABS = [
  ['/today', 'Dzisiejszy trening', '📋'],
  ['/calendar', 'Kalendarz', '📅'],
  ['/plans', 'Plany', '📑'],
] as const

export default function BottomNav() {
  const path = usePathname()

  return (
    <>
      <nav className="rl-bottom-nav">
        {TABS.map(([href, label, icon]) => {
          const active = path === href
          return (
            <Link key={href} href={href} style={{
              flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:2,
              padding:'8px 4px 6px', textDecoration:'none',
              color: active ? T.accent : T.muted2,
              fontWeight: active ? 600 : 400,
              fontSize:10, fontFamily:'inherit',
            }}>
              <span style={{ fontSize:18, lineHeight:1 }}>{icon}</span>
              <span style={{ textAlign:'center', lineHeight:1.1 }}>{label}</span>
            </Link>
          )
        })}
      </nav>
      <style jsx global>{`
        .rl-bottom-nav {
          display: none;
        }
        @media (max-width: 639px) {
          .rl-bottom-nav {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            z-index: 20;
            display: flex;
            background: ${T.surface};
            border-top: 1px solid ${T.border};
            padding-bottom: env(safe-area-inset-bottom);
          }
          body {
            padding-bottom: calc(64px + env(safe-area-inset-bottom));
          }
        }
      `}</style>
    </>
  )
}
