'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const T = { surface2:'#222', border:'#2a2a2a', muted2:'#888', accent:'#c8f135' }

const VIEWS = [
  ['/today','Dzisiaj'],['/calendar','Kalendarz'],['/plans','Plany'],['/filter','Wyszukaj'],['/tools','Narzędzia']
] as const

export default function Nav({ email }: { email: string }) {
  const path = usePathname()
  const router = useRouter()
  async function logout() {
    await supabase.auth.signOut()
    router.replace('/login')
  }
  return (
    <div style={{ maxWidth:720, margin:'0 auto', padding:'1rem 0.5rem 0' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
      <img src="/logo.png" alt="logo" style={{ height:50 }} />
	  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:11, color:T.muted2 }}>{email}</span>
          <button onClick={logout} style={{ background:'transparent', border:`1px solid #383838`, borderRadius:7, padding:'5px 10px', fontSize:12, cursor:'pointer', color:T.muted2, fontFamily:'inherit' }}>wyloguj</button>
        </div>
      </div>
      <div style={{ display:'flex', gap:4, borderBottom:`1px solid ${T.border}`, paddingBottom:10, marginBottom:20, flexWrap:'wrap' }}>
        {VIEWS.map(([href,label])=>(
          <Link key={href} href={href} style={{ background:path===href?T.surface2:'transparent', border:'none', padding:'5px 12px', fontSize:12, borderRadius:6, fontWeight:path===href?600:400, color:path===href?T.accent:T.muted2, textDecoration:'none', fontFamily:'inherit' }}>{label}</Link>
        ))}
      </div>
    </div>
  )
}