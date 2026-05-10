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

export default function FilterPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [exercises, setExercises] = useState<string[]>([])
  const [q, setQ] = useState('')
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

  async function doFilter() {
    if (!q.trim()) return
    const { data } = await supabase.from('training_sets').select('date, weight, reps_arr')
      .ilike('exercise_name', q.trim()).order('date', { ascending:false })
    // group by date
    const byDate: Record<string,any[]> = {}
    data?.forEach(s => { if(!byDate[s.date])byDate[s.date]=[]; byDate[s.date].push(s) })
    setResults(Object.entries(byDate).map(([date,sets])=>({date,sets})))
  }

  const acMatches = q.trim() ? exercises.filter(e=>e.toLowerCase().includes(q.toLowerCase())) : []
  const b = (primary: boolean): React.CSSProperties => ({ background:primary?T.accent:'transparent', color:primary?'#111':T.muted2, border:`1px solid ${primary?T.accent:T.border2}`, borderRadius:7, padding:'7px 16px', fontSize:12, cursor:'pointer', fontFamily:'inherit', fontWeight:primary?600:400 })

  return (
    <div style={{ background:T.bg, minHeight:'100vh', color:T.text }}>
      <Nav email={email} />
      <div style={{ maxWidth:720, margin:'0 auto', padding:'0 0.5rem 2rem' }}>
        <div style={card}>
          <div style={lbl}>Filtruj po ćwiczeniu</div>
          <div style={{ position:'relative', marginBottom:10, marginTop:4 }}>
            <input style={inp} value={q} onChange={e=>{setQ(e.target.value);setAcOpen(true)}}
              placeholder="Wpisz nazwę..." autoComplete="off"
              onKeyDown={e=>{if(e.key==='Enter')doFilter();if(e.key==='Escape')setAcOpen(false)}} />
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
          <button style={{ ...b(true), marginBottom:14 }} onClick={doFilter}>Szukaj</button>
          {results!==null && results.length===0 && <p style={{ fontSize:12, color:T.muted }}>Brak wyników.</p>}
          {results?.map(({date,sets})=>(
            <div key={date} style={{ padding:'8px 0', borderBottom:`1px solid ${T.border}`, fontSize:12 }}>
              <span style={{ color:T.accent, fontFamily:'monospace' }}>{fmtDate(date)}</span>
              <span style={{ color:T.muted2 }}> — </span>
              <span style={{ color:T.muted2, fontFamily:'monospace' }}>{sets.map((s:any)=>`${s.weight}kg×${s.reps_arr?.join('·')}`).join('  ')}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}