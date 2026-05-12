'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

const T = { bg:'#0e0e0e',surface:'#181818',surface2:'#222',border:'#2a2a2a',border2:'#383838',text:'#e8e8e8',muted:'#555',muted2:'#888',accent:'#c8f135' }
const card: React.CSSProperties = { background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:'14px 16px', marginBottom:10 }
const MONTHS = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień']
const DAYS = ['Pon','Wt','Śr','Czw','Pt','Sob','Nd']
const fmtDate = (s: string) => { const [y,m,d]=s.split('-'); return `${d}.${m}.${y}` }
const todayStr = () => new Date().toISOString().slice(0,10)



function exVol(items: any[]): string {
  if (items.some(s => s.set_type === 'weighted'))
    return items.filter(s => s.set_type==='weighted')
      .reduce((a,s) => a + (s.weight??0) * (s.reps_arr?.reduce((b:number,r:number)=>b+r,0)??0), 0) + ' kg'
  if (items.some(s => s.set_type === 'timed'))
    return items.reduce((a,s) => a + (s.timed_seconds?.reduce((b:number,t:number)=>b+t,0)??0), 0) + 's'
  return items.reduce((a,s) => a + (s.bw_reps ?? s.reps_arr?.[0] ?? 0), 0) + ' powt.'
}

function setLabel(item: any): string {
  if (item.set_type === 'weighted')
    return `${item.weight} kg × ${item.reps_arr?.join(' · ')} powt.`
  if (item.set_type === 'timed')
    return item.timed_seconds?.map((s: number) => s+'s').join(' · ') ?? ''
  if (item.set_type === 'wt')
    return `${item.weight} kg × ${item.wt_seconds}s`
  return (item.bw_reps ?? item.reps_arr?.[0]) + ' powt.'
}

function CalendarContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [yr, setYr] = useState(new Date().getFullYear())
  const [mo, setMo] = useState(new Date().getMonth())
  const [daysWithData, setDaysWithData] = useState<Set<string>>(new Set())
  const [sel, setSel] = useState<string|null>(null)
  const [selSets, setSelSets] = useState<any[]>([])
  const [selNote, setSelNote] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      setEmail(session.user.email ?? '')
    })
  }, [])

  useEffect(() => {
    const from = `${yr}-${String(mo+1).padStart(2,'0')}-01`
    const to   = `${yr}-${String(mo+1).padStart(2,'0')}-${new Date(yr,mo+1,0).getDate()}`
    supabase.from('training_sets').select('date').gte('date',from).lte('date',to)
      .then(({ data }) => setDaysWithData(new Set(data?.map((r: any) => r.date) ?? [])))
  }, [yr, mo])
  
 useEffect(() => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session) { router.replace('/login'); return }
    setEmail(session.user.email ?? '')
    
    const day = searchParams.get('day')
    if (day) {
      const d = new Date(day + 'T12:00:00')
      setYr(d.getFullYear())
      setMo(d.getMonth())
      selectDay(day)
    }
  })
}, [])

  async function selectDay(ds: string) {
    if (sel === ds) { setSel(null); return }
    setSel(ds)
    const { data: s } = await supabase.from('training_sets').select('*').eq('date', ds).order('created_at')
    setSelSets(s ?? [])
    const { data: n } = await supabase.from('training_notes').select('note').eq('date', ds).single()
    setSelNote(n?.note ?? '')
  }

  function changeMonth(d: number) {
    let nm=mo+d, ny=yr
    if (nm>11) { nm=0; ny++ }
    if (nm<0)  { nm=11; ny-- }
    setMo(nm); setYr(ny); setSel(null)
  }

  const startDow = (new Date(yr,mo,1).getDay()+6)%7
  const dim = new Date(yr,mo+1,0).getDate()
  const today = todayStr()

  const grouped: Record<string,any[]> = {}
  selSets.forEach(s => {
    if (!grouped[s.exercise_name]) grouped[s.exercise_name] = []
    grouped[s.exercise_name].push(s)
  })

  const b = (primary: boolean): React.CSSProperties => ({
    background: primary ? T.accent : 'transparent',
    color: primary ? '#111' : T.muted2,
    border: `1px solid ${primary ? T.accent : T.border2}`,
    borderRadius: 7, padding: '5px 14px', fontSize: 12, cursor: 'pointer',
    fontFamily: 'inherit', fontWeight: primary ? 600 : 400,
  })

  return (
    <div style={{ background:T.bg, minHeight:'100vh', color:T.text }}>
      <Nav email={email} />
      <div style={{ maxWidth:720, margin:'0 auto', padding:'0 0.5rem 2rem' }}>
        <div style={card}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <button style={b(false)} onClick={() => changeMonth(-1)}>←</button>
            <span style={{ fontSize:13, fontWeight:600 }}>{MONTHS[mo]} {yr}</span>
            <button style={b(false)} onClick={() => changeMonth(1)}>→</button>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:3, marginBottom:3 }}>
            {DAYS.map(d => (
              <div key={d} style={{ fontSize:10, color:T.muted, textAlign:'center', padding:'3px 0' }}>{d}</div>
            ))}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:3 }}>
            {Array.from({ length: startDow }).map((_, i) => <div key={'e'+i} />)}
            {Array.from({ length: dim }).map((_, i) => {
              const d = i+1
              const ds = `${yr}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
              const has = daysWithData.has(ds)
              const isToday = ds === today
              const isSel = ds === sel
              return (
                <div key={d} onClick={() => selectDay(ds)} style={{
                  aspectRatio:'1', display:'flex', flexDirection:'column', alignItems:'center',
                  justifyContent:'center', fontSize:12, borderRadius:6, cursor:'pointer', position:'relative',
                  background: isSel ? T.accent : has ? T.surface2 : 'transparent',
                  color: isSel ? '#111' : T.text,
                  border: isToday && !isSel ? `1px solid ${T.accent}55` : '1px solid transparent',
                  fontWeight: has ? 600 : 400,
                }}>
                  {d}
                  {has && !isSel && (
                    <div style={{ position:'absolute', bottom:3, width:3, height:3, borderRadius:'50%', background:T.accent }} />
                  )}
                </div>
              )
            })}
          </div>

          {sel && (
            <div style={{ marginTop:16, paddingTop:14, borderTop:`1px solid ${T.border}` }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <span style={{ fontSize:13, fontWeight:600, color:T.accent }}>{fmtDate(sel)}</span>
                <button style={b(true)} onClick={() => router.push(`/day/${sel}`)}>
                  {selSets.length > 0 ? '✎ edytuj trening' : '+ dodaj trening'}
                </button>
              </div>

              {selSets.length > 0 ? (
                Object.entries(grouped).map(([exN, items]) => (
                  <div key={exN} style={{ marginBottom:12 }}>
                    <div style={{ fontSize:12, fontWeight:600, marginBottom:4 }}>{exN}</div>
                    {items.map((item, i) => (
                      <div key={i}>
                        <div style={{ fontSize:12, color:T.muted2, fontFamily:'monospace', marginBottom:2 }}>
                          {setLabel(item)}{item.rest_note ? ` (${item.rest_note})` : ''}
                        </div>
                        {item.set_note && (
                          <div style={{ fontSize:11, color:T.muted, fontStyle:'italic', marginBottom:4 }}>{item.set_note}</div>
                        )}
                      </div>
                    ))}
                    <div style={{ fontSize:11, color:T.muted, marginTop:4, paddingTop:4, borderTop:`1px solid ${T.border}` }}>
                      objętość: <span style={{ color:T.accent }}>{exVol(items)}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p style={{ fontSize:12, color:T.muted }}>Brak treningu w tym dniu.</p>
              )}

              {selNote && (
                <div style={{ fontSize:12, color:T.muted, marginTop:8, whiteSpace:'pre-wrap', fontStyle:'italic' }}>{selNote}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CalendarPage() {
  return (
    <Suspense fallback={<div style={{ background:'#0e0e0e', minHeight:'100vh' }} />}>
      <CalendarContent />
    </Suspense>
  )
}