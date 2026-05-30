'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const T = { bg:'#0e0e0e',surface2:'#222',border2:'#383838',text:'#e8e8e8',muted:'#555',muted2:'#888',accent:'#c8f135',danger:'#ff4444' }
const inp: React.CSSProperties = { width:'100%', background:T.surface2, border:`1px solid ${T.border2}`, borderRadius:7, padding:'8px 10px', fontSize:13, color:T.text, fontFamily:'monospace', outline:'none', boxSizing:'border-box', marginBottom:10 }
const b = (primary: boolean): React.CSSProperties => ({ background:primary?T.accent:'transparent', color:primary?'#111':T.muted2, border:`1px solid ${primary?T.accent:T.border2}`, borderRadius:7, padding:'8px 0', fontSize:12, cursor:'pointer', fontWeight:primary?600:400, flex:1 })

export default function ResetPasswordPage() {
  const router = useRouter()
  const [pass, setPass]   = useState('')
  const [pass2, setPass2] = useState('')
  const [err, setErr]     = useState('')
  const [msg, setMsg]     = useState('')
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Supabase wysyła token w hash URL — nasłuchuj zmiany sesji
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleReset() {
    if (!pass) { setErr('Wpisz nowe hasło'); return }
    if (pass.length < 6) { setErr('Hasło min. 6 znaków'); return }
    if (pass !== pass2) { setErr('Hasła się różnią'); return }
    setErr(''); setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: pass })
      if (error) { setErr('Błąd: ' + error.message); return }
      await supabase.auth.signOut()
      setMsg('Hasło zostało zmienione. Możesz się teraz zalogować.')
      setTimeout(() => router.replace('/login'), 3000)
    } finally { setLoading(false) }
  }

  return (
    <div style={{ maxWidth:300, margin:'3rem auto', padding:'0 1rem' }}>
      <img src="/logo.png" alt="logo" style={{ width:'100%', marginBottom:12 }} />
      <p style={{ fontSize:12, color:T.muted, marginBottom:24 }}>prosty dziennik treningowy</p>

      {msg ? (
        <div>
          <p style={{ fontSize:13, color:T.accent, lineHeight:1.7, marginBottom:16 }}>{msg}</p>
          <p style={{ fontSize:12, color:T.muted }}>Przekierowanie do logowania...</p>
        </div>
      ) : !ready ? (
        <div>
          <p style={{ fontSize:13, color:T.muted2, lineHeight:1.7, marginBottom:16 }}>
            Weryfikowanie linku resetującego...
          </p>
          <p style={{ fontSize:12, color:T.muted }}>
            Jeśli ta strona nie reaguje, wróć do{' '}
            <a href="/login" style={{ color:T.accent }}>strony logowania</a>{' '}
            i spróbuj ponownie.
          </p>
        </div>
      ) : (
        <div>
          <p style={{ fontSize:13, color:T.muted2, marginBottom:20 }}>Ustaw nowe hasło</p>
          <div style={{ fontSize:11, color:T.muted2, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.04em' }}>Nowe hasło</div>
          <input style={inp} type="password" value={pass} onChange={e => setPass(e.target.value)}
            placeholder="min. 6 znaków" />
          <div style={{ fontSize:11, color:T.muted2, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.04em' }}>Powtórz hasło</div>
          <input style={inp} type="password" value={pass2} onChange={e => setPass2(e.target.value)}
            placeholder="••••••••" onKeyDown={e => e.key==='Enter' && handleReset()} />
          {err && <p style={{ fontSize:12, color:T.danger, marginBottom:10 }}>{err}</p>}
          <div style={{ display:'flex', gap:8, marginTop:4 }}>
            <button style={b(true)} onClick={handleReset} disabled={loading}>
              {loading ? '...' : 'Zmień hasło'}
            </button>
            <button style={b(false)} onClick={() => router.replace('/login')}>Anuluj</button>
          </div>
        </div>
      )}

      <p style={{ fontSize:10, color:T.muted, marginTop:32, textAlign:'center', letterSpacing:'0.05em' }}>
        v0.41 · kontakt@rawlogger.pl
      </p>
    </div>
  )
}
