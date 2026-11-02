'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'
import SharedPlanDetails from '@/components/SharedPlanDetails'
import { authorLabel, getSharedPlan, loginHrefFor, type SharedPlan } from '@/lib/sharing'

const T = { bg:'#0e0e0e', surface:'#181818', border:'#2a2a2a', text:'#e8e8e8', muted:'#555', muted2:'#888', accent:'#c8f135' }
const card: React.CSSProperties = { background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:'14px 16px', marginBottom:10 }

export default function SharedPlanPage() {
  const router = useRouter()
  const token = useParams().token as string
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)
  const [plan, setPlan] = useState<SharedPlan | null | 'missing'>(null)
  const [err, setErr]   = useState('')
  const [inBrowserOnPhone, setInBrowserOnPhone] = useState(false)
  const [copied, setCopied] = useState(false)
  const [androidIntent, setAndroidIntent] = useState<string | null>(null)

  // Przeglądarki wbudowane w komunikatory (Messenger itp.) i iPhone nie
  // przekazują linków do aplikacji z ekranu głównego, a ma ona osobną sesję.
  // Na Androidzie link intent:// otwiera adres w Chrome, a Chrome sam przekazuje
  // go do zainstalowanej aplikacji. Wszędzie zostaje skopiowanie i wklejenie.
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
    setInBrowserOnPhone(!standalone && window.matchMedia('(pointer: coarse)').matches)
    if (!standalone && /Android/i.test(navigator.userAgent)) {
      setAndroidIntent(`intent://${window.location.host}${window.location.pathname}#Intent;scheme=https;package=com.android.chrome;end`)
    }
  }, [])

  async function copyHere() {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true) }
    catch (e) { console.error('copy failed', e) }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setLoggedIn(!!session)
      try {
        setPlan((await getSharedPlan(token)) ?? 'missing')
      } catch (e: any) {
        console.error('get_shared_plan failed', e)
        setErr(`Nie wczytano planu: ${e.message}`)
      }
    })
  }, [token])

  return (
    <div style={{ background:T.bg, minHeight:'100vh', color:T.text }}>
      {loggedIn ? <Nav /> : (
        <div style={{ maxWidth:720, margin:'0 auto', padding:'1rem 0.5rem 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <Link href="/" style={{ fontSize:20, fontWeight:700, letterSpacing:'-0.04em', color:T.accent, textDecoration:'none' }}>rawlogger</Link>
          {loggedIn === false && <Link href={loginHrefFor(`/p/${token}`)} style={{ fontSize:11, color:T.muted2 }}>zaloguj się</Link>}
        </div>
      )}
      <div style={{ maxWidth:720, margin:'0 auto', padding:'0 0.5rem 2rem' }}>
        {inBrowserOnPhone && plan && plan !== 'missing' && (
          <div style={{ ...card, borderColor:'#383838' }}>
            <div style={{ fontSize:13, marginBottom:6 }}>Masz rawlogger na ekranie głównym?</div>
            {androidIntent && (
              <a href={androidIntent} style={{ display:'inline-block', background:T.accent, color:'#111', borderRadius:7, padding:'7px 16px', fontSize:12, fontWeight:600, textDecoration:'none', marginBottom:10 }}>
                Otwórz w aplikacji
              </a>
            )}
            <div style={{ fontSize:12, color:T.muted2, marginBottom:10 }}>
              {androidIntent ? 'Jeśli to nie zadziała: ' : ''}skopiuj link, otwórz aplikację i wklej go w Plany → Katalog → „Masz link do planu?”.
            </div>
            <button onClick={copyHere} style={{ background: androidIntent ? 'transparent' : T.accent, color: androidIntent ? T.muted2 : '#111',
              border: androidIntent ? '1px solid #383838' : 'none', borderRadius:7, padding:'7px 16px', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
              {copied ? 'Skopiowano ✓' : 'Kopiuj link'}
            </button>
          </div>
        )}
        {err && <p style={{ fontSize:12, color:'#ff4444' }}>{err}</p>}
        {plan === null && !err && <p style={{ fontSize:12, color:T.muted }}>Wczytywanie...</p>}
        {plan === 'missing' && (
          <div style={card}>
            <p style={{ fontSize:13, margin:0 }}>Ten link wygasł albo plan nie jest już udostępniony.</p>
          </div>
        )}
        {plan && plan !== 'missing' && (
          <div style={card}>
            <div style={{ fontSize:11, color:T.muted2, textTransform:'uppercase', letterSpacing:'0.04em' }}>Udostępniony plan</div>
            <div style={{ fontSize:18, fontWeight:700, margin:'4px 0 2px' }}>{plan.title}</div>
            <div style={{ fontSize:12, color:T.muted2, marginBottom:12 }}>autor: {plan.is_mine ? 'Ty' : authorLabel(plan.author)}</div>
            <SharedPlanDetails plan={plan}
              loginHref={loggedIn ? null : loginHrefFor(`/p/${token}`)}
              onChange={setPlan}
              onImported={id => router.push(`/plans?open=${id}`)} />
          </div>
        )}
      </div>
    </div>
  )
}
