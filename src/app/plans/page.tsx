'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'

const T = { bg:'#0e0e0e',surface:'#181818',surface2:'#222',border:'#2a2a2a',border2:'#383838',text:'#e8e8e8',muted:'#555',muted2:'#888',accent:'#c8f135',danger:'#ff4444' }
const card: React.CSSProperties = { background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:'14px 16px', marginBottom:10 }
const inp: React.CSSProperties = { width:'100%', background:T.surface2, border:`1px solid ${T.border2}`, borderRadius:7, padding:'8px 10px', fontSize:13, color:T.text, fontFamily:'var(--font-sans)', outline:'none', boxSizing:'border-box' }
const lbl: React.CSSProperties = { fontSize:11, color:T.muted2, marginBottom:4, letterSpacing:'0.04em', textTransform:'uppercase' as const }
const b = (primary: boolean, extra: React.CSSProperties = {}): React.CSSProperties => ({ background:primary?T.accent:'transparent', color:primary?'#111':T.muted2, border:`1px solid ${primary?T.accent:T.border2}`, borderRadius:7, padding:'7px 16px', fontSize:12, cursor:'pointer', fontWeight:primary?600:400, fontFamily:'inherit', ...extra })

interface Plan { id: string; title: string; content: string; updated_at: string }
interface PlanEx { id: string; plan_id: string; exercise_name: string; position: number }

const todayStr = () => new Date().toISOString().slice(0,10)

