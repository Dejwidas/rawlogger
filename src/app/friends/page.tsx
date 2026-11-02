'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'
import { tokenFromLink } from '@/lib/sharing'
import {
  cancelFriendRequest, getInviteToken, inviteUrl, loadFriendOverview, removeFriend,
  respondFriendRequest, sendFriendRequest, type FriendOverview,
} from '@/lib/friends'

const T = { bg:'#0e0e0e',surface:'#181818',surface2:'#222',border:'#2a2a2a',border2:'#383838',text:'#e8e8e8',muted:'#555',muted2:'#888',accent:'#c8f135',danger:'#ff4444' }
const card: React.CSSProperties = { background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:'14px 16px', marginBottom:10 }
const inp: React.CSSProperties = { width:'100%', background:T.surface2, border:`1px solid ${T.border2}`, borderRadius:7, padding:'8px 10px', fontSize:13, color:T.text, fontFamily:'var(--font-sans)', outline:'none', boxSizing:'border-box' }
const lbl: React.CSSProperties = { fontSize:11, color:T.muted2, marginBottom:8, letterSpacing:'0.04em', textTransform:'uppercase' as const }
const b = (primary: boolean, extra: React.CSSProperties = {}): React.CSSProperties => ({ background:primary?T.accent:'transparent', color:primary?'#111':T.muted2, border:`1px solid ${primary?T.accent:T.border2}`, borderRadius:7, padding:'7px 16px', fontSize:12, cursor:'pointer', fontWeight:primary?600:400, fontFamily:'inherit', ...extra })
const row: React.CSSProperties = { display:'flex', alignItems:'center', gap:8, padding:'8px 0', borderBottom:`1px solid ${T.border}`, fontSize:13 }

// Plakietka w nagłówku nasłuchuje tego zdarzenia.
const notifyNav = () => window.dispatchEvent(new Event('friends-changed'))

