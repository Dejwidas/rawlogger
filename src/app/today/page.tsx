'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { parseSetStr, volOf, groupLabel } from '@/lib/parser'
import type { TrainingSet } from '@/lib/types'
import Nav from '@/components/Nav'

const T = { bg:'#0e0e0e',surface:'#181818',surface2:'#222',border:'#2a2a2a',border2:'#383838',text:'#e8e8e8',muted:'#555',muted2:'#888',accent:'#c8f135',danger:'#ff4444' }
const card: React.CSSProperties = { background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:'14px 16px', marginBottom:10 }
const inp: React.CSSProperties = { width:'100%', background:T.surface2, border:`1px solid ${T.border2}`, borderRadius:7, padding:'8px 10px', fontSize:13, color:T.text, fontFamily:'monospace', outline:'none', boxSizing:'border-box' }
const lbl: React.CSSProperties = { fontSize:11, color:T.muted2, marginBottom:4, letterSpacing:'0.04em', textTransform:'uppercase' as const }
const b = (primary: boolean, extra: React.CSSProperties = {}): React.CSSProperties => ({ background:primary?T.accent:'transparent', color:primary?'#111':T.muted2, border:`1px solid ${primary?T.accent:T.border2}`, borderRadius:7, padding:'7px 16px', fontSize:12, cursor:'pointer', fontWeight:primary?600:400, fontFamily:'inherit', ...extra })

const todayStr = () => new Date().toISOString().slice(0,10)