export default function PlansPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [userId, setUserId]     = useState('')
  const [plans, setPlans]       = useState<Plan[]>([])
  const [planExes, setPlanExes] = useState<PlanEx[]>([])
  const [allExercises, setAllExercises] = useState<string[]>([])
  const [editId, setEditId]     = useState<string|null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding]     = useState(false)
  const [confirmDel, setConfirmDel] = useState<string|null>(null)
  const [editContent, setEditContent] = useState('')
  const [addExName, setAddExName] = useState('')
  const [addExAcOpen, setAddExAcOpen] = useState(false)
  const [launching, setLaunching] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      setEmail(session.user.email ?? '')
      setUserId(session.user.id)
      const { data: plansData } = await supabase.from('training_plans').select('*').order('created_at')
      setPlans(plansData ?? [])
      const { data: exData } = await supabase.from('exercises').select('name').order('name')
      setAllExercises(exData?.map((e: any) => e.name) ?? [])
    })
  }, [])

  // load exercises for active plan
  useEffect(() => {
    if (!editId) { setPlanExes([]); return }
    supabase.from('plan_exercises').select('*').eq('plan_id', editId).order('position')
      .then(({ data }) => setPlanExes(data ?? []))
    const plan = plans.find(p => p.id === editId)
    setEditContent(plan?.content ?? '')
  }, [editId])

  async function addPlan() {
    const title = newTitle.trim()
    if (!title) return
    const { data, error } = await supabase.from('training_plans')
      .insert({ user_id: userId, title, content: '' }).select().single()
    if (!error && data) { setPlans(prev => [...prev, data]); setEditId(data.id) }
    setNewTitle(''); setAdding(false)
  }

  async function updatePlanTitle(id: string, title: string) {
    await supabase.from('training_plans').update({ title, updated_at: new Date().toISOString() }).eq('id', id)
    setPlans(prev => prev.map(p => p.id === id ? { ...p, title } : p))
  }

  async function savePlanContent() {
    if (!editId) return
    await supabase.from('training_plans').update({ content: editContent, updated_at: new Date().toISOString() }).eq('id', editId)
    setPlans(prev => prev.map(p => p.id === editId ? { ...p, content: editContent } : p))
  }

  async function deletePlan(id: string) {
    await supabase.from('plan_exercises').delete().eq('plan_id', id)
    await supabase.from('training_plans').delete().eq('id', id)
    setPlans(prev => prev.filter(p => p.id !== id))
    if (editId === id) setEditId(null)
    setConfirmDel(null)
  }

  async function addExToPlan(name: string) {
    if (!editId || !name.trim()) return
    const maxPos = planExes.length > 0 ? Math.max(...planExes.map(e => e.position)) : -1
    const { data, error } = await supabase.from('plan_exercises')
      .insert({ plan_id: editId, exercise_name: name.trim(), position: maxPos + 1 }).select().single()
    if (!error && data) setPlanExes(prev => [...prev, data])
    setAddExName(''); setAddExAcOpen(false)
  }

  async function removeExFromPlan(id: string) {
    await supabase.from('plan_exercises').delete().eq('id', id)
    setPlanExes(prev => prev.filter(e => e.id !== id))
  }

  async function moveEx(id: string, dir: -1 | 1) {
    const idx = planExes.findIndex(e => e.id === id)
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= planExes.length) return
    const updated = [...planExes]
    const tmp = updated[idx]
    updated[idx] = { ...updated[newIdx], position: updated[idx].position }
    updated[newIdx] = { ...tmp, position: updated[newIdx].position }
    setPlanExes(updated)
    await supabase.from('plan_exercises').update({ position: updated[idx].position }).eq('id', updated[idx].id)
    await supabase.from('plan_exercises').update({ position: updated[newIdx].position }).eq('id', updated[newIdx].id)
  }

  async function launchPlan() {
    if (!editId || planExes.length === 0) return
    setLaunching(true)
    const today = todayStr()
    for (const ex of planExes) {
      await supabase.from('training_sets').insert({
        user_id: userId,
        exercise_name: ex.exercise_name,
        date: today,
        weight: null,
        reps_arr: [],
        set_type: 'bw',
        bw_reps: 0,
        timed_seconds: null,
        wt_seconds: null,
        rest_note: null,
        set_note: null,
      })
    }
    setLaunching(false)
    router.push('/today')
  }

  const activePlan = plans.find(p => p.id === editId)
  const acMatches = addExName.trim()
    ? allExercises.filter(e => e.toLowerCase().includes(addExName.toLowerCase()))
    : allExercises.slice(0, 8)

  return (
    <div style={{ background:T.bg, minHeight:'100vh', color:T.text }}>
      <Nav />
      <div style={{ maxWidth:720, margin:'0 auto', padding:'0 0.5rem 2rem' }}>

        {/* plan selector */}
        <div style={card}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div style={{ fontSize:11, color:T.muted2, textTransform:'uppercase', letterSpacing:'0.04em' }}>Plany treningowe</div>
            <button style={b(false, { padding:'4px 10px', fontSize:11 })} onClick={() => setAdding(!adding)}>
              {adding ? '✕ anuluj' : '+ nowy plan'}
            </button>
          </div>

          {adding && (
            <div style={{ display:'flex', gap:8, marginBottom:12 }}>
              <input style={{ ...inp, flex:1 }} value={newTitle} onChange={e => setNewTitle(e.target.value)}
                placeholder="Nazwa planu (np. Push, Pull, A, B...)" autoFocus
                onKeyDown={e => { if(e.key==='Enter') addPlan(); if(e.key==='Escape') setAdding(false) }} />
              <button style={b(true, { padding:'7px 14px' })} onClick={addPlan}>Dodaj</button>
            </div>
          )}

          {plans.length === 0 && !adding && (
            <p style={{ fontSize:12, color:T.muted }}>Brak planów. Dodaj pierwszy plan treningowy.</p>
          )}

          <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
            {plans.map(p => (
              <button key={p.id} onClick={() => setEditId(editId===p.id ? null : p.id)}
                style={{ background: editId===p.id ? T.accent : T.surface2, color: editId===p.id ? '#111' : T.text,
                  border:`1px solid ${editId===p.id ? T.accent : T.border2}`, borderRadius:7,
                  padding:'6px 16px', fontSize:13, cursor:'pointer', fontFamily:'inherit', fontWeight: editId===p.id ? 600 : 400 }}>
                {p.title}
              </button>
            ))}
          </div>
        </div>

        {/* active plan editor */}
        {activePlan && (
          <div style={card}>
            {/* header */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <input value={activePlan.title} onChange={e => updatePlanTitle(activePlan.id, e.target.value)}
                style={{ ...inp, fontSize:15, fontWeight:600, padding:'4px 8px', flex:1, marginRight:8 }} />
              <div style={{ display:'flex', gap:6 }}>
                <button style={b(true, { padding:'6px 14px', fontSize:12 })}
                  onClick={launchPlan} disabled={launching || planExes.length === 0}>
                  {launching ? '...' : '▶ rozpocznij trening'}
                </button>
                {confirmDel === activePlan.id ? (
                  <>
                    <button style={b(false, { padding:'4px 10px', fontSize:11, borderColor:T.danger, color:T.danger })}
                      onClick={() => deletePlan(activePlan.id)}>Usuń</button>
                    <button style={b(false, { padding:'4px 10px', fontSize:11 })} onClick={() => setConfirmDel(null)}>Anuluj</button>
                  </>
                ) : (
                  <button style={b(false, { padding:'4px 10px', fontSize:11, borderColor:T.border, color:T.muted })}
                    onClick={() => setConfirmDel(activePlan.id)}>usuń plan</button>
                )}
              </div>
            </div>

            {/* exercise list */}
            <div style={lbl}>Ćwiczenia w planie</div>
            <div style={{ marginTop:6, marginBottom:12 }}>
              {planExes.length === 0 && (
                <p style={{ fontSize:12, color:T.muted, marginBottom:8 }}>Brak ćwiczeń — dodaj poniżej.</p>
              )}
              {planExes.map((ex, idx) => (
                <div key={ex.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0', borderBottom:`1px solid ${T.border}`, fontSize:13 }}>
                  <span style={{ fontSize:11, color:T.muted, fontFamily:'monospace', minWidth:20 }}>#{idx+1}</span>
                  <span style={{ flex:1, color:T.text }}>{ex.exercise_name}</span>
                  <button onClick={() => moveEx(ex.id, -1)} disabled={idx===0}
                    style={{ background:'none', border:'none', cursor:idx===0?'default':'pointer', color:idx===0?T.muted:T.muted2, fontSize:14, padding:'0 4px' }}>↑</button>
                  <button onClick={() => moveEx(ex.id, 1)} disabled={idx===planExes.length-1}
                    style={{ background:'none', border:'none', cursor:idx===planExes.length-1?'default':'pointer', color:idx===planExes.length-1?T.muted:T.muted2, fontSize:14, padding:'0 4px' }}>↓</button>
                  <button onClick={() => removeExFromPlan(ex.id)}
                    style={{ background:'none', border:`1px solid ${T.border}`, borderRadius:5, padding:'1px 8px', fontSize:10, cursor:'pointer', color:T.muted, fontFamily:'inherit' }}>usuń</button>
                </div>
              ))}
            </div>

            {/* add exercise */}
            <div style={{ position:'relative', marginBottom:16 }}>
              <div style={{ display:'flex', gap:8 }}>
                <input style={{ ...inp, flex:1 }} value={addExName}
                  onChange={e => { setAddExName(e.target.value); setAddExAcOpen(true) }}
                  placeholder="Dodaj ćwiczenie do planu..." autoComplete="off"
                  onKeyDown={e => { if(e.key==='Enter') addExToPlan(addExName); if(e.key==='Escape') setAddExAcOpen(false) }}
                  onFocus={() => setAddExAcOpen(true)} />
                <button style={b(false, { padding:'7px 14px' })} onClick={() => addExToPlan(addExName)}>Dodaj</button>
              </div>
              {addExAcOpen && acMatches.length > 0 && (
                <div style={{ position:'absolute', top:'100%', left:0, right:0, background:T.surface, border:`1px solid ${T.border2}`, borderRadius:7, zIndex:10, maxHeight:160, overflowY:'auto' }}>
                  {acMatches.map(m => (
                    <div key={m} onMouseDown={() => addExToPlan(m)}
                      style={{ padding:'8px 10px', fontSize:13, cursor:'pointer', color:T.text, fontFamily:'monospace' }}
                      onMouseEnter={e => (e.currentTarget.style.background = T.surface2)}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>{m}</div>
                  ))}
                </div>
              )}
            </div>

            {/* notes */}
            <div style={lbl}>Notatka do planu</div>
            <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
              placeholder="Dodatkowe uwagi, wskazówki do planu..."
              style={{ ...inp, minHeight:100, resize:'vertical', lineHeight:1.8, marginTop:4, fontSize:13 }} />
            <button style={{ ...b(false, { padding:'6px 16px', fontSize:12, marginTop:8 }) }} onClick={savePlanContent}>
              Zapisz notatkę
            </button>
          </div>
        )}
      </div>
    </div>
  )
}