export default function FriendsPage() {
  const router = useRouter()
  const [data, setData]       = useState<FriendOverview | null>(null)
  const [token, setToken]     = useState('')
  const [email, setEmail]     = useState('')
  const [pasted, setPasted]   = useState('')
  const [msg, setMsg]         = useState<{ ok: boolean, text: string } | null>(null)
  const [busy, setBusy]       = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [confirmReset, setConfirmReset]   = useState(false)
  const [canShare, setCanShare] = useState(false)

  async function reload() {
    try { setData(await loadFriendOverview()) }
    catch (e: any) { console.error('friend_overview failed', e); setMsg({ ok:false, text:`Nie wczytano znajomych: ${e.message}` }) }
  }

  useEffect(() => {
    setCanShare(typeof navigator.share === 'function')
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/login?next=/friends'); return }
      await reload()
      try { setToken(await getInviteToken()) } catch (e) { console.error('invite link failed', e) }
    })
  }, [])

  // Wspólna obsługa akcji: komunikat, odświeżenie listy i plakietki.
  async function run(action: () => Promise<string | void>, okText?: string) {
    setBusy(true); setMsg(null)
    try {
      const text = await action()
      setMsg({ ok:true, text: text || okText || 'Zapisano.' })
      await reload(); notifyNav()
    } catch (e: any) {
      console.error('friends action failed', e)
      setMsg({ ok:false, text: e.message })
    } finally { setBusy(false) }
  }

  const send = () => run(async () => {
    const text = await sendFriendRequest(email)
    setEmail('')
    return text
  })

  async function copyInvite() {
    try { await navigator.clipboard.writeText(inviteUrl(token)); setMsg({ ok:true, text:'Skopiowano link zaproszenia.' }) }
    catch (e) { console.error('copy failed', e); setMsg({ ok:false, text:'Nie udało się skopiować. Zaznacz link i skopiuj ręcznie.' }) }
  }

  async function shareInvite() {
    try { await navigator.share({ title:'Zaproszenie do rawlogger', url: inviteUrl(token) }) }
    catch (e: any) { if (e?.name !== 'AbortError') console.error('share failed', e) }
  }

  const resetInvite = () => run(async () => {
    setToken(await getInviteToken(true)); setConfirmReset(false)
    return 'Nowy link gotowy. Stary już nie działa.'
  })

  function openPasted() {
    const t = tokenFromLink(pasted)
    if (!t) { setMsg({ ok:false, text:'To nie wygląda na link zaproszenia.' }); return }
    router.push(`/f/${t}`)
  }

  return (
    <div style={{ background:T.bg, minHeight:'100vh', color:T.text }}>
      <Nav />
      <div style={{ maxWidth:720, margin:'0 auto', padding:'0 0.5rem 2rem' }}>
        {msg && <p style={{ fontSize:12, color: msg.ok ? T.muted2 : T.danger, margin:'0 0 10px' }}>{msg.text}</p>}

        {data && data.incoming.length > 0 && (
          <div style={{ ...card, borderColor:T.accent }}>
            <div style={lbl}>Zaproszenia do Ciebie</div>
            {data.incoming.map(r => (
              <div key={r.id} style={row}>
                <span style={{ flex:1 }}>{r.name}</span>
                <button style={b(true, { padding:'5px 12px' })} disabled={busy}
                  onClick={() => run(() => respondFriendRequest(r.id, true), `Ty i ${r.name} jesteście znajomymi.`)}>Akceptuj</button>
                <button style={b(false, { padding:'5px 12px' })} disabled={busy}
                  onClick={() => run(() => respondFriendRequest(r.id, false), 'Zaproszenie odrzucone.')}>Odrzuć</button>
              </div>
            ))}
          </div>
        )}

        <div style={card}>
          <div style={lbl}>Znajomi</div>
          {data === null && <p style={{ fontSize:12, color:T.muted }}>Wczytywanie...</p>}
          {data?.friends.length === 0 && <p style={{ fontSize:12, color:T.muted }}>Nie masz jeszcze znajomych. Zaproś kogoś poniżej.</p>}
          {data?.friends.map(f => (
            <div key={f.id} style={row}>
              {confirmRemove === f.id ? (
                <>
                  <span style={{ flex:1, color:T.danger, fontSize:12 }}>Usunąć {f.name} ze znajomych? Przestaniecie widzieć swoje kalendarze.</span>
                  <button style={b(false, { padding:'4px 10px', fontSize:11, borderColor:T.danger, color:T.danger })} disabled={busy}
                    onClick={() => run(async () => { await removeFriend(f.id); setConfirmRemove(null) }, `Usunięto ${f.name} ze znajomych.`)}>Usuń</button>
                  <button style={b(false, { padding:'4px 10px', fontSize:11 })} onClick={() => setConfirmRemove(null)}>Anuluj</button>
                </>
              ) : (
                <>
                  <Link href={`/friends/${f.id}`} style={{ flex:1, color:T.text }}>{f.name}</Link>
                  <Link href={`/friends/${f.id}`} style={b(false, { padding:'4px 10px', fontSize:11, textDecoration:'none' })}>📅 kalendarz</Link>
                  <button style={b(false, { padding:'4px 10px', fontSize:11, borderColor:T.border, color:T.muted })}
                    onClick={() => setConfirmRemove(f.id)}>usuń</button>
                </>
              )}
            </div>
          ))}
        </div>

        <div style={card}>
          <div style={lbl}>Zaproś znajomego</div>
          <div style={{ display:'flex', gap:8 }}>
            <input style={{ ...inp, flex:1 }} type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="adres e-mail znajomego" autoComplete="off"
              onKeyDown={e => { if (e.key === 'Enter' && email.trim()) send() }} />
            <button style={b(true, { padding:'7px 14px' })} onClick={send} disabled={busy || !email.trim()}>Wyślij</button>
          </div>

          <div style={{ fontSize:12, color:T.muted2, margin:'16px 0 6px' }}>albo wyślij swój link: kto go otworzy i zaakceptuje, od razu zostanie Twoim znajomym</div>
          {token ? (
            <>
              <div style={{ display:'flex', gap:8, marginBottom:6 }}>
                <input readOnly value={inviteUrl(token)} onFocus={e => e.target.select()} style={{ ...inp, flex:1, fontSize:12, fontFamily:'monospace' }} />
                <button style={b(true, { padding:'6px 12px' })} onClick={copyInvite}>Kopiuj</button>
                {canShare && <button style={b(false, { padding:'6px 12px' })} onClick={shareInvite}>Wyślij…</button>}
              </div>
              {confirmReset ? (
                <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12 }}>
                  <span style={{ color:T.danger, flex:1 }}>Stary link przestanie działać. Obecni znajomi zostają.</span>
                  <button style={b(false, { padding:'4px 10px', fontSize:11, borderColor:T.danger, color:T.danger })} onClick={resetInvite} disabled={busy}>Zmień</button>
                  <button style={b(false, { padding:'4px 10px', fontSize:11 })} onClick={() => setConfirmReset(false)}>Anuluj</button>
                </div>
              ) : (
                <button style={b(false, { padding:'4px 10px', fontSize:11 })} onClick={() => setConfirmReset(true)}>nowy link</button>
              )}
            </>
          ) : <p style={{ fontSize:12, color:T.muted }}>Wczytywanie...</p>}
        </div>

        <div style={card}>
          <div style={lbl}>Masz link zaproszenia?</div>
          <div style={{ display:'flex', gap:8 }}>
            <input style={{ ...inp, flex:1 }} value={pasted} onChange={e => setPasted(e.target.value)}
              placeholder="Wklej link..." onKeyDown={e => { if (e.key === 'Enter') openPasted() }} />
            <button style={b(false, { padding:'7px 14px' })} onClick={openPasted} disabled={!pasted.trim()}>Otwórz</button>
          </div>
        </div>

        {data && data.outgoing.length > 0 && (
          <div style={card}>
            <div style={lbl}>Wysłane zaproszenia</div>
            {data.outgoing.map(r => (
              <div key={r.id} style={row}>
                <span style={{ flex:1, color:T.muted2, overflowWrap:'anywhere' }}>{r.email}</span>
                <button style={b(false, { padding:'4px 10px', fontSize:11 })} disabled={busy}
                  onClick={() => run(() => cancelFriendRequest(r.id), 'Zaproszenie wycofane.')}>wycofaj</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
