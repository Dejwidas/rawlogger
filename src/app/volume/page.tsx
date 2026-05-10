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

export default function VolumePage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [exercises, setExercises] = useState<string[]>([])
  const [q, setQ] = useState('')
  const [acOpen, setAcOpen] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [result, setResult] = useState<{total:number,setCount:number,sessions:number}|null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      setEmail(session.user.email ?? '')
      const { data } = await supabase.from('exercises').select('name').order('name')
      setExercises(data?.map(e=>e.name) ?? [])
    })
  }, [])

  async function calc() {
    if (!q.trim()) return
    let query = supabase.from('training_sets').select('weight, reps_arr, date').ilike('exercise_name', q.trim())
    if (from) query = query.gte('date', from)
    if (to)   query = query.lte('date', to)
    const { data } = await query
    if (!data) return
    const sessions = new Set(data.map(r=>r.date)).size
    const setCount = data.reduce((a,r)=>a+(r.reps_arr?.length??0),0)
    const total = data.reduce((a,r)=>a+volOf(r.weight, r.reps_arr??[]),0)
    setResult({ total, setCount, sessions })
  }

  const acMatches = q.trim() ? exercises.filter(e=>e.toLowerCase().includes(q.toLowerCase())) : []
  const b = (primary: boolean): React.CSSProperties => ({ background:primary?T.accent:'transparent', color:primary?'#111':T.muted2, border:`1px solid ${primary?T.accent:T.border2}`, borderRadius:7, padding:'7px 16px', fontSize:12, cursor:'pointer', fontFamily:'inherit', fontWeight:primary?600:400 })

  return (
    <div style={{ background:T.bg, minHeight:'100vh', color:T.text }}>
      <Nav email={email} />
      <div style={{ maxWidth:720, margin:'0 auto', padding:'0 0.5rem 2rem' }}>
        <div style={card}>
          <div style={lbl}>Suma objętości ćwiczenia</div>
          <div style={{ position:'relative', marginBottom:10, marginTop:4 }}>
            <input style={inp} value={q} onChange={e=>{setQ(e.target.value);setAcOpen(true)}}
              placeholder="Wpisz nazwę..." autoComplete="off"
              onKeyDown={e=>e.key==='Escape'&&setAcOpen(false)} />
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
          <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' }}>
            <input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={{ ...inp, flex:1 }}/>
            <input type="date" value={to}   onChange={e=>setTo(e.target.value)}   style={{ ...inp, flex:1 }}/>
          </div>
          <button style={b(true)} onClick={calc}>Oblicz</button>
          {result && (
            <div style={{ marginTop:16, paddingTop:14, borderTop:`1px solid ${T.border}` }}>
              <div style={{ fontSize:28, fontWeight:700, color:T.accent, fontFamily:'monospace' }}>{result.total.toLocaleString('pl-PL')} kg</div>
              <div style={{ fontSize:11, color:T.muted, marginTop:6 }}>{result.setCount} serii · {result.sessions} sesji</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}