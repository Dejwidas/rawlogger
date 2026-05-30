'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const T = { bg:'#0e0e0e',surface2:'#222',border2:'#383838',text:'#e8e8e8',muted:'#555',muted2:'#888',accent:'#c8f135',danger:'#ff4444' }
const inp: React.CSSProperties = { width:'100%', background:T.surface2, border:`1px solid ${T.border2}`, borderRadius:7, padding:'8px 10px', fontSize:13, color:T.text, fontFamily:'monospace', outline:'none', boxSizing:'border-box', marginBottom:10 }
const b = (primary: boolean): React.CSSProperties => ({ background:primary?T.accent:'transparent', color:primary?'#111':T.muted2, border:`1px solid ${primary?T.accent:T.border2}`, borderRadius:7, padding:'8px 0', fontSize:12, cursor:'pointer', fontWeight:primary?600:400, flex:1 })

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode]     = useState<'login'|'reg'|'reset'>('login')
  const [email, setEmail]   = useState('')
  const [pass, setPass]     = useState('')
  const [pass2, setPass2]   = useState('')
  const [err, setErr]       = useState('')
  const [loading, setLoading] = useState(false)
  const [terms, setTerms]   = useState(false)
  const [resetMsg, setResetMsg] = useState('')

  function switchMode(m: 'login'|'reg'|'reset') {
    setMode(m); setErr(''); setResetMsg('')
  }

  async function submit() {
    setErr(''); setLoading(true)
    try {
      if (mode === 'reg') {
        if (!terms) { setErr('Zaakceptuj regulamin i politykę prywatności'); return }
        if (pass !== pass2) { setErr('Hasła się różnią'); return }
        if (pass.length < 6) { setErr('Hasło min. 6 znaków'); return }
        const { error } = await supabase.auth.signUp({ email, password: pass })
        if (error) { setErr(error.message); return }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pass })
        if (error) { setErr('Błędny email lub hasło'); return }
      }
      router.replace('/today')
    } finally { setLoading(false) }
  }

  async function resetPassword() {
    if (!email) { setErr('Wpisz adres email'); return }
    setErr(''); setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://rawlogger.pl/reset-password'
      })
      if (error) { setErr(error.message); return }
      setResetMsg('Link do zmiany hasła został wysłany na podany adres email.')
    } finally { setLoading(false) }
  }

  return (
    <div style={{ maxWidth:300, margin:'3rem auto', padding:'0 1rem' }}>
      <img src="/logo.png" alt="logo" style={{ width:'100%', marginBottom:12 }} />
      <p style={{ fontSize:12, color:T.muted, marginBottom:24 }}>prosty dziennik treningowy</p>

      {/* reset mode */}
      {mode === 'reset' ? (
        <div>
          <div style={{ fontSize:11, color:T.muted2, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.04em' }}>Email</div>
          <input style={inp} type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="adres@email.com" onKeyDown={e => e.key==='Enter' && resetPassword()} />
          {err && <p style={{ fontSize:12, color:T.danger, marginBottom:10 }}>{err}</p>}
          {resetMsg && <p style={{ fontSize:12, color:T.accent, marginBottom:10, lineHeight:1.6 }}>{resetMsg}</p>}
          <div style={{ display:'flex', gap:8 }}>
            <button style={b(true)} onClick={resetPassword} disabled={loading}>{loading?'...':'Wyślij link'}</button>
            <button style={b(false)} onClick={() => switchMode('login')}>Wróć</button>
          </div>
        </div>
      ) : (
        /* login / reg mode */
        <div>
          <div style={{ fontSize:11, color:T.muted2, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.04em' }}>Email</div>
          <input style={inp} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="adres@email.com" />
          <div style={{ fontSize:11, color:T.muted2, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.04em' }}>Hasło</div>
          <input style={inp} type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==='Enter'&&submit()} />
          {mode === 'reg' && <>
            <div style={{ fontSize:11, color:T.muted2, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.04em' }}>Powtórz hasło</div>
            <input style={inp} type="password" value={pass2} onChange={e=>setPass2(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==='Enter'&&submit()} />
            <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:14 }}>
              <input type="checkbox" id="terms" checked={terms} onChange={e => setTerms(e.target.checked)}
                style={{ marginTop:2, accentColor:T.accent, cursor:'pointer' }} />
              <label htmlFor="terms" style={{ fontSize:12, color:T.muted2, lineHeight:1.6, cursor:'pointer' }}>
                Akceptuję{' '}
                <a href="/terms" target="_blank" style={{ color:T.accent }}>Regulamin</a>
                {' '}oraz{' '}
                <a href="/privacy" target="_blank" style={{ color:T.accent }}>Politykę Prywatności</a>
              </label>
            </div>
          </>}
          {err && <p style={{ fontSize:12, color:T.danger, marginBottom:10 }}>{err}</p>}
          <div style={{ display:'flex', gap:8, marginTop:4 }}>
            <button style={b(true)} onClick={submit} disabled={loading}>
              {loading ? '...' : mode==='login' ? 'Zaloguj' : 'Utwórz konto'}
            </button>
            <button style={b(false)} onClick={() => switchMode(mode==='login'?'reg':'login')}>
              {mode==='login' ? 'Rejestracja' : 'Wróć'}
            </button>
          </div>
          {mode === 'login' && (
            <div style={{ textAlign:'center', marginTop:10 }}>
              <button onClick={() => switchMode('reset')}
                style={{ background:'none', border:'none', cursor:'pointer', fontSize:11, color:T.muted2, fontFamily:'inherit' }}>
                Zapomniałem hasła
              </button>
            </div>
          )}
        </div>
      )}

      <p style={{ fontSize:10, color:T.muted, marginTop:32, textAlign:'center', letterSpacing:'0.05em' }}>v0.41 · kontakt@rawlogger.pl</p>
    </div>
  )
}