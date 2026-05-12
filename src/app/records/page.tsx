'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'

const T = { bg:'#0e0e0e',surface:'#181818',surface2:'#222',border:'#2a2a2a',border2:'#383838',text:'#e8e8e8',muted:'#555',muted2:'#888',accent:'#c8f135' }
const card: React.CSSProperties = { background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:'14px 16px', marginBottom:10 }
const inp: React.CSSProperties = { width:'100%', background:T.surface2, border:`1px solid ${T.border2}`, borderRadius:7, padding:'8px 10px', fontSize:13, color:T.text, fontFamily:'monospace', outline:'none', boxSizing:'border-box' }
const lbl: React.CSSProperties = { fontSize:11, color:T.muted2, marginBottom:4, letterSpacing:'0.04em', textTransform:'uppercase' as const }
const fmtDate = (s: string) => { const [y,m,d]=s.split('-'); return `${d}.${m}.${y}` }

export default function RecordsPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [userId, setUserId] = useState('')
  const [exercises, setExercises] = useState<string[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [acOpen, setAcOpen] = useState(false)
  const [results, setResults] = useState<any[]|null>(null)
  const [showManage, setShowManage] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      setEmail(session.user.email ?? '')
      setUserId(session.user.id)
      const { data: exData } = await supabase.from('exercises').select('name').order('name')
      setExercises(exData?.map((e: any) => e.name) ?? [])
      const { data: favData } = await supabase.from('favorite_exercises').select('exercise_name').order('exercise_name')
      const favs = favData?.map((f: any) => f.exercise_name) ?? []
      setFavorites(favs)
      // auto-load records for favorites
      if (favs.length > 0) await loadFavoriteRecords(favs)
    })
  }, [])

  async function loadFavoriteRecords(favs: string[]) {
    const allResults: any[] = []
    for (const fav of favs) {
      const { data } = await supabase.from('training_sets').select('*')
        .ilike('exercise_name', fav).order('weight', { ascending: false }).limit(1)
      if (data?.[0]) allResults.push(data[0])
    }
    allResults.sort((a, b) => b.weight - a.weight)
    setResults(allResults)
  }

  async function search() {
    let query = supabase.from('training_sets').select('*').order('weight', { ascending:false }).limit(5)
    if (q.trim()) query = query.ilike('exercise_name', q.trim())
    if (from) query = query.gte('date', from)
    if (to)   query = query.lte('date', to)
    const { data } = await query
    setResults(data ?? [])
  }

  async function toggleFavorite(name: string) {
    if (favorites.includes(name)) {
      await supabase.from('favorite_exercises').delete().eq('user_id', userId).eq('exercise_name', name)
      setFavorites(prev => prev.filter(f => f !== name))
    } else {
      await supabase.from('favorite_exercises').insert({ user_id: userId, exercise_name: name })
      setFavorites(prev => [...prev, name].sort())
    }
  }

  const acMatches = q.trim() ? exercises.filter(e => e.toLowerCase().includes(q.toLowerCase())) : []
  const b = (primary: boolean, extra: React.CSSProperties = {}): React.CSSProperties => ({
    background: primary ? T.accent : 'transparent', color: primary ? '#111' : T.muted2,
    border: `1px solid ${primary ? T.accent : T.border2}`, borderRadius:7, padding:'7px 16px',
    fontSize:12, cursor:'pointer', fontFamily:'inherit', fontWeight: primary ? 600 : 400, ...extra
  })

  return (
    <div style={{ background:T.bg, minHeight:'100vh', color:T.text }}>
      <Nav email={email} />
      <div style={{ maxWidth:720, margin:'0 auto', padding:'0 0.5rem 2rem' }}>

        {/* favorites strip */}
        {favorites.length > 0 && !showManage && (
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
            {favorites.map(f => (
              <button key={f} onClick={() => { setQ(f); search(); }}
                style={{ background:T.surface2, border:`1px solid ${T.border2}`, borderRadius:99, padding:'4px 12px', fontSize:11, cursor:'pointer', color:T.accent, fontFamily:'inherit' }}>
                ★ {f}
              </button>
            ))}
          </div>
        )}

        <div style={card}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div style={{ fontSize:11, color:T.muted2, textTransform:'uppercase', letterSpacing:'0.04em' }}>Rekordy</div>
            <button style={b(false, { padding:'4px 10px', fontSize:11 })} onClick={() => setShowManage(!showManage)}>
              {showManage ? '← wróć' : '★ ulubione'}
            </button>
          </div>

          {/* manage favorites */}
          {showManage ? (
            <div>
              <div style={lbl}>Zaznacz ulubione ćwiczenia</div>
              <div style={{ marginTop:6 }}>
                {exercises.map(ex => (
                  <div key={ex} onClick={() => toggleFavorite(ex)}
                    style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:`1px solid ${T.border}`, cursor:'pointer', fontSize:13 }}
                    onMouseEnter={e => (e.currentTarget.style.background = T.surface2)}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <span style={{ color: favorites.includes(ex) ? T.accent : T.text }}>{ex}</span>
                    <span style={{ fontSize:16, color: favorites.includes(ex) ? T.accent : T.muted }}>
                      {favorites.includes(ex) ? '★' : '☆'}
                    </span>
                  </div>
                ))}
                {exercises.length === 0 && <p style={{ fontSize:12, color:T.muted }}>Brak ćwiczeń w historii.</p>}
              </div>
            </div>
          ) : (
            <>
              <div style={lbl}>Ćwiczenie (opcjonalnie)</div>
              <div style={{ position:'relative', marginBottom:10, marginTop:4 }}>
                <input style={inp} value={q} onChange={e => { setQ(e.target.value); setAcOpen(true) }}
                  placeholder="Wszystkie lub wpisz nazwę..." autoComplete="off"
                  onKeyDown={e => { if (e.key==='Enter') search(); if (e.key==='Escape') setAcOpen(false) }} />
                {acOpen && acMatches.length > 0 && (
                  <div style={{ position:'absolute', top:'100%', left:0, right:0, background:T.surface, border:`1px solid ${T.border2}`, borderRadius:7, zIndex:10, maxHeight:140, overflowY:'auto' }}>
                    {acMatches.map(m => (
                      <div key={m} onMouseDown={() => { setQ(m); setAcOpen(false) }}
                        style={{ padding:'8px 10px', fontSize:12, cursor:'pointer', color:T.text, fontFamily:'monospace' }}
                        onMouseEnter={e => (e.currentTarget.style.background = T.surface2)}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}>{m}</div>
                    ))}
                  </div>
                )}
              </div>
              <div style={lbl}>Zakres dat (opcjonalnie)</div>
              <div style={{ display:'flex', gap:8, marginBottom:14, marginTop:4, flexWrap:'wrap' }}>
                <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ ...inp, flex:1 }} />
                <input type="date" value={to}   onChange={e => setTo(e.target.value)}   style={{ ...inp, flex:1 }} />
              </div>
              <button style={{ ...b(true), marginBottom:16 }} onClick={search}>Szukaj</button>

              {results !== null && results.length === 0 && <p style={{ fontSize:12, color:T.muted }}>Brak danych.</p>}
              {results && results.length > 0 && (
                <>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:T.muted, marginBottom:6, paddingBottom:6, borderBottom:`1px solid ${T.border}` }}>
                    <span>MIEJSCE · ĆWICZENIE</span><span>CIĘŻAR</span>
                  </div>
                  {results.map((r, i) => (
                    <div key={r.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 0', borderBottom:`1px solid ${T.border}`, fontSize:12 }}>
                      <div style={{ display:'flex', alignItems:'baseline', gap:10 }}>
                        <span style={{ fontSize:13, fontWeight:700, color:i===0?T.accent:T.muted, fontFamily:'monospace', minWidth:18 }}>#{i+1}</span>
                        <div>
                          <span style={{ color:T.text }}>{r.exercise_name}</span>
                          <span style={{ display:'block', fontSize:10, color:T.muted, marginTop:2, fontFamily:'monospace' }}>
                            {fmtDate(r.date)} · ×{r.reps_arr?.join('·')} powt.
                          </span>
                        </div>
                      </div>
                      <span style={{ color:i===0?T.accent:T.text, fontWeight:700, fontSize:15, fontFamily:'monospace' }}>{r.weight} kg</span>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}