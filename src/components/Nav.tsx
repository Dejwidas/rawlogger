'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useUser } from '@/lib/UserContext'
import { friendRequestCount } from '@/lib/friends'
import BottomNav from '@/components/BottomNav'

const T = { surface2:'#222', border:'#2a2a2a', muted2:'#888', accent:'#c8f135' }

// Każda zakładka ma flagę czy chowamy ją na mobile (przeniesione do BottomNav).
const VIEWS = [
  { href:'/today',    label:'Dzisiejszy trening', hideOnMobile:true  },
  { href:'/calendar', label:'Kalendarz',          hideOnMobile:true  },
  { href:'/plans',    label:'Plany',              hideOnMobile:true  },
  { href:'/filter',   label:'Moje ćwiczenia',     hideOnMobile:false },
  { href:'/tools',    label:'Narzędzia',          hideOnMobile:false },
] as const

export default function Nav() {
  const path = usePathname()
  const { email, nickname, userId } = useUser()
  const displayName = nickname?.trim() || email
  const [pending, setPending] = useState(0)

  // Liczba zaproszeń do mnie; strona Znajomi odświeża ją zdarzeniem.
  useEffect(() => {
    if (!userId) return
    const load = () => friendRequestCount().then(setPending).catch(e => console.error('friend_request_count failed', e))
    load()
    window.addEventListener('friends-changed', load)
    return () => window.removeEventListener('friends-changed', load)
  }, [userId])

  return (
    <>
      <div style={{ maxWidth:720, margin:'0 auto', padding:'1rem 0.5rem 0' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <span style={{ fontSize:20, fontWeight:700, letterSpacing:'-0.04em', color:T.accent }}>rawlogger</span>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <Link href="/friends" title="Znajomi" aria-label={pending ? `Znajomi, ${pending} zaproszeń` : 'Znajomi'} style={{
            position:'relative', fontSize:14, lineHeight:1, padding:'4px 8px', textDecoration:'none',
            border:`1px solid ${path.startsWith('/friends') ? T.accent : T.border}`, borderRadius:7,
          }}>
            👥
            {pending > 0 && (
              <span style={{ position:'absolute', top:-6, right:-6, minWidth:16, height:16, padding:'0 4px', borderRadius:8,
                background:T.accent, color:'#111', fontSize:10, fontWeight:700, lineHeight:'16px', textAlign:'center', boxSizing:'border-box' }}>{pending}</span>
            )}
          </Link>
          <Link href="/settings" style={{
            fontSize:11, color:T.muted2, textDecoration:'none', padding:'4px 10px',
            border:`1px solid ${T.border}`, borderRadius:7, background:'transparent',
            display:'flex', alignItems:'center', gap:6
          }}>
            <span>⚙</span>
            <span style={{ maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{displayName}</span>
          </Link>
          </div>
        </div>
        <div style={{ display:'flex', gap:4, borderBottom:`1px solid ${T.border}`, paddingBottom:10, marginBottom:20, flexWrap:'wrap' }}>
          {VIEWS.map(v => (
            <Link key={v.href} href={v.href}
              className={v.hideOnMobile ? 'rl-nav-link rl-nav-link--hide-mobile' : 'rl-nav-link'}
              style={{
                background: path===v.href ? T.surface2 : 'transparent',
                border:'none', padding:'5px 12px', fontSize:12, borderRadius:6,
                fontWeight: path===v.href ? 600 : 400,
                color: path===v.href ? '#c8f135' : T.muted2,
                textDecoration:'none', fontFamily:'inherit'
              }}>{v.label}</Link>
          ))}
        </div>
      </div>
      <BottomNav />
      <style jsx global>{`
        @media (max-width: 639px) {
          .rl-nav-link--hide-mobile {
            display: none !important;
          }
        }
      `}</style>
    </>
  )
}
