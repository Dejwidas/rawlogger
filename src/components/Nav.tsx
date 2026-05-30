'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUser } from '@/lib/UserContext'

const T = { surface2:'#222', border:'#2a2a2a', muted2:'#888', accent:'#c8f135' }

const VIEWS = [
  ['/today','Dzisiaj'],['/calendar','Kalendarz'],['/plans','Plany'],['/filter','Wyszukaj'],['/tools','Narzędzia']
] as const

export default function Nav() {
  const path = usePathname()
  const { email, nickname } = useUser()
  const displayName = nickname?.trim() || email

  return (
    <div style={{ maxWidth:720, margin:'0 auto', padding:'1rem 0.5rem 0' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <span style={{ fontSize:20, fontWeight:700, letterSpacing:'-0.04em', color:T.accent }}>rawlogger</span>
        <Link href="/settings" style={{
          fontSize:11, color:T.muted2, textDecoration:'none', padding:'4px 10px',
          border:`1px solid ${T.border}`, borderRadius:7, background:'transparent',
          display:'flex', alignItems:'center', gap:6
        }}>
          <span>⚙</span>
          <span style={{ maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{displayName}</span>
        </Link>
      </div>
      <div style={{ display:'flex', gap:4, borderBottom:`1px solid ${T.border}`, paddingBottom:10, marginBottom:20, flexWrap:'wrap' }}>
        {VIEWS.map(([href,label]) => (
          <Link key={href} href={href} style={{
            background: path===href ? T.surface2 : 'transparent',
            border:'none', padding:'5px 12px', fontSize:12, borderRadius:6,
            fontWeight: path===href ? 600 : 400,
            color: path===href ? T.accent : T.muted2,
            textDecoration:'none', fontFamily:'inherit'
          }}>{label}</Link>
        ))}
      </div>
    </div>
  )
}
