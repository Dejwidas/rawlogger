'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { volOf } from '@/lib/parser'
import Nav from '@/components/Nav'

const T = { bg:'#0e0e0e',surface:'#181818',surface2:'#222',border:'#2a2a2a',border2:'#383838',text:'#e8e8e8',muted:'#555',muted2:'#888',accent:'#c8f135' }
const card: React.CSSProperties = { background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:'14px 16px', marginBottom:10 }
const inp: React.CSSProperties = { width:'100%', background:T.surface2, border:`1px solid ${T.border2}`, borderRadius:7, padding:'8px 10px', fontSize:13, color:T.text, fontFamily:'monospace', outline:'none', boxSizing:'border-box' }
const lbl: React.CSSProperties = { fontSize:11, color:T.muted2, marginBottom:4, letterSpacing:'0.04em', textTransform:'uppercase' as const }
const fmtDate = (s: string) => { const [y,m,d]=s.split('-'); return `${d}.${m}.${y}` }

type Tool = 'records' | 'volume' | 'weight' | null

export default function ToolsPage() {
  const router = useRouter()
  const [exercises, setExercises] = useState<string[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const [activeTool, setActiveTool] = useState<Tool>(null)

  // records
  const [recQ, setRecQ]           = useState('')
  const [recFrom, setRecFrom]     = useState('')
  const [recTo, setRecTo]         = useState('')
  const [recAcOpen, setRecAcOpen] = useState(false)
  const [recResults, setRecResults] = useState<any[]|null>(null)
  const [showFavOnly, setShowFavOnly] = useState(false)

  // volume
  const [volQ, setVolQ]           = useState('')
  const [volFrom, setVolFrom]     = useState('')
  const [volTo, setVolTo]         = useState('')
  const [volAcOpen, setVolAcOpen] = useState(false)
  const [volResult, setVolResult] = useState<{total:number,setCount:number,sessions:number}|null>(null)

  // weight
  const [bodyWeights, setBodyWeights] = useState<{id:string,weight:number,date:string}[]>([])
  const [weightVal, setWeightVal]     = useState('')
  const [weightDate, setWeightDate]   = useState(new Date().toISOString().slice(0,10))

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      const { data: exData } = await supabase.from('exercises').select('name').order('name')
      setExercises(exData?.map((e: any) => e.name) ?? [])
      const { data: favData } = await supabase.from('favorite_exercises').select('exercise_name').order('exercise_name')
      const favs = favData?.map((f: any) => f.exercise_name) ?? []
      setFavorites(favs)
      const { data: bwData } = await supabase.from('body_weight').select('*').order('date', { ascending: true })
      setBodyWeights(bwData ?? [])
      if (favs.length > 0) await loadFavoriteRecords(favs)
      setActiveTool('records')
    })
  }, [])

  async function loadFavoriteRecords(favs: string[]) {
    const all: any[] = []
    const seenIds = new Set<string>()
    for (const fav of favs) {
      const { data } = await supabase.from('training_sets').select('*')
        .ilike('exercise_name', fav).order('weight', { ascending:false }).limit(1)
      if (data && data.length > 0 && !seenIds.has(data[0].id)) {
        seenIds.add(data[0].id)
        all.push(data[0])
      }
    }
    all.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    setRecResults(all)
  }

  async function searchRecords() {
    if (showFavOnly && favorites.length > 0) {
      const all: any[] = []
      const seenIds = new Set<string>()
      for (const fav of favorites) {
        let q = supabase.from('training_sets').select('*').ilike('exercise_name', fav).order('weight', { ascending:false }).limit(1)
        if (recFrom) q = q.gte('date', recFrom)
        if (recTo)   q = q.lte('date', recTo)
        const { data } = await q
        if (data && data.length > 0 && !seenIds.has(data[0].id)) {
          seenIds.add(data[0].id)
          all.push(data[0])
        }
      }
      all.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
      setRecResults(all)
      return
    }
    let query = supabase.from('training_sets').select('*').order('weight', { ascending:false }).limit(5)
    if (recQ.trim()) query = query.ilike('exercise_name', recQ.trim())
    if (recFrom) query = query.gte('date', recFrom)
    if (recTo)   query = query.lte('date', recTo)
    const { data } = await query
    setRecResults(data ?? [])
  }

  async function calcVolume() {
    if (!volQ.trim()) return
    let query = supabase.from('training_sets')
      .select('weight, reps_arr, set_type, bw_reps, timed_seconds, wt_seconds, date')
      .ilike('exercise_name', volQ.trim())
    if (volFrom) query = query.gte('date', volFrom)
    if (volTo)   query = query.lte('date', volTo)
    const { data } = await query
    if (!data) return
    const sessions = new Set(data.map((r: any) => r.date)).size
    let total = 0
    const setCount = data.length
    data.forEach((r: any) => {
      if (r.set_type === 'weighted') total += volOf(r.weight ?? 0, r.reps_arr ?? [])
      else if (r.set_type === 'timed') total += r.timed_seconds?.reduce((a: number, t: number) => a+t, 0) ?? 0
      else if (r.set_type === 'wt') total += (r.weight ?? 0) * (r.wt_seconds ?? 0)
      else total += r.bw_reps ?? 0
    })
    setVolResult({ total, setCount, sessions })
  }

  async function addWeight() {
    if (!weightVal) return
    const w = parseFloat(weightVal.replace(',', '.'))
    if (isNaN(w)) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data, error } = await supabase.from('body_weight').upsert(
      { user_id: session.user.id, weight: w, date: weightDate },
      { onConflict: 'user_id,date' }
    ).select().single()
    if (!error && data) {
      setBodyWeights(prev => {
        const filtered = prev.filter(e => e.date !== data.date)
        return [...filtered, data].sort((a,b) => a.date.localeCompare(b.date))
      })
      setWeightVal('')
    }
  }

  async function deleteWeight(id: string) {
    await supabase.from('body_weight').delete().eq('id', id)
    setBodyWeights(prev => prev.filter(e => e.id !== id))
  }

  const recAcMatches = recQ.trim() ? exercises.filter(e => e.toLowerCase().includes(recQ.toLowerCase())) : []
  const volAcMatches = volQ.trim() ? exercises.filter(e => e.toLowerCase().includes(volQ.toLowerCase())) : []

  const b = (primary: boolean, extra: React.CSSProperties = {}): React.CSSProperties => ({
    background: primary ? T.accent : 'transparent', color: primary ? '#111' : T.muted2,
    border: `1px solid ${primary ? T.accent : T.border2}`, borderRadius:7, padding:'7px 16px',
    fontSize:12, cursor:'pointer', fontFamily:'inherit', fontWeight: primary ? 600 : 400, ...extra
  })

  // weight chart helpers
  const chartWeights = bodyWeights.slice(-20)
  const minW = chartWeights.length ? Math.min(...chartWeights.map(w=>w.weight)) - 1 : 0
  const maxW = chartWeights.length ? Math.max(...chartWeights.map(w=>w.weight)) + 1 : 100
  const range = maxW - minW || 1
  const CW = 600, CH = 160, pad = 32
  const cx = (i: number) => pad + (i / Math.max(chartWeights.length-1,1)) * (CW - pad*2)
  const cy = (w: number) => CH - pad - ((w - minW) / range) * (CH - pad*2)

  return (
    <div style={{ background:T.bg, minHeight:'100vh', color:T.text }}>
      <Nav />
      <div style={{ maxWidth:720, margin:'0 auto', padding:'0 0.5rem 2rem' }}>

        {/* tool selector */}
        <div style={card}>
          <div style={{ fontSize:11, color:T.muted2, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:12 }}>Narzędzia</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <button style={{ ...b(activeTool==='records'), flex:1 }} onClick={() => setActiveTool(activeTool==='records'?null:'records')}>
              Moje rekordy
            </button>
            <button style={{ ...b(activeTool==='volume'), flex:1 }} onClick={() => setActiveTool(activeTool==='volume'?null:'volume')}>
              Kalkulator objętości
            </button>
            <button style={{ ...b(activeTool==='weight'), flex:1 }} onClick={() => setActiveTool(activeTool==='weight'?null:'weight')}>
              Masa ciała
            </button>
          </div>
        </div>

        {/* records */}
        {activeTool === 'records' && (
          <div style={card}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <div style={{ fontSize:11, color:T.muted2, textTransform:'uppercase', letterSpacing:'0.04em' }}>Moje rekordy</div>
              <button style={b(showFavOnly, { padding:'4px 12px', fontSize:11, borderRadius:99 })}
                onClick={() => { setShowFavOnly(!showFavOnly); setRecResults(null) }}>
                ★ ulubione
              </button>
            </div>
            <div style={lbl}>Ćwiczenie (opcjonalnie)</div>
            <div style={{ position:'relative', marginBottom:10, marginTop:4 }}>
              <input style={inp} value={recQ} onChange={e => { setRecQ(e.target.value); setRecAcOpen(true) }}
                placeholder="Wszystkie lub wpisz nazwę..." autoComplete="off"
                onKeyDown={e => { if(e.key==='Enter') searchRecords(); if(e.key==='Escape') setRecAcOpen(false) }} />
              {recAcOpen && recAcMatches.length > 0 && (
                <div style={{ position:'absolute', top:'100%', left:0, right:0, background:T.surface, border:`1px solid ${T.border2}`, borderRadius:7, zIndex:10, maxHeight:140, overflowY:'auto' }}>
                  {recAcMatches.map(m => (
                    <div key={m} onMouseDown={() => { setRecQ(m); setRecAcOpen(false) }}
                      style={{ padding:'8px 10px', fontSize:12, cursor:'pointer', color:T.text, fontFamily:'monospace' }}
                      onMouseEnter={e => (e.currentTarget.style.background = T.surface2)}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>{m}</div>
                  ))}
                </div>
              )}
            </div>
            <div style={lbl}>Zakres dat (opcjonalnie)</div>
            <div style={{ display:'flex', gap:8, marginBottom:14, marginTop:4, flexWrap:'wrap' }}>
              <input type="date" value={recFrom} onChange={e => setRecFrom(e.target.value)} style={{ ...inp, flex:1 }} />
              <input type="date" value={recTo}   onChange={e => setRecTo(e.target.value)}   style={{ ...inp, flex:1 }} />
            </div>
            <button style={{ ...b(true), marginBottom:16 }} onClick={searchRecords}>Szukaj</button>
            {recResults !== null && recResults.length === 0 && <p style={{ fontSize:12, color:T.muted }}>Brak danych.</p>}
            {recResults && recResults.length > 0 && (
              <>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:T.muted, marginBottom:6, paddingBottom:6, borderBottom:`1px solid ${T.border}` }}>
                  <span>MIEJSCE · ĆWICZENIE</span><span>CIĘŻAR</span>
                </div>
                {recResults.map((r, i) => (
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
          </div>
        )}

        {/* volume */}
        {activeTool === 'volume' && (
          <div style={card}>
            <div style={{ fontSize:11, color:T.muted2, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:12 }}>Kalkulator objętości</div>
            <div style={lbl}>Ćwiczenie</div>
            <div style={{ position:'relative', marginBottom:10, marginTop:4 }}>
              <input style={inp} value={volQ} onChange={e => { setVolQ(e.target.value); setVolAcOpen(true) }}
                placeholder="Wpisz nazwę..." autoComplete="off"
                onKeyDown={e => e.key==='Escape' && setVolAcOpen(false)} />
              {volAcOpen && volAcMatches.length > 0 && (
                <div style={{ position:'absolute', top:'100%', left:0, right:0, background:T.surface, border:`1px solid ${T.border2}`, borderRadius:7, zIndex:10, maxHeight:140, overflowY:'auto' }}>
                  {volAcMatches.map(m => (
                    <div key={m} onMouseDown={() => { setVolQ(m); setVolAcOpen(false) }}
                      style={{ padding:'8px 10px', fontSize:12, cursor:'pointer', color:T.text, fontFamily:'monospace' }}
                      onMouseEnter={e => (e.currentTarget.style.background = T.surface2)}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>{m}</div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' }}>
              <input type="date" value={volFrom} onChange={e => setVolFrom(e.target.value)} style={{ ...inp, flex:1 }} />
              <input type="date" value={volTo}   onChange={e => setVolTo(e.target.value)}   style={{ ...inp, flex:1 }} />
            </div>
            <button style={b(true)} onClick={calcVolume}>Oblicz</button>
            {volResult && (
              <div style={{ marginTop:16, paddingTop:14, borderTop:`1px solid ${T.border}` }}>
                <div style={{ fontSize:28, fontWeight:700, color:T.accent, fontFamily:'monospace' }}>
                  {volResult.total.toLocaleString('pl-PL')}
                </div>
                <div style={{ fontSize:11, color:T.muted, marginTop:6 }}>
                  {volResult.setCount} serii · {volResult.sessions} sesji
                </div>
              </div>
            )}
          </div>
        )}

        {/* weight */}
        {activeTool === 'weight' && (
          <div style={card}>
            <div style={{ fontSize:11, color:T.muted2, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:12 }}>Masa ciała</div>

            {/* add entry */}
            <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
              <input type="date" value={weightDate} onChange={e => setWeightDate(e.target.value)}
                style={{ ...inp, flex:'0 0 140px' }} />
              <input style={{ ...inp, flex:1 }} value={weightVal} onChange={e => setWeightVal(e.target.value)}
                placeholder="kg (np. 82.5)" onKeyDown={e => e.key==='Enter' && addWeight()} />
              <button style={b(true, { padding:'7px 14px' })} onClick={addWeight}>Dodaj</button>
            </div>

            {/* chart */}
            {chartWeights.length >= 2 && (
              <div style={{ marginBottom:16, background:T.surface2, borderRadius:8, padding:'12px 8px' }}>
                <svg width="100%" viewBox={`0 0 ${CW} ${CH}`} style={{ display:'block' }}>
                  {[0,0.25,0.5,0.75,1].map(t => {
                    const yw = CH - pad - t*(CH-pad*2)
                    const wv = minW + t*range
                    return (
                      <g key={t}>
                        <line x1={pad} y1={yw} x2={CW-pad} y2={yw} stroke="#2a2a2a" strokeWidth="1"/>
                        <text x={pad-4} y={yw+4} textAnchor="end" fontSize="9" fill="#555">{wv.toFixed(1)}</text>
                      </g>
                    )
                  })}
                  <polyline points={chartWeights.map((w,i)=>`${cx(i)},${cy(w.weight)}`).join(' ')}
                    fill="none" stroke={T.accent} strokeWidth="2"/>
                  {chartWeights.map((w,i) => (
                    <g key={w.id}>
                      <circle cx={cx(i)} cy={cy(w.weight)} r="3" fill={T.accent}/>
                      <text x={cx(i)} y={CH-4} textAnchor="middle" fontSize="8" fill="#555">
                        {w.date.slice(5).replace('-','.')}
                      </text>
                    </g>
                  ))}
                </svg>
              </div>
            )}
            {chartWeights.length < 2 && (
              <p style={{ fontSize:12, color:T.muted, marginBottom:12 }}>Dodaj co najmniej 2 wpisy aby zobaczyć wykres.</p>
            )}

            {/* stats */}
            {bodyWeights.length > 0 && (
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:T.muted2, marginBottom:12, flexWrap:'wrap', gap:8 }}>
                <span>Ostatni: <span style={{ color:T.accent }}>{bodyWeights[bodyWeights.length-1].weight} kg</span></span>
                <span>Wpisów: {bodyWeights.length}</span>
                {bodyWeights.length >= 2 && (
                  <span>Zmiana: <span style={{ color: bodyWeights[bodyWeights.length-1].weight >= bodyWeights[0].weight ? '#ff4444' : T.accent }}>
                    {(bodyWeights[bodyWeights.length-1].weight - bodyWeights[0].weight).toFixed(1)} kg
                  </span></span>
                )}
              </div>
            )}

            {/* list */}
            {bodyWeights.length === 0 && <p style={{ fontSize:12, color:T.muted }}>Brak wpisów.</p>}
            {[...bodyWeights].reverse().slice(0,10).map(w => (
              <div key={w.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 0', borderBottom:`1px solid ${T.border}`, fontSize:12 }}>
                <span style={{ color:T.muted2, fontFamily:'monospace' }}>{fmtDate(w.date)}</span>
                <span style={{ color:T.accent, fontWeight:600, fontFamily:'monospace' }}>{w.weight} kg</span>
                <button onClick={() => deleteWeight(w.id)}
                  style={{ background:'none', border:`1px solid ${T.border}`, borderRadius:5, padding:'1px 8px', fontSize:10, cursor:'pointer', color:T.muted, fontFamily:'inherit' }}>usuń</button>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}