'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'
import { useUser } from '@/lib/UserContext'

const T = { bg:'#0e0e0e',surface:'#181818',surface2:'#222',border:'#2a2a2a',border2:'#383838',text:'#e8e8e8',muted:'#555',muted2:'#888',accent:'#c8f135',danger:'#ff4444' }
const card: React.CSSProperties = { background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:'14px 16px', marginBottom:10 }
const inp: React.CSSProperties = { width:'100%', background:T.surface2, border:`1px solid ${T.border2}`, borderRadius:7, padding:'8px 10px', fontSize:13, color:T.text, fontFamily:'monospace', outline:'none', boxSizing:'border-box' }
const lbl: React.CSSProperties = { fontSize:11, color:T.muted2, marginBottom:4, letterSpacing:'0.04em', textTransform:'uppercase' as const }
const b = (primary: boolean, extra: React.CSSProperties = {}): React.CSSProperties => ({ background:primary?T.accent:'transparent', color:primary?'#111':T.muted2, border:`1px solid ${primary?T.accent:T.border2}`, borderRadius:7, padding:'7px 16px', fontSize:12, cursor:'pointer', fontWeight:primary?600:400, fontFamily:'inherit', ...extra })

export default function SettingsPage() {
  const router = useRouter()
  const { email, nickname: initNick, userId, reload } = useUser()
  const [nickname, setNickname]   = useState(initNick)
  const [nickSaved, setNickSaved] = useState(false)
  const [newPass, setNewPass]     = useState('')
  const [newPass2, setNewPass2]   = useState('')
  const [passMsg, setPassMsg]     = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  const [delEmail, setDelEmail]   = useState('')
  const [delErr, setDelErr]       = useState('')

  async function saveNickname() {
    await supabase.from('user_profiles').upsert({ id: userId, nickname: nickname.trim(), updated_at: new Date().toISOString() })
    reload()
    setNickSaved(true)
    setTimeout(() => setNickSaved(false), 2000)
  }

  async function changePassword() {
    setPassMsg('')
    if (!newPass) { setPassMsg('Wpisz nowe hasło'); return }
    if (newPass.length < 6) { setPassMsg('Hasło min. 6 znaków'); return }
    if (newPass !== newPass2) { setPassMsg('Hasła się różnią'); return }
    const { error } = await supabase.auth.updateUser({ password: newPass })
    if (error) { setPassMsg('Błąd: ' + error.message); return }
    setPassMsg('Hasło zmienione ✓')
    setNewPass(''); setNewPass2('')
  }

  async function deleteAccount() {
    if (delEmail !== email) { setDelErr('Podany email nie zgadza się'); return }
    await supabase.from('training_sets').delete().eq('user_id', userId)
    await supabase.from('training_notes').delete().eq('user_id', userId)
    await supabase.from('exercises').delete().eq('user_id', userId)
    await supabase.from('favorite_exercises').delete().eq('user_id', userId)
    await supabase.from('training_plans').delete().eq('user_id', userId)
    await supabase.from('plan_exercises').delete().eq('plan_id', userId)
    await supabase.from('body_weight').delete().eq('user_id', userId)
    await supabase.from('user_profiles').delete().eq('id', userId)
    await supabase.auth.signOut()
    router.replace('/login')
  }

  async function logout() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <div style={{ background:T.bg, minHeight:'100vh', color:T.text }}>
      <Nav />
      <div style={{ maxWidth:720, margin:'0 auto', padding:'0 0.5rem 2rem' }}>

        {/* profil */}
        <div style={card}>
          <div style={{ fontSize:11, color:T.muted2, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:12 }}>Profil</div>
          <div style={lbl}>Adres email</div>
          <p style={{ fontSize:13, color:T.muted2, fontFamily:'monospace', marginBottom:12 }}>{email}</p>
          <div style={lbl}>Nick (wyświetlany zamiast emaila)</div>
          <div style={{ display:'flex', gap:8, marginTop:4 }}>
            <input style={{ ...inp, flex:1 }} value={nickname} onChange={e => setNickname(e.target.value)}
              placeholder="np. Dawid, Atlas, Terminator..."
              onKeyDown={e => e.key==='Enter' && saveNickname()} />
            <button style={b(true, { padding:'7px 14px' })} onClick={saveNickname}>
              {nickSaved ? '✓' : 'Zapisz'}
            </button>
          </div>
        </div>

        {/* hasło */}
        <div style={card}>
          <div style={{ fontSize:11, color:T.muted2, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:12 }}>Zmiana hasła</div>
          <div style={lbl}>Nowe hasło</div>
          <input style={{ ...inp, marginBottom:10, marginTop:4 }} type="password" value={newPass}
            onChange={e => setNewPass(e.target.value)} placeholder="min. 6 znaków" />
          <div style={lbl}>Powtórz nowe hasło</div>
          <input style={{ ...inp, marginBottom:10, marginTop:4 }} type="password" value={newPass2}
            onChange={e => setNewPass2(e.target.value)} placeholder="••••••••"
            onKeyDown={e => e.key==='Enter' && changePassword()} />
          {passMsg && <p style={{ fontSize:12, color: passMsg.includes('✓') ? T.accent : T.danger, marginBottom:8 }}>{passMsg}</p>}
          <button style={b(false)} onClick={changePassword}>Zmień hasło</button>
        </div>

        {/* sesja */}
        <div style={card}>
          <div style={{ fontSize:11, color:T.muted2, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:12 }}>Sesja</div>
          <button style={b(false)} onClick={logout}>Wyloguj się</button>
        </div>

        {/* usuń konto */}
        <div style={{ ...card, border:`1px solid ${T.danger}33` }}>
          <div style={{ fontSize:11, color:T.danger, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:12 }}>Strefa niebezpieczna</div>
          {!confirmDel ? (
            <button style={b(false, { borderColor:T.danger, color:T.danger })} onClick={() => setConfirmDel(true)}>
              Usuń konto
            </button>
          ) : (
            <div>
              <p style={{ fontSize:12, color:T.muted2, marginBottom:10, lineHeight:1.6 }}>
                Ta operacja jest nieodwracalna. Zostaną usunięte wszystkie Twoje dane treningowe.<br/>
                Wpisz swój adres email aby potwierdzić:
              </p>
              <input style={{ ...inp, marginBottom:8 }} value={delEmail} onChange={e => setDelEmail(e.target.value)}
                placeholder={email} />
              {delErr && <p style={{ fontSize:12, color:T.danger, marginBottom:8 }}>{delErr}</p>}
              <div style={{ display:'flex', gap:8 }}>
                <button style={b(false, { borderColor:T.danger, color:T.danger })} onClick={deleteAccount}>
                  Potwierdzam — usuń konto
                </button>
                <button style={b(false)} onClick={() => { setConfirmDel(false); setDelEmail(''); setDelErr('') }}>
                  Anuluj
                </button>
              </div>
            </div>
          )}
        </div>

        {/* dokumenty */}
        <div style={card}>
          <div style={{ fontSize:11, color:T.muted2, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:12 }}>Dokumenty</div>
          <div style={{ display:'flex', gap:12 }}>
            <a href="/terms" target="_blank" style={{ fontSize:13, color:T.accent, textDecoration:'none' }}>Regulamin</a>
            <a href="/privacy" target="_blank" style={{ fontSize:13, color:T.accent, textDecoration:'none' }}>Polityka prywatności</a>
          </div>
        </div>

      </div>
    </div>
  )
}