export default function TodayPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [userId, setUserId] = useState('')
  const [sets, setSets] = useState<TrainingSet[]>([])
  const [exercises, setExercises] = useState<string[]>([])
  const [dayNote, setDayNote] = useState('')
  const [exName, setExName] = useState('')
  const [setStr, setSetStr] = useState('')
  const [acOpen, setAcOpen] = useState(false)
  const [parseErr, setParseErr] = useState('')
  const [editNoteIdx, setEditNoteIdx] = useState<string|null>(null)
  const [noteVal, setNoteVal] = useState('')
  const [saving, setSaving] = useState(false)
  const today = todayStr()

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      setEmail(session.user.email ?? '')
      setUserId(session.user.id)
      // load today's sets
      const { data: setsData } = await supabase.from('training_sets').select('*').eq('date', today).order('created_at')
      setSets(setsData ?? [])
      // load exercises
      const { data: exData } = await supabase.from('exercises').select('name').order('name')
      setExercises(exData?.map(e => e.name) ?? [])
      // load day note
      const { data: noteData } = await supabase.from('training_notes').select('note').eq('date', today).single()
      setDayNote(noteData?.note ?? '')
    })
  }, [])

  const parsed = setStr.trim() ? parseSetStr(setStr) : null
  const acMatches = exName.trim() ? exercises.filter(e => e.toLowerCase().includes(exName.toLowerCase())) : []

  async function handleAdd() {
    if (!exName.trim()) { setParseErr('Wpisz nazwę ćwiczenia'); return }
    if (!parsed) { setParseErr('Nieprawidłowy format. Przykład: 100x5x5 lub 80x8'); return }
    setParseErr(''); setSaving(true)
   for (const g of parsed.groups) {
  const row: any = {
    user_id: userId, exercise_name: exName.trim(), date: today,
    weight: g.type==='weighted' ? g.weight : null,
    reps_arr: g.type==='weighted' ? g.repsArr : g.type==='bw' ? [g.reps] : [],
    set_type: g.type,
    bw_reps: g.type==='bw' ? g.reps : null,
    timed_seconds: g.type==='timed' ? g.seconds : null,
    rest_note: parsed.rest, set_note: null
  }
  const { data, error } = await supabase.from('training_sets').insert(row).select().single()
  if (!error && data) setSets(prev => [...prev, data])
}
    await supabase.from('exercises').upsert({ user_id: userId, name: exName.trim() }, { onConflict: 'user_id,name' })
    if (!exercises.includes(exName.trim())) setExercises(prev => [...prev, exName.trim()].sort())
    setSetStr(''); setExName(''); setSaving(false)
  }

  async function removeSet(id: string) {
    await supabase.from('training_sets').delete().eq('id', id)
    setSets(prev => prev.filter(s => s.id !== id))
  }

  async function saveSetNote(id: string, note: string) {
    await supabase.from('training_sets').update({ set_note: note }).eq('id', id)
    setSets(prev => prev.map(s => s.id === id ? { ...s, set_note: note } : s))
    setEditNoteIdx(null)
  }

  const saveDayNote = useCallback(async (val: string) => {
    setDayNote(val)
    await supabase.from('training_notes').upsert({ user_id: userId, date: today, note: val, updated_at: new Date().toISOString() }, { onConflict: 'user_id,date' })
  }, [userId, today])

  const d = new Date()
  const dateLabel = d.toLocaleDateString('pl-PL', { weekday:'long', year:'numeric', month:'long', day:'numeric' })

  // group by exercise
  const grouped: Record<string, TrainingSet[]> = {}
  sets.forEach(s => { if (!grouped[s.exercise_name]) grouped[s.exercise_name] = []; grouped[s.exercise_name].push(s) })

  const tag: React.CSSProperties = { display:'inline-block', background:T.surface2, border:`1px solid ${T.border}`, borderRadius:4, padding:'1px 7px', margin:'2px', fontSize:11, color:T.muted2, fontFamily:'monospace' }

  return (
    <div style={{ background:T.bg, minHeight:'100vh', color:T.text }}>
      <Nav email={email} />
      <div style={{ maxWidth:720, margin:'0 auto', padding:'0 0.5rem 2rem' }}>
        {/* input */}
        <div style={card}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <span style={{ fontSize:13, color:T.muted2 }}>{dateLabel}</span>
            {Object.keys(grouped).length > 0 && (
  <span style={{ fontSize:11, padding:'2px 8px', background:T.surface2, borderRadius:99, color:T.muted, border:`1px solid ${T.border}` }}>
    {Object.keys(grouped).length} {Object.keys(grouped).length === 1 ? 'ćwiczenie' : Object.keys(grouped).length < 5 ? 'ćwiczenia' : 'ćwiczeń'}
  </span>
)}
          </div>
          <div style={lbl}>Ćwiczenie</div>
          <div style={{ position:'relative', marginBottom:10, marginTop:4 }}>
            <input style={inp} value={exName} onChange={e=>{setExName(e.target.value);setAcOpen(true);setParseErr('')}}
              placeholder="np. Wyciskanie sztangi" autoComplete="off"
              onKeyDown={e=>{if(e.key==='Escape')setAcOpen(false);if(e.key==='Enter')document.getElementById('rl-setstr')?.focus()}} />
            {acOpen && acMatches.length > 0 && (
              <div style={{ position:'absolute', top:'100%', left:0, right:0, background:T.surface, border:`1px solid ${T.border2}`, borderRadius:7, zIndex:10, maxHeight:150, overflowY:'auto' }}>
                {acMatches.map(m => (
                  <div key={m} onMouseDown={()=>{setExName(m);setAcOpen(false)}}
                    style={{ padding:'8px 10px', fontSize:13, cursor:'pointer', color:T.text, fontFamily:'monospace' }}
                    onMouseEnter={e=>(e.currentTarget.style.background=T.surface2)}
                    onMouseLeave={e=>(e.currentTarget.style.background='')}>{m}</div>
                ))}
              </div>
            )}
          </div>
          <div style={lbl}>Serie (np. 100x5x5x5 lub 80x8 lub 100x5 (90s))</div>
          <div style={{ display:'flex', gap:8, marginBottom:6, marginTop:4 }}>
            <input id="rl-setstr" style={{ ...inp, flex:1 }} value={setStr}
              onChange={e=>{setSetStr(e.target.value);setParseErr('')}}
              placeholder="100x5x5x5" onKeyDown={e=>e.key==='Enter'&&handleAdd()} />
            <button style={b(true)} onClick={handleAdd} disabled={saving}>{saving?'...':'Dodaj'}</button>
          </div>
          {parseErr && <p style={{ fontSize:11, color:T.danger, margin:'4px 0 6px' }}>{parseErr}</p>}
{parsed && setStr.trim() && (
  <div style={{ fontSize:11, lineHeight:1.9, marginTop:4 }}>
    {parsed.groups.map((g, i) => (
      <span key={i} style={tag}>{groupLabel(g)}</span>
    ))}
    {parsed.rest && <span style={tag}>przerwa: {parsed.rest}</span>}
    {parsed.groups.some(g => g.type === 'weighted') && (
      <span style={{ ...tag, color:T.accent, borderColor:T.accent+'44' }}>
        obj: {parsed.groups.filter(g => g.type === 'weighted').reduce((a, g) => a + volOf((g as any).weight, (g as any).repsArr), 0)} kg
      </span>
    )}
  </div>
)}
        </div>

        {/* executed sets */}
        {Object.entries(grouped).map(([exN, items]) => {
          const vol = items.some(s => s.set_type==='weighted')
  ? items.filter(s=>s.set_type==='weighted').reduce((a,s)=>a+volOf(s.weight??0,s.reps_arr),0) + ' kg'
  : items.some(s => s.set_type==='timed')
  ? items.reduce((a,s)=>a+(s.timed_seconds?.reduce((b,t)=>b+t,0)??0),0) + 's'
  : items.reduce((a,s)=>a+(s.reps_arr?.[0]??0),0) + ' powt.'
          return (
            <div key={exN} style={card}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:10 }}>{exN}</div>
              {items.map(item => (
                <div key={item.id} style={{ marginBottom:8 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, fontFamily:'monospace' }}>
                    <span style={{ color:T.accent }}>{item.weight} kg</span>
                    <span style={{ color:T.muted2 }}>×</span>
                    <span>{item.reps_arr.join(' · ')} powt.</span>
                    {item.rest_note && <span style={{ fontSize:11, padding:'1px 7px', background:T.surface2, borderRadius:99, color:T.muted, border:`1px solid ${T.border}` }}>({item.rest_note})</span>}
                    <button onClick={()=>{setEditNoteIdx(editNoteIdx===item.id?null:item.id);setNoteVal(item.set_note||'')}}
                      style={{ marginLeft:4, background:'none', border:`1px solid ${item.set_note?T.accent+'66':T.border}`, borderRadius:5, padding:'1px 7px', fontSize:10, cursor:'pointer', color:item.set_note?T.accent:T.muted, fontFamily:'inherit' }}>
                      {item.set_note?'✎ notatka':'+ notatka'}
                    </button>
                    <button onClick={()=>removeSet(item.id)}
                      style={{ marginLeft:'auto', background:'none', border:`1px solid ${T.border}`, borderRadius:5, padding:'1px 8px', fontSize:10, cursor:'pointer', color:T.muted, fontFamily:'inherit' }}>usuń</button>
                  </div>
                  {item.set_note && editNoteIdx !== item.id && (
                    <div style={{ fontSize:11, color:T.muted2, marginTop:3, paddingLeft:2, fontStyle:'italic' }}>{item.set_note}</div>
                  )}
                  {editNoteIdx === item.id && (
                    <div style={{ marginTop:6, display:'flex', gap:6 }}>
                      <input style={{ ...inp, flex:1, fontSize:12 }} value={noteVal} onChange={e=>setNoteVal(e.target.value)}
                        placeholder="np. ból łokcia, lekko poszło..." autoFocus
                        onKeyDown={e=>{if(e.key==='Enter')saveSetNote(item.id,noteVal);if(e.key==='Escape')setEditNoteIdx(null)}} />
                      <button style={b(true,{padding:'4px 12px',fontSize:11})} onClick={()=>saveSetNote(item.id,noteVal)}>OK</button>
                    </div>
                  )}
                </div>
              ))}
              <div style={{ fontSize:11, color:T.muted, marginTop:6, borderTop:`1px solid ${T.border}`, paddingTop:6 }}>
  objętość:{' '}
  <span style={{ color:T.accent }}>
    {items.some(s => s.set_type==='weighted')
      ? items.filter(s=>s.set_type==='weighted').reduce((a,s)=>a+volOf(s.weight ?? 0,s.reps_arr),0) + ' kg'
      : items.some(s => s.set_type==='timed')
      ? items.reduce((a,s)=>a+(s.timed_seconds?.reduce((b:number,t:number)=>b+t,0)??0),0) + 's'
      : items.reduce((a,s)=>a+(s.reps_arr?.[0]??0),0) + ' powt.'}
  </span>
</div>
            </div>
          )
        })}

        {/* day note */}
        <div style={card}>
          <div style={lbl}>Notatka do treningu</div>
          <textarea value={dayNote} onChange={e=>saveDayNote(e.target.value)}
            placeholder="Ogólne uwagi..."
            style={{ ...inp, minHeight:65, resize:'vertical', lineHeight:1.6, marginTop:4 }} />
        </div>
      </div>
    </div>
  )
}