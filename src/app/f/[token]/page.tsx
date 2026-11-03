'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'
import OpenInAppHint from '@/components/OpenInAppHint'
import { loginHrefFor } from '@/lib/sharing'
import { acceptFriendInvite, getFriendInvite, type FriendInvite } from '@/lib/friends'

const T = { bg:'#0e0e0e', surface:'#181818', border:'#2a2a2a', text:'#e8e8e8', muted:'#555', muted2:'#888', accent:'#c8f135', danger:'#ff4444' }
const card: React.CSSProperties = { background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:'14px 16px', marginBottom:10 }
const btn: React.CSSProperties = { display:'inline-block', background:T.accent, color:'#111', border:'none', borderRadius:7, padding:'8px 18px', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit', textDecoration:'none' }

export default function FriendInvitePage() {
  const router = useRouter()
  const token = useParams().token as string
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)
  const [invite, setInvite] = useState<FriendInvite | null | 'missing'>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setLoggedIn(!!session)
      try { setInvite((await getFriendInvite(token)) ?? 'missing') }
      catch (e: any) { console.error('get_friend_invite failed', e); setErr(`Nie wczytano zaproszenia: ${e.message}`) }
    })
  }, [token])

  async function accept() {
    setBusy(true); setErr('')
    try {
      await acceptFriendInvite(token)
      window.dispatchEvent(new Event('friends-changed'))
      router.push('/friends')
    } catch (e: any) {
      console.error('accept_friend_invite failed', e)
      setErr(e.message); setBusy(false)
    }
  }

  const ready = invite && invite !== 'missing'
  return (
    <div style={{ background:T.bg, minHeight:'100vh', color:T.text }}>
      {loggedIn ? <Nav /> : (
        <div style={{ maxWidth:720, margin:'0 auto', padding:'1rem 0.5rem 16px' }}>
          <Link href="/" style={{ fontSize:20, fontWeight:700, letterSpacing:'-0.04em', color:T.accent, textDecoration:'none' }}>rawlogger</Link>
        </div>
      )}
      <div style={{ maxWidth:720, margin:'0 auto', padding:'0 0.5rem 2rem' }}>
        {ready && !invite.is_self && !invite.already_friends && <OpenInAppHint pasteWhere="Znajomi → „Masz link zaproszenia?”" />}
        {invite === null && !err && <p style={{ fontSize:12, color:T.muted }}>Wczytywanie...</p>}
        {invite === 'missing' && (
          <div style={card}><p style={{ fontSize:13, margin:0 }}>Ten link zaproszenia wygasł. Poproś o nowy.</p></div>
        )}
        {ready && (
          <div style={card}>
            <div style={{ fontSize:11, color:T.muted2, textTransform:'uppercase', letterSpacing:'0.04em' }}>Zaproszenie do znajomych</div>
            {invite.is_self ? (
              <p style={{ fontSize:13 }}>To Twój link. Wyślij go znajomym, a po kliknięciu „Akceptuj” zostaną Twoimi znajomymi.</p>
            ) : invite.already_friends ? (
              <>
                <p style={{ fontSize:13 }}>Ty i {invite.name} już jesteście znajomymi.</p>
                <Link href="/friends" style={btn}>Przejdź do znajomych</Link>
              </>
            ) : (
              <>
                <div style={{ fontSize:18, fontWeight:700, margin:'6px 0 4px' }}>{invite.name}</div>
                <p style={{ fontSize:13, color:T.muted2, marginTop:0 }}>
                  zaprasza Cię do znajomych. Będziecie widzieć nawzajem swoje kalendarze treningów, bez notatek.
                </p>
                {loggedIn
                  ? <button style={btn} onClick={accept} disabled={busy}>{busy ? '...' : 'Akceptuj'}</button>
                  : (
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                      <Link href={`${loginHrefFor(`/f/${token}`)}&mode=reg`} style={btn}>Załóż konto i dołącz</Link>
                      <Link href={loginHrefFor(`/f/${token}`)} style={{ ...btn, background:'transparent', color:T.muted2, border:`1px solid ${T.border}` }}>Mam konto, zaloguj się</Link>
                    </div>
                  )}
              </>
            )}
          </div>
        )}
        {err && <p style={{ fontSize:12, color:T.danger }}>{err}</p>}
      </div>
    </div>
  )
}
