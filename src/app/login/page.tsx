'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const T = { bg:'#0e0e0e',surface:'#181818',surface2:'#222',border:'#2a2a2a',border2:'#383838',text:'#e8e8e8',muted:'#555',muted2:'#888',accent:'#c8f135',danger:'#ff4444' }
const inp: React.CSSProperties = { width:'100%', background:T.surface2, border:`1px solid ${T.border2}`, borderRadius:7, padding:'8px 10px', fontSize:13, color:T.text, fontFamily:'monospace', outline:'none', boxSizing:'border-box', marginBottom:10 }
const b = (primary: boolean): React.CSSProperties => ({ background:primary?T.accent:'transparent', color:primary?'#111':T.muted2, border:`1px solid ${primary?T.accent:T.border2}`, borderRadius:7, padding:'8px 0', fontSize:12, cursor:'pointer', fontWeight:primary?600:400, flex:1 })

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'login'|'reg'>('login')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit() {
    setErr(''); setLoading(true)
    try {
      if (mode === 'reg') {
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

  return (
    <div style={{ maxWidth:300, margin:'3rem auto', padding:'0 1rem' }}>
      <p style={{ fontSize:22, fontWeight:700, letterSpacing:'-0.04em', color:T.accent, marginBottom:4 }}>rawlogger</p>
      <p style={{ fontSize:12, color:T.muted, marginBottom:24 }}>surowy dziennik treningowy</p>
      <div style={{ fontSize:11, color:T.muted2, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.04em' }}>Email</div>
      <input style={inp} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="adres@email.com" />
      <div style={{ fontSize:11, color:T.muted2, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.04em' }}>Hasło</div>
      <input style={inp} type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==='Enter'&&submit()} />
      {mode==='reg' && <>
        <div style={{ fontSize:11, color:T.muted2, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.04em' }}>Powtórz hasło</div>
        <input style={inp} type="password" value={pass2} onChange={e=>setPass2(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==='Enter'&&submit()} />
      </>}
      {err && <p style={{ fontSize:12, color:T.danger, marginBottom:10 }}>{err}</p>}
      <div style={{ display:'flex', gap:8, marginTop:4 }}>
        <button style={b(true)} onClick={submit} disabled={loading}>{loading?'...':(mode==='login'?'Zaloguj':'Utwórz konto')}</button>
        <button style={b(false)} onClick={()=>{setMode(mode==='login'?'reg':'login');setErr('')}}>{mode==='login'?'Rejestracja':'Wróć'}</button>
      </div>
    </div>
  )
}