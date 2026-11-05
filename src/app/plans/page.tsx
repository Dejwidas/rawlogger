'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { WITH_NAME, ensureExercise, flattenExercise, loadActiveExerciseNames, normalizeExerciseName } from '@/lib/exercises'
import { NOTE_MAX, getSharedPlan, newShareToken, shareUrl, type SharedPlan } from '@/lib/sharing'
import Nav from '@/components/Nav'
import PlanCatalog from '@/components/PlanCatalog'

const T = { bg:'#0e0e0e',surface:'#181818',surface2:'#222',border:'#2a2a2a',border2:'#383838',text:'#e8e8e8',muted:'#555',muted2:'#888',accent:'#c8f135',danger:'#ff4444' }
const card: React.CSSProperties = { background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:'14px 16px', marginBottom:10 }
const inp: React.CSSProperties = { width:'100%', background:T.surface2, border:`1px solid ${T.border2}`, borderRadius:7, padding:'8px 10px', fontSize:13, color:T.text, fontFamily:'var(--font-sans)', outline:'none', boxSizing:'border-box' }
const lbl: React.CSSProperties = { fontSize:11, color:T.muted2, marginBottom:4, letterSpacing:'0.04em', textTransform:'uppercase' as const }
const b = (primary: boolean, extra: React.CSSProperties = {}): React.CSSProperties => ({ background:primary?T.accent:'transparent', color:primary?'#111':T.muted2, border:`1px solid ${primary?T.accent:T.border2}`, borderRadius:7, padding:'7px 16px', fontSize:12, cursor:'pointer', fontWeight:primary?600:400, fontFamily:'inherit', ...extra })

interface Plan { id: string; title: string; content: string; updated_at: string; share_token: string; link_shared: boolean; is_public: boolean; published_at: string | null }
interface PlanEx { id: string; plan_id: string; exercise_id: string; exercise_name: string; position: number; note: string | null }

const todayStr = () => new Date().toISOString().slice(0,10)

const EMPTY_SET = { set_type:'bw', weight:null, reps_arr:[], bw_reps:0, timed_seconds:null, wt_seconds:null }

// Podpowiedź do uruchomienia planu: ostatnia seria ćwiczenia z wcześniejszej
// sesji, w tym samym typie, ale z zerem powtórzeń lub sekund. Puste serie
// z poprzednich uruchomień planu nic nie mówią, więc są pomijane.
async function lastSetHint(exerciseId: string, today: string) {
  const { data, error } = await supabase.from('training_sets')
    .select('set_type, weight, bw_reps, timed_seconds')
    .eq('exercise_id', exerciseId).lt('date', today)
    .order('date', { ascending:false }).order('created_at', { ascending:false })
    .limit(10)
  if (error) { console.error('last set hint failed', error); return null }
  const last = data?.find(s =>
    s.set_type === 'weighted' || s.set_type === 'wt' ? s.weight != null
    : s.set_type === 'timed' ? s.timed_seconds?.some((t: number) => t > 0)
    : (s.bw_reps ?? 0) > 0)
  if (!last) return null
  if (last.set_type === 'weighted') return { ...EMPTY_SET, set_type:'weighted', weight:last.weight, reps_arr:[0], bw_reps:null }
  if (last.set_type === 'wt')       return { ...EMPTY_SET, set_type:'wt', weight:last.weight, wt_seconds:0, bw_reps:null }
  if (last.set_type === 'timed')    return { ...EMPTY_SET, set_type:'timed', timed_seconds:[0], bw_reps:null }
  return null
}

