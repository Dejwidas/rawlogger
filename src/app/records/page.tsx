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
  const [exercises, setExercises] = useState<string[]>([])
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [acOpen, setAcOpen] = useState(false)
  const [results, setResults] = useState<any[]|null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      setEmail(session.user.email ?? '')
      const { data } = await supabase.from('exercises').select('name').order('name')
      setExercises(data?.map(e=>e.name) ?? [])
    })
  }, [])

  async function search() {
    let query = supabase.from('training_sets').select('*').order('weight', { ascending:false }).limit(5)
    if (q.trim()) query = query.ilike('exercise_name', q.trim())
    if (from) query = query.gte('date', from)
    if (to)   query = query.lte('date', to)
    const { data } = await query
    setResults(data ?? [])
  }

  const acMatches = q.trim() ? exercises.filter(e=>e.toLowerCase().includes(q.toLowerCase())) : []
  const b = (primary: boolean): React.CSSProperties => ({ background:primary?T.accent:'transparent', color:primary?'#111':T.muted2, border:`1px solid ${primary?T.accent:T.border2}`, borderRadius:7, padding:'7px 16px', fontSize:12, cursor:'pointer', fontFamily:'inherit', fontWeight:primary?600:400 })

  return (
    <div style={{ background:T.bg, minHeight:'100vh', color:T.text }}>
      <Nav email={email} />
      <div style={{ maxWidth:720, margin:'0 auto', padding:'0 0.5rem 2rem' }}>
        <div style={card}>
          <div style={{ fontSize:11, color:T.muted2, marginBottom:12, textTransform:'uppercase', letterSpacing:'0.04em' }}>Rekordy</div>
          <div style={lbl}>Ćwiczenie (opcjonalnie)</div>
          <div style={{ position:'relative', marginBottom:10, marginTop:4 }}>
            <input style={inp} value={q} onChange={e=>{setQ(e.target.value);setAcOpen(true)}}
              placeholder="Wszystkie lub wpisz nazwę..." autoComplete="off"
              onKeyDown={e=>{if(e.key==='Enter')search();if(e.key==='Escape')setAcOpen(false)}} />
            {acOpen && acMatches.length > 0 && (
              <div style={{ position:'absolute', top:'100%', left:0, right:0, background:T.surface, border:`1px solid ${T.border2}`, borderRadius:7, zIndex:10, maxHeight:140, overflowY:'auto' }}>
                {acMatches.map(m=>(
                  <div key={m} onMouseDown={()=>{setQ(m);setAcOpen(false)}}
                    style={{ padding:'8px 10px', fontSize:12, cursor:'pointer', color:T.text, fontFamily:'monospace' }}
                    onMouseEnter={e=>(e.currentTarget.style.background=T.surface2)}
                    onMouseLeave={e=>(e.currentTarget.style.background='')}>{m}</div>
                ))}
              </div>
            )}
          </div>
          <div style={lbl}>Zakres dat (opcjonalnie)</div>
          <div style={{ display:'flex', gap:8, marginBottom:14, marginTop:4, flexWrap:'wrap' }}>
            <input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={{ ...inp, flex:1 }}/>
            <input type="date" value={to}   onChange={e=>setTo(e.target.value)}   style={{ ...inp, flex:1 }}/>
          </div>
          <button style={{ ...b(true), marginBottom:16 }} onClick={search}>Szukaj</button>

          {results !== null && results.length === 0 && <p style={{ fontSize:12, color:T.muted }}>Brak danych.</p>}
          {results && results.length > 0 && (
            <>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:T.muted, marginBottom:6, paddingBottom:6, borderBottom:`1px solid ${T.border}` }}>
                <span>MIEJSCE · ĆWICZENIE</span><span>CIĘŻAR</span>
              </div>
              {results.map((r,i)=>(
                <div key={r.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 0', borderBottom:`1px solid ${T.border}`, fontSize:12 }}>
                  <div style={{ display:'flex', alignItems:'baseline', gap:10 }}>
                    <span style={{ fontSize:13, fontWeight:700, color:i===0?T.accent:T.muted, fontFamily:'monospace', minWidth:18 }}>#{i+1}</span>
                    <div>
                      <span style={{ color:T.text }}>{r.exercise_name}</span>
                      <span style={{ display:'block', fontSize:10, color:T.muted, marginTop:2, fontFamily:'monospace' }}>{fmtDate(r.date)} · ×{r.reps_arr?.join('·')} powt.</span>
                    </div>
                  </div>
                  <span style={{ color:i===0?T.accent:T.text, fontWeight:700, fontSize:15, fontFamily:'monospace' }}>{r.weight} kg</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}