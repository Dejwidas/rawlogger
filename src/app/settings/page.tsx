'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'
import { useUser } from '@/lib/UserContext'


const T = { bg:'#0e0e0e',surface:'#181818',surface2:'#222',border:'#2a2a2a',border2:'#383838',text:'#e8e8e8',muted:'#555',muted2:'#888',accent:'#c8f135',danger:'#ff4444' }
const card: React.CSSProperties = { background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:'14px 16px', marginBottom:10 }
const inp: React.CSSProperties = { width:'100%', background:T.surface2, border:`1px solid ${T.border2}`, borderRadius:7, padding:'8px 10px', fontSize:13, color:T.text, fontFamily:'monospace', outline:'none', boxSizing:'border-box' }
const lbl: React.CSSProperties = { fontSize:11, color:T.muted2, marginBottom:4, letterSpacing:'0.04em', textTransform:'uppercase' as const }
const b = (primary: boolean, extra: React.CSSProperties = {}): React.CSSProperties => ({ background:primary?T.accent:'transparent', color:primary?'#111':T.muted2, border:`1px solid ${primary?T.accent:T.border2}`, borderRadius:7, padding:'7px 16px', fontSize:12, cursor:'pointer', fontWeight:primary?600:400, fontFamily:'inherit', ...extra })

interface WeightEntry { id: string; weight: number; date: string }

const fmtDate = (s: string) => { const [y,m,d]=s.split('-'); return `${d}.${m}.${y}` }

export default function SettingsPage() {
  const router = useRouter()
  const [nickSaved, setNickSaved] = useState(false)
  const [newPass, setNewPass]     = useState('')
  const [newPass2, setNewPass2]   = useState('')
  const [passMsg, setPassMsg]     = useState('')
  const [weightVal, setWeightVal] = useState('')
  const [weightDate, setWeightDate] = useState(new Date().toISOString().slice(0,10))
  const [weights, setWeights]     = useState<WeightEntry[]>([])
  const [confirmDel, setConfirmDel] = useState(false)
  const [delEmail, setDelEmail]   = useState('')
  const [delErr, setDelErr]       = useState('')
  const {email, nickname: initNick, userId, reload } = useUser()
  const [nickname, setNickname] = useState(initNick)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      // load profile
      const { data: profile } = await supabase.from('user_profiles').select('nickname').eq('id', session.user.id).single()
      // load weight history
      const { data: w } = await supabase.from('body_weight').select('*').order('date', { ascending: false })
      setWeights(w ?? [])
    })
  }, [])

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

  async function addWeight() {
    if (!weightVal) return
    const w = parseFloat(weightVal.replace(',', '.'))
    if (isNaN(w)) return
    const { data, error } = await supabase.from('body_weight').upsert(
      { user_id: userId, weight: w, date: weightDate },
      { onConflict: 'user_id,date' }
    ).select().single()
    if (!error && data) {
      setWeights(prev => {
        const filtered = prev.filter(e => e.date !== data.date)
        return [data, ...filtered].sort((a,b) => b.date.localeCompare(a.date))
      })
      setWeightVal('')
    }
  }

  async function deleteWeight(id: string) {
    await supabase.from('body_weight').delete().eq('id', id)
    setWeights(prev => prev.filter(e => e.id !== id))
  }

  async function deleteAccount() {
    if (delEmail !== email) { setDelErr('Podany email nie zgadza się'); return }
    // delete all user data
    await supabase.from('training_sets').delete().eq('user_id', userId)
    await supabase.from('training_notes').delete().eq('user_id', userId)
    await supabase.from('exercises').delete().eq('user_id', userId)
    await supabase.from('favorite_exercises').delete().eq('user_id', userId)
    await supabase.from('training_plans').delete().eq('user_id', userId)
    await supabase.from('body_weight').delete().eq('user_id', userId)
    await supabase.from('user_profiles').delete().eq('id', userId)
    await supabase.auth.signOut()
    router.replace('/login')
  }

  async function logout() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  // simple weight chart
  const chartWeights = [...weights].sort((a,b) => a.date.localeCompare(b.date)).slice(-12)
  const minW = chartWeights.length ? Math.min(...chartWeights.map(w=>w.weight)) - 2 : 0
  const maxW = chartWeights.length ? Math.max(...chartWeights.map(w=>w.weight)) + 2 : 100
  const range = maxW - minW || 1

  return (
    <div style={{ background:T.bg, minHeight:'100vh', color:T.text }}>
      <Nav />
      <div style={{ maxWidth:720, margin:'0 auto', padding:'0 0.5rem 2rem' }}>

        {/* nick */}
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

        {/* password */}
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

        {/* body weight */}
        <div style={card}>
          <div style={{ fontSize:11, color:T.muted2, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:12 }}>Masa ciała</div>

          <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
            <input type="date" value={weightDate} onChange={e => setWeightDate(e.target.value)}
              style={{ ...inp, flex:'0 0 140px' }} />
            <input style={{ ...inp, flex:1 }} value={weightVal} onChange={e => setWeightVal(e.target.value)}
              placeholder="kg (np. 82.5)" onKeyDown={e => e.key==='Enter' && addWeight()} />
            <button style={b(true, { padding:'7px 14px' })} onClick={addWeight}>Dodaj</button>
          </div>

          {/* chart */}
          {chartWeights.length > 1 && (
            <div style={{ marginBottom:16, background:T.surface2, borderRadius:8, padding:'12px 8px' }}>
              <svg width="100%" height="80" viewBox={`0 0 ${chartWeights.length * 40} 80`} preserveAspectRatio="none">
                <polyline
                  points={chartWeights.map((w,i) => `${i*40+20},${70 - ((w.weight-minW)/range)*60}`).join(' ')}
                  fill="none" stroke={T.accent} strokeWidth="2" />
                {chartWeights.map((w,i) => (
                  <g key={w.id}>
                    <circle cx={i*40+20} cy={70-((w.weight-minW)/range)*60} r="3" fill={T.accent} />
                    <text x={i*40+20} y={78} textAnchor="middle" fontSize="8" fill={T.muted}>{w.weight}</text>
                  </g>
                ))}
              </svg>
            </div>
          )}

          {/* weight list */}
          {weights.length === 0 && <p style={{ fontSize:12, color:T.muted }}>Brak wpisów.</p>}
          {weights.slice(0,10).map(w => (
            <div key={w.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 0', borderBottom:`1px solid ${T.border}`, fontSize:12 }}>
              <span style={{ color:T.muted2, fontFamily:'monospace' }}>{fmtDate(w.date)}</span>
              <span style={{ color:T.accent, fontWeight:600, fontFamily:'monospace' }}>{w.weight} kg</span>
              <button onClick={() => deleteWeight(w.id)}
                style={{ background:'none', border:`1px solid ${T.border}`, borderRadius:5, padding:'1px 8px', fontSize:10, cursor:'pointer', color:T.muted, fontFamily:'inherit' }}>usuń</button>
            </div>
          ))}
        </div>

        {/* logout */}
        <div style={card}>
          <div style={{ fontSize:11, color:T.muted2, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:12 }}>Sesja</div>
          <button style={b(false)} onClick={logout}>Wyloguj się</button>
        </div>

        {/* delete account */}
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

      </div>
    </div>
  )
}