export default function PlansPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [userId, setUserId]     = useState('')
  const [plans, setPlans]       = useState<Plan[]>([])
  const [planExes, setPlanExes] = useState<PlanEx[]>([])
  const [allExercises, setAllExercises] = useState<string[]>([])
  const [editId, setEditId]     = useState<string|null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [titleDraft, setTitleDraft] = useState<{ id: string, value: string } | null>(null)
  const [adding, setAdding]     = useState(false)
  const [confirmDel, setConfirmDel] = useState<string|null>(null)
  const [editContent, setEditContent] = useState('')
  const [addExName, setAddExName] = useState('')
  const [addExAcOpen, setAddExAcOpen] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [tab, setTab]           = useState<'mine'|'catalog'>('mine')
  const [shareStats, setShareStats] = useState<SharedPlan | null>(null)
  const [shareMsg, setShareMsg] = useState<{ ok: boolean, text: string } | null>(null)

  async function loadPlans() {
    const { data: plansData } = await supabase.from('training_plans').select('*').order('created_at')
    setPlans(plansData ?? [])
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      setEmail(session.user.email ?? '')
      setUserId(session.user.id)
      await loadPlans()
      setAllExercises(await loadActiveExerciseNames())
      // ?open=<id> po imporcie ze strony linku
      const open = new URLSearchParams(window.location.search).get('open')
      if (open) { setEditId(open); router.replace('/plans') }
    })
  }, [])

  // load exercises for active plan
  useEffect(() => {
    if (!editId) { setPlanExes([]); return }
    supabase.from('plan_exercises').select(WITH_NAME).eq('plan_id', editId).order('position')
      .then(({ data }) => setPlanExes((data ?? []).map(flattenExercise)))
    const plan = plans.find(p => p.id === editId)
    setEditContent(plan?.content ?? '')
    setShareMsg(null)
  }, [editId])

  // Plusy i importy własnego planu, gdy jest udostępniony.
  const activeShare = plans.find(p => p.id === editId)
  useEffect(() => {
    setShareStats(null)
    if (!activeShare || !(activeShare.link_shared || activeShare.is_public)) return
    getSharedPlan(activeShare.share_token).then(setShareStats)
      .catch(e => console.error('get_shared_plan failed', e))
  }, [activeShare?.share_token, activeShare?.link_shared, activeShare?.is_public])

  async function updateSharing(id: string, patch: Partial<Plan>, okText: string) {
    const { error } = await supabase.from('training_plans').update(patch).eq('id', id)
    if (error) {
      console.error('update sharing failed', error)
      setShareMsg({ ok:false, text:`Nie zapisano: ${error.message}` })
      return
    }
    setPlans(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
    setShareMsg({ ok:true, text: okText })
  }

  // Wyłączenie linku zmienia token, więc stary adres przestaje działać na zawsze.
  const enableLink  = (p: Plan) => updateSharing(p.id, { link_shared: true }, 'Link jest aktywny. Skopiuj go i wyślij.')
  const disableLink = (p: Plan) => updateSharing(p.id, { link_shared: false, share_token: newShareToken() }, 'Link wyłączony. Stary adres już nie działa.')
  const publish     = (p: Plan) => updateSharing(p.id, { is_public: true, published_at: new Date().toISOString() }, 'Plan jest w katalogu.')
  const unpublish   = (p: Plan) => updateSharing(p.id, { is_public: false }, 'Plan wycofany z katalogu.')

  const [canShare, setCanShare] = useState(false)
  useEffect(() => { setCanShare(typeof navigator.share === 'function') }, [])

  async function copyLink(p: Plan) {
    try {
      await navigator.clipboard.writeText(shareUrl(p.share_token))
      setShareMsg({ ok:true, text:'Skopiowano link.' })
    } catch (e) {
      console.error('copy failed', e)
      setShareMsg({ ok:false, text:'Nie udało się skopiować. Zaznacz link i skopiuj ręcznie.' })
    }
  }

  async function sendLink(p: Plan) {
    try {
      await navigator.share({ title: p.title, url: shareUrl(p.share_token) })
    } catch (e: any) {
      if (e?.name !== 'AbortError') console.error('share failed', e)
    }
  }

  // Edytowana jest jedna notatka naraz; reszta wyświetla się jako tekst.
  const [noteEdit, setNoteEdit]   = useState<string|null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [noteErr, setNoteErr]     = useState<{ id: string, text: string } | null>(null)

  // Escape anuluje; ref, bo blur przy zamykaniu pola przychodzi przed nowym renderem.
  const noteCancelled = useRef(false)

  function startNote(ex: PlanEx) {
    noteCancelled.current = false
    setNoteEdit(ex.id); setNoteDraft(ex.note ?? ''); setNoteErr(null)
  }

  async function saveNote(ex: PlanEx) {
    setNoteEdit(null)
    if (noteCancelled.current) return
    const note = noteDraft.trim().slice(0, NOTE_MAX) || null
    if (note === (ex.note ?? null)) return
    const { error } = await supabase.from('plan_exercises').update({ note }).eq('id', ex.id)
    if (error) {
      console.error('save note failed', error)
      setNoteErr({ id: ex.id, text: `Nie zapisano notatki: ${error.message}` })
      return
    }
    setPlanExes(prev => prev.map(e => e.id === ex.id ? { ...e, note } : e))
  }

  async function openImported(planId: string) {
    await loadPlans()
    setAllExercises(await loadActiveExerciseNames())
    setTab('mine')
    setEditId(planId)
  }

  async function addPlan() {
    const title = newTitle.trim()
    if (!title) return
    const { data, error } = await supabase.from('training_plans')
      .insert({ user_id: userId, title, content: '' }).select().single()
    if (!error && data) { setPlans(prev => [...prev, data]); setEditId(data.id) }
    setNewTitle(''); setAdding(false)
  }

  async function updatePlanTitle(id: string, raw: string) {
    const title = raw.trim()
    if (!title) return
    const { error } = await supabase.from('training_plans').update({ title, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { console.error('rename failed', error); return }
    setPlans(prev => prev.map(p => p.id === id ? { ...p, title } : p))
    setTitleDraft(null)
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
    let exId: string, canonical: string
    try {
      ({ id: exId, name: canonical } = await ensureExercise(normalizeExerciseName(name)))
    } catch (err) {
      console.error('ensure_exercise failed', err)
      return
    }
    const maxPos = planExes.length > 0 ? Math.max(...planExes.map(e => e.position)) : -1
    const { data, error } = await supabase.from('plan_exercises')
      .insert({ plan_id: editId, user_id: userId, exercise_id: exId, position: maxPos + 1 }).select(WITH_NAME).single()
    if (!error && data) setPlanExes(prev => [...prev, flattenExercise(data)])
    setAllExercises(prev => prev.includes(canonical) ? prev : [...prev, canonical].sort())
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

    // dołóż plan za tym, co już jest w dzienniku na dziś — inaczej
    // display_order zderzyłby się z istniejącymi ćwiczeniami
    const { data: last } = await supabase.from('training_sets')
      .select('display_order').eq('user_id', userId).eq('date', today)
      .order('display_order', { ascending: false, nullsFirst: false }).limit(1)
    const base = (last?.[0]?.display_order ?? -1) + 1

    const hints = new Map(await Promise.all(
      [...new Set(planExes.map(ex => ex.exercise_id))].map(async id => [id, await lastSetHint(id, today)] as const)
    ))

    // planExes jest już posortowane po position — indeks daje gęstą kolejność
    const rows = planExes.map((ex, i) => ({
      user_id: userId,
      exercise_id: ex.exercise_id,
      date: today,
      ...(hints.get(ex.exercise_id) ?? EMPTY_SET),
      rest_note: null,
      set_note: null,
      display_order: base + i,
    }))
    const { error } = await supabase.from('training_sets').insert(rows)
    if (error) console.error('launchPlan insert failed', error)

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

        {/* Moje | Katalog */}
        <div style={{ display:'flex', marginBottom:10, border:`1px solid ${T.border2}`, borderRadius:8, overflow:'hidden' }}>
          {([['mine', 'Moje'], ['catalog', 'Katalog']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              style={{ flex:1, background: tab===key ? T.accent : 'transparent', color: tab===key ? '#111' : T.muted2,
                border:'none', padding:'8px 0', fontSize:13, fontWeight: tab===key ? 600 : 400, cursor:'pointer', fontFamily:'inherit' }}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'catalog' && <PlanCatalog onImported={openImported} />}

        {tab === 'mine' && <>
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
              {(() => {
                const draft = titleDraft?.id === activePlan.id ? titleDraft.value : activePlan.title
                const dirty = draft.trim() !== '' && draft.trim() !== activePlan.title
                return (
                  <div style={{ display:'flex', gap:6, flex:1, marginRight:8 }}>
                    <input value={draft} onChange={e => setTitleDraft({ id: activePlan.id, value: e.target.value })}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && dirty) updatePlanTitle(activePlan.id, draft)
                        if (e.key === 'Escape') setTitleDraft(null)
                      }}
                      style={{ ...inp, fontSize:15, fontWeight:600, padding:'4px 8px', flex:1, minWidth:0 }} />
                    {dirty && (
                      <button style={b(true, { padding:'4px 12px', fontSize:12 })}
                        onClick={() => updatePlanTitle(activePlan.id, draft)}>OK</button>
                    )}
                  </div>
                )
              })()}
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
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ color:T.text }}>{ex.exercise_name}</div>
                    {noteEdit === ex.id ? (
                      <input autoFocus value={noteDraft} maxLength={NOTE_MAX}
                        onChange={e => setNoteDraft(e.target.value)}
                        onBlur={() => saveNote(ex)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') e.currentTarget.blur()
                          if (e.key === 'Escape') { noteCancelled.current = true; setNoteEdit(null) }
                        }}
                        placeholder="np. 3×8–10, RIR 2"
                        style={{ ...inp, marginTop:4, padding:'5px 8px', fontSize:12 }} />
                    ) : ex.note ? (
                      <div onClick={() => startNote(ex)} title="Edytuj notatkę"
                        style={{ fontSize:12, color:T.muted2, marginTop:2, cursor:'pointer', overflowWrap:'anywhere' }}>{ex.note} <span style={{ color:T.muted }}>✎</span></div>
                    ) : (
                      <button onClick={() => startNote(ex)}
                        style={{ background:'none', border:'none', padding:0, marginTop:2, fontSize:11, color:T.muted, cursor:'pointer', fontFamily:'inherit' }}>+ notatka</button>
                    )}
                    {noteErr?.id === ex.id && <div style={{ fontSize:11, color:T.danger, marginTop:2 }}>{noteErr.text}</div>}
                  </div>
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

            {/* sharing */}
            <div style={lbl}>Udostępnianie</div>
            <div style={{ marginTop:6, marginBottom:16, fontSize:12 }}>
              <p style={{ color:T.muted, margin:'0 0 10px' }}>
                Inni zobaczą ćwiczenia z notatkami, zawsze w aktualnej wersji. Notatka do planu zostaje prywatna.
              </p>

              {activePlan.link_shared ? (
                <div style={{ marginBottom:10 }}>
                  <div style={{ display:'flex', gap:8, marginBottom:6 }}>
                    <input readOnly value={shareUrl(activePlan.share_token)} onFocus={e => e.target.select()}
                      style={{ ...inp, flex:1, fontSize:12, fontFamily:'monospace' }} />
                    <button style={b(true, { padding:'6px 12px' })} onClick={() => copyLink(activePlan)}>Kopiuj</button>
                    {canShare && <button style={b(false, { padding:'6px 12px' })} onClick={() => sendLink(activePlan)}>Wyślij…</button>}
                  </div>
                  <button style={b(false, { padding:'4px 10px', fontSize:11 })} onClick={() => disableLink(activePlan)}>wyłącz link</button>
                </div>
              ) : (
                <button style={b(false, { padding:'6px 12px', marginBottom:10, marginRight:8 })} onClick={() => enableLink(activePlan)}>🔗 udostępnij linkiem</button>
              )}

              {activePlan.is_public ? (
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  <span style={{ color:T.accent }}>W katalogu</span>
                  <button style={b(false, { padding:'4px 10px', fontSize:11 })} onClick={() => unpublish(activePlan)}>wycofaj</button>
                </div>
              ) : (
                <button style={b(false, { padding:'6px 12px' })} onClick={() => publish(activePlan)} disabled={planExes.length === 0}
                  title={planExes.length === 0 ? 'Dodaj najpierw ćwiczenia' : undefined}>📣 opublikuj w katalogu</button>
              )}

              {shareStats && (
                <div style={{ color:T.muted2, marginTop:8 }}>▲ {shareStats.votes} · importy {shareStats.imports} · wynik {shareStats.score}</div>
              )}
              {shareMsg && <div style={{ color: shareMsg.ok ? T.muted2 : T.danger, marginTop:8 }}>{shareMsg.text}</div>}
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
        </>}
      </div>
    </div>
  )
}