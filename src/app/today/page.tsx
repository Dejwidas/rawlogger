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
const tag: React.CSSProperties = { display:'inline-block', background:'#222', border:'1px solid #2a2a2a', borderRadius:4, padding:'1px 7px', margin:'2px', fontSize:11, color:'#888', fontFamily:'monospace' }

const todayStr = () => new Date().toISOString().slice(0,10)

export default function TodayPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [userId, setUserId]     = useState('')
  const [sets, setSets]         = useState<TrainingSet[]>([])
  const [exercises, setExercises] = useState<string[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const [dayNote, setDayNote]   = useState('')
  const [dayTitle, setDayTitle] = useState('')
  const [exName, setExName]     = useState('')
  const [setStr, setSetStr]     = useState('')
  const [acOpen, setAcOpen]     = useState(false)
  const [parseErr, setParseErr] = useState('')
  const [saving, setSaving]     = useState(false)
  const [editId, setEditId]     = useState<string|null>(null)
  const [editVal, setEditVal]   = useState('')
  const today = todayStr()
  const [inlineEx, setInlineEx] = useState<string|null>(null)
  const [inlineVal, setInlineVal] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      setEmail(session.user.email ?? '')
      setUserId(session.user.id)
      const { data: setsData } = await supabase.from('training_sets').select('*').eq('date', today).order('created_at')
      setSets(setsData ?? [])
      const { data: exData } = await supabase.from('exercises').select('name').order('name')
      setExercises(exData?.map((e: any) => e.name) ?? [])
      const { data: noteData } = await supabase.from('training_notes').select('note, title').eq('date', today).single()
      setDayNote(noteData?.note ?? '')
      setDayTitle(noteData?.title ?? '')
      const { data: favData } = await supabase.from('favorite_exercises').select('exercise_name')
      setFavorites(favData?.map((f: any) => f.exercise_name) ?? [])
    })
  }, [])

  const parsed    = setStr.trim() ? parseSetStr(setStr) : null
  const acMatches = exName.trim() ? exercises.filter(e => e.toLowerCase().includes(exName.toLowerCase())) : []

  async function handleAdd() {
    if (!exName.trim()) { setParseErr('Wpisz nazwę ćwiczenia'); return }
    if (!parsed) { setParseErr('Nieprawidłowy format. Przykład: 100x5x5 lub 80x8'); return }
    setParseErr(''); setSaving(true)
    for (const g of parsed.groups) {
      const row: any = {
        user_id: userId,
        exercise_name: exName.trim().charAt(0).toUpperCase() + exName.trim().slice(1).toLowerCase(),
        date: today,
        weight: g.type==='weighted' ? g.weight : g.type==='wt' ? g.weight : null,
        reps_arr: g.type==='weighted' ? g.repsArr : g.type==='bw' ? [g.reps] : [],
        set_type: g.type,
        bw_reps: g.type==='bw' ? g.reps : null,
        timed_seconds: g.type==='timed' ? g.seconds : null,
        wt_seconds: g.type==='wt' ? g.seconds : null,
        rest_note: parsed.rest, set_note: null,
      }
      const { data, error } = await supabase.from('training_sets').insert(row).select().single()
      if (!error && data) setSets(prev => [...prev, data])
    }
    const normalized = exName.trim().charAt(0).toUpperCase() + exName.trim().slice(1).toLowerCase()
    const existing = exercises.find(e => e.toLowerCase() === normalized.toLowerCase())
    const finalName = existing || normalized
    if (!existing) {
      await supabase.from('exercises').insert({ user_id: userId, name: finalName })
      setExercises(prev => [...prev, finalName].sort())
    }
    setSetStr(''); setExName(''); setSaving(false)
  }

  async function handleEditSave(item: TrainingSet) {
    const p = parseSetStr(editVal)
    if (!p || p.groups.length !== 1) return
    const g = p.groups[0]
    const row: any = {
      weight: g.type==='weighted' ? g.weight : g.type==='wt' ? g.weight : null,
      reps_arr: g.type==='weighted' ? g.repsArr : g.type==='bw' ? [g.reps] : [],
      set_type: g.type,
      bw_reps: g.type==='bw' ? g.reps : null,
      timed_seconds: g.type==='timed' ? g.seconds : null,
      wt_seconds: g.type==='wt' ? g.seconds : null,
    }
    await supabase.from('training_sets').update(row).eq('id', item.id)
    setSets(prev => prev.map(s => s.id === item.id ? {...s, ...row} : s))
    setEditId(null)
  }

  async function removeSet(id: string) {
    await supabase.from('training_sets').delete().eq('id', id)
    setSets(prev => prev.filter(s => s.id !== id))
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
  
  async function handleInlineAdd(exName: string) {
  const p = parseSetStr(inlineVal)
  if (!p) return
  for (const g of p.groups) {
    const row: any = {
      user_id: userId,
      exercise_name: exName,
      date: today, // lub date w day/[date]
      weight: g.type==='weighted' ? g.weight : g.type==='wt' ? g.weight : null,
      reps_arr: g.type==='weighted' ? g.repsArr : g.type==='bw' ? [g.reps] : [],
      set_type: g.type,
      bw_reps: g.type==='bw' ? g.reps : null,
      timed_seconds: g.type==='timed' ? g.seconds : null,
      wt_seconds: g.type==='wt' ? g.seconds : null,
      rest_note: p.rest, set_note: null,
    }
    const { data, error } = await supabase.from('training_sets').insert(row).select().single()
    if (!error && data) setSets(prev => [...prev, data])
  }
  setInlineEx(null)
  setInlineVal('')
}

  const saveDayData = useCallback(async (note: string, title: string) => {
    await supabase.from('training_notes').upsert(
      { user_id: userId, date: today, note, title, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,date' }
    )
  }, [userId, today])

  const d = new Date()
  const dateLabel = d.toLocaleDateString('pl-PL', { weekday:'long', year:'numeric', month:'long', day:'numeric' })

  const grouped: Record<string, TrainingSet[]> = {}
  sets.forEach(s => { if (!grouped[s.exercise_name]) grouped[s.exercise_name] = []; grouped[s.exercise_name].push(s) })

  return (
    <div style={{ background:T.bg, minHeight:'100vh', color:T.text }}>
      <Nav email={email} />
      <div style={{ maxWidth:720, margin:'0 auto', padding:'0 0.5rem 2rem' }}>

        {/* input card */}
        <div style={card}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <div>
              <span style={{ fontSize:13, color:T.muted2 }}>{dateLabel}</span>
              {dayTitle && <span style={{ fontSize:12, color:T.accent, marginLeft:8, fontStyle:'italic' }}>{dayTitle}</span>}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <input value={dayTitle} onChange={e => setDayTitle(e.target.value.slice(0,30))}
                placeholder="tytuł..." autoComplete="off"
                style={{ ...inp, width:110, fontSize:12, padding:'4px 8px' }}
                onBlur={() => saveDayData(dayNote, dayTitle)} />
              {Object.keys(grouped).length > 0 && (
                <span style={{ fontSize:11, padding:'2px 8px', background:T.surface2, borderRadius:99, color:T.muted, border:`1px solid ${T.border}` }}>
                  {Object.keys(grouped).length} {Object.keys(grouped).length===1?'ćwiczenie':Object.keys(grouped).length<5?'ćwiczenia':'ćwiczeń'}
                </span>
              )}
            </div>
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

          <div style={lbl}>Serie (np. 100x5x5x5 lub 80x8 lub 10x20s)</div>
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

        {/* executed sets grouped by exercise */}
        {Object.entries(grouped).map(([exN, items], idx) => (
          <div key={exN} style={card}>
            <div style={{ fontSize:13, fontWeight:600, marginBottom:10, display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:11, color:T.muted, fontFamily:'monospace' }}>#{idx+1}</span>
              {exN}
              <button onClick={() => toggleFavorite(exN)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:14, color: favorites.includes(exN) ? T.accent : T.muted, padding:0, lineHeight:1 }}>
                {favorites.includes(exN) ? '★' : '☆'}
              </button>
			  
			  <button onClick={() => { setInlineEx(inlineEx===exN ? null : exN); setInlineVal('') }}
  style={{ marginLeft:'auto', background:'none', border:`1px solid ${T.border}`, borderRadius:5, padding:'1px 8px', fontSize:10, cursor:'pointer', color:T.muted, fontFamily:'inherit' }}>
  + seria
</button>

            </div>
			
			{inlineEx === exN && (
  <div style={{ display:'flex', gap:6, marginBottom:8 }}>
    <input style={{ ...inp, flex:1, fontSize:12, fontFamily:'monospace' }}
      value={inlineVal} onChange={e => setInlineVal(e.target.value)}
      placeholder="np. 100x5 lub 60s" autoFocus
      onKeyDown={e => { if(e.key==='Enter') handleInlineAdd(exN); if(e.key==='Escape') setInlineEx(null) }} />
    <button style={b(true, { padding:'4px 12px', fontSize:11 })} onClick={() => handleInlineAdd(exN)}>Dodaj</button>
    <button style={b(false, { padding:'4px 10px', fontSize:11 })} onClick={() => setInlineEx(null)}>✕</button>
  </div>
)}

            {items.map(item => (
              <div key={item.id} style={{ marginBottom:8 }}>
                {editId === item.id ? (
                  <div style={{ display:'flex', gap:6 }}>
                    <input style={{ ...inp, flex:1, fontSize:12, fontFamily:'monospace' }} value={editVal}
                      onChange={e => setEditVal(e.target.value)} autoFocus
                      onKeyDown={e => { if(e.key==='Enter') handleEditSave(item); if(e.key==='Escape') setEditId(null) }} />
                    <button style={b(true, { padding:'4px 12px', fontSize:11 })} onClick={() => handleEditSave(item)}>OK</button>
                    <button style={b(false, { padding:'4px 10px', fontSize:11 })} onClick={() => setEditId(null)}>✕</button>
                  </div>
                ) : (
                  <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, fontFamily:'monospace' }}>
                    <span style={{ color:T.accent }}>
                      {item.set_type === 'weighted'
                        ? `${item.weight} kg × ${item.reps_arr.join(' · ')} powt.`
                        : item.set_type === 'timed'
                        ? item.timed_seconds?.map((s: number) => s+'s').join(' · ')
                        : item.set_type === 'wt'
                        ? `${item.weight} kg × ${item.wt_seconds}s`
                        : (item.bw_reps ?? item.reps_arr?.[0]) + ' powt.'}
                    </span>
                    {item.rest_note && <span style={{ fontSize:11, padding:'1px 7px', background:T.surface2, borderRadius:99, color:T.muted, border:`1px solid ${T.border}` }}>({item.rest_note})</span>}
                    <button onClick={() => {
                      setEditId(item.id)
                      if (item.set_type==='weighted') setEditVal(`${item.weight}x${item.reps_arr.join('x')}`)
                      else if (item.set_type==='bw')  setEditVal(`${item.bw_reps}`)
                      else if (item.set_type==='timed') setEditVal(item.timed_seconds?.map((s:number)=>s+'s').join(',') ?? '')
                      else if (item.set_type==='wt')  setEditVal(`${item.weight}x${item.wt_seconds}s`)
                    }} style={{ marginLeft:4, background:'none', border:`1px solid ${T.border}`, borderRadius:5, padding:'1px 7px', fontSize:10, cursor:'pointer', color:T.muted, fontFamily:'inherit' }}>edytuj</button>
                    <button onClick={() => removeSet(item.id)}
                      style={{ marginLeft:'auto', background:'none', border:`1px solid ${T.border}`, borderRadius:5, padding:'1px 8px', fontSize:10, cursor:'pointer', color:T.muted, fontFamily:'inherit' }}>usuń</button>
                  </div>
                )}
              </div>
            ))}

            <div style={{ fontSize:11, color:T.muted, marginTop:6, borderTop:`1px solid ${T.border}`, paddingTop:6 }}>
              objętość:{' '}
              <span style={{ color:T.accent }}>
                {items.some(s => s.set_type==='weighted')
                  ? items.filter(s=>s.set_type==='weighted').reduce((a,s)=>a+volOf(s.weight??0,s.reps_arr),0) + ' kg'
                  : items.some(s => s.set_type==='wt')
                  ? items.reduce((a,s)=>a+(s.weight??0)*(s.wt_seconds??0),0) + ' kg·s'
                  : items.some(s => s.set_type==='timed')
                  ? items.reduce((a,s)=>a+(s.timed_seconds?.reduce((b:number,t:number)=>b+t,0)??0),0) + 's'
                  : items.reduce((a,s)=>a+(s.bw_reps??s.reps_arr?.[0]??0),0) + ' powt.'}
              </span>
            </div>
          </div>
        ))}

        {/* day note */}
        <div style={card}>
          <div style={lbl}>Notatka do treningu</div>
          <textarea value={dayNote} onChange={e => setDayNote(e.target.value)}
            placeholder="Ogólne uwagi..."
            style={{ ...inp, minHeight:65, resize:'vertical', lineHeight:1.6, marginTop:4, fontSize:14, color:T.text }} />
          <button style={{ ...b(false, { padding:'5px 14px', fontSize:12, marginTop:8 }) }}
            onClick={() => saveDayData(dayNote, dayTitle)}>Zapisz notatkę</button>
        </div>

      </div>
    </div>
  )
}