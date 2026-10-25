'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'

const T = { bg:'#0e0e0e',surface:'#181818',surface2:'#222',border:'#2a2a2a',border2:'#383838',text:'#e8e8e8',muted:'#555',muted2:'#888',accent:'#c8f135',danger:'#ff4444' }
const card: React.CSSProperties = { background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:'14px 16px', marginBottom:10 }
const inp: React.CSSProperties = { width:'100%', background:T.surface2, border:`1px solid ${T.border2}`, borderRadius:7, padding:'8px 10px', fontSize:13, color:T.text, fontFamily:'monospace', outline:'none', boxSizing:'border-box' }
const lbl: React.CSSProperties = { fontSize:11, color:T.muted2, marginBottom:4, letterSpacing:'0.04em', textTransform:'uppercase' as const }
const fmtDate = (s: string) => { const [y,m,d]=s.split('-'); return `${d}.${m}.${y}` }

interface PopularEx { name: string; sessions: number }

type RenameMsg = { ok: boolean; text: string; mergeInto?: string }

// 1 seria / 2-4 serie / 5+ serii
const plural = (n: number, one: string, few: string, many: string) =>
  n === 1 ? one
  : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? few
  : many

export default function FilterPage() {
  const router = useRouter()
  const [email, setEmail]         = useState('')
  const [userId, setUserId]       = useState('')
  const [exercises, setExercises] = useState<string[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const [popular, setPopular]     = useState<PopularEx[]>([])
  const [q, setQ]                 = useState('')
  const [acOpen, setAcOpen]       = useState(false)
  const [results, setResults]     = useState<any[]|null>(null)
  const [showFavOnly, setShowFavOnly] = useState(false)
  const [showManage, setShowManage]   = useState(false)
  const [newExName, setNewExName]     = useState('')
  const [renameId, setRenameId]       = useState<string|null>(null)
  const [renameVal, setRenameVal]     = useState('')
  const [confirmDel, setConfirmDel]   = useState<string|null>(null)
  const [renameMsg, setRenameMsg]     = useState<RenameMsg|null>(null)
  const [renameBusy, setRenameBusy]   = useState(false)
  const [mergeAsk, setMergeAsk]       = useState<{ from: string; into: string }|null>(null)
  const [manageMsg, setManageMsg]     = useState<RenameMsg|null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      setEmail(session.user.email ?? '')
      setUserId(session.user.id)
      await loadAll(session.user.id)
    })
  }, [])

  async function loadAll(uid?: string) {
    const id = uid ?? userId

    // load exercises
    const { data: exData } = await supabase.from('exercises').select('name').order('name')
    const exList = exData?.map((e: any) => e.name) ?? []
    setExercises(exList)

    // load favorites
    const { data: favData } = await supabase.from('favorite_exercises').select('exercise_name')
    setFavorites(favData?.map((f: any) => f.exercise_name) ?? [])

    // Liczba sesji liczona po stronie serwera. Wcześniej szło to przez
    // pobranie całej tabeli training_sets i zliczanie unikalnych dat w JS,
    // co po przekroczeniu limitu "Max rows" API (domyślnie 1000) po cichu
    // gubiło część wierszy — ćwiczenia z uciętego ogona pokazywały 0 sesji.
    const { data: statsData, error: statsErr } = await supabase.rpc('exercise_stats')
    if (statsErr) console.error('exercise_stats failed', statsErr)
    const sessionsByName = new Map<string, number>(
      (statsData ?? []).map((s: any) => [s.name, s.sessions as number])
    )
    // wszystkie ćwiczenia z exercises, nawet te z 0 sesji
    const all = exList.map(name => ({ name, sessions: sessionsByName.get(name) ?? 0 }))
    // sortuj: najpierw po sesjach malejąco, przy równych alfabetycznie
    all.sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name, 'pl'))
    setPopular(all)
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

  async function addExercise() {
    const name = newExName.trim()
    if (!name) return
    const normalized = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
    if (exercises.includes(normalized)) return
    await supabase.from('exercises').insert({ user_id: userId, name: normalized })
    setExercises(prev => [...prev, normalized].sort())
    setNewExName('')
  }

  async function deleteExercise(name: string) {
    await supabase.from('exercises').delete().eq('user_id', userId).eq('name', name)
    setConfirmDel(null)
    await loadAll()
  }

  function cancelRename() {
    setRenameId(null); setRenameMsg(null); setMergeAsk(null)
  }

  // Nazwa ćwiczenia jest w bazie trzymana tekstem w training_sets,
  // favorite_exercises i plan_exercises — nie ma exercise_id. Przepisanie
  // wszystkich trzech tabel musi być jedną transakcją, dlatego RPC.
  async function renameExercise(oldName: string) {
    const raw = renameVal.trim()
    if (!raw) { setRenameMsg({ ok:false, text:'Nazwa nie może być pusta.' }); return }
    const normalized = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
    if (normalized === oldName) { cancelRename(); return }

    setRenameBusy(true); setMergeAsk(null)
    const { data, error } = await supabase.rpc('rename_exercise', { p_old: oldName, p_new: normalized })
    setRenameBusy(false)

    if (error) {
      console.error('rename_exercise failed', error)
      setRenameMsg({ ok:false, text:`Nie zmieniono nazwy: ${error.message}${error.code ? ` [${error.code}]` : ''}` })
      return
    }

    if (!data?.ok) {
      if (data?.reason === 'duplicate') {
        const n = data.target_sets ?? 0
        setRenameMsg({
          ok: false,
          mergeInto: data.target,
          text: `Ćwiczenie „${data.target}" już istnieje (${n} ${plural(n,'seria','serie','serii')}).`,
        })
      } else if (data?.reason === 'empty') {
        setRenameMsg({ ok:false, text:'Nazwa nie może być pusta.' })
      } else if (data?.reason === 'too_long') {
        setRenameMsg({ ok:false, text:'Nazwa może mieć najwyżej 80 znaków.' })
      } else if (data?.reason === 'not_found') {
        setRenameMsg({ ok:false, text:`Nie znaleziono ćwiczenia „${oldName}".` })
      } else {
        console.error('rename_exercise: nieoczekiwana odpowiedź', data)
        setRenameMsg({ ok:false, text:'Nie zmieniono nazwy — nieoczekiwana odpowiedź serwera.' })
      }
      return
    }

    const plans = data.plans ?? 0
    await loadAll()
    cancelRename()
    setManageMsg({ ok:true, text:
      `Zmieniono nazwę na „${data.name}" — przepisano ${data.sets} ${plural(data.sets,'serię','serie','serii')}` +
      (plans ? `, ${plans} ${plural(plans,'wpis','wpisy','wpisów')} w planach.` : '.') })
  }

  async function mergeExercise(fromName: string, intoName: string) {
    setRenameBusy(true)
    const { data, error } = await supabase.rpc('merge_exercise', { p_from: fromName, p_into: intoName })
    setRenameBusy(false)

    if (error) {
      console.error('merge_exercise failed', error)
      setRenameMsg({ ok:false, text:`Nie scalono: ${error.message}${error.code ? ` [${error.code}]` : ''}` })
      return
    }
    if (!data?.ok) {
      console.error('merge_exercise: odmowa', data)
      setRenameMsg({ ok:false, text: data?.reason === 'target_not_found'
        ? `Nie ma już ćwiczenia „${intoName}" — odśwież stronę.`
        : `Nie scalono (${data?.reason ?? 'nieznany powód'}).` })
      return
    }

    const removed = data.plans_removed ?? 0
    await loadAll()
    cancelRename()
    setManageMsg({ ok:true, text:
      `Scalono „${fromName}" z „${data.into}" — przeniesiono ${data.sets} ${plural(data.sets,'serię','serie','serii')}` +
      (removed ? `, usunięto ${removed} ${plural(removed,'zdublowany wpis','zdublowane wpisy','zdublowanych wpisów')} w planach.` : '.') })
  }

  async function doFilter(name?: string) {
    const query = (name ?? q).trim()
    if (!query) return
    setQ(query); setAcOpen(false)
    const { data } = await supabase.from('training_sets')
      .select('date, weight, reps_arr, set_type, bw_reps, timed_seconds, wt_seconds')
      .ilike('exercise_name', query).order('date', { ascending:false })
    const byDate: Record<string,any[]> = {}
    data?.forEach((s: any) => { if(!byDate[s.date])byDate[s.date]=[]; byDate[s.date].push(s) })
    setResults(Object.entries(byDate).map(([date,sets])=>({date,sets})))
  }

  const acMatches = q.trim() ? exercises.filter(e => e.toLowerCase().includes(q.toLowerCase())) : []
  const displayList = showFavOnly ? popular.filter(e => favorites.includes(e.name)) : popular

  const b = (primary: boolean, extra: React.CSSProperties = {}): React.CSSProperties => ({
    background:primary?T.accent:'transparent', color:primary?'#111':T.muted2,
    border:`1px solid ${primary?T.accent:T.border2}`, borderRadius:7, padding:'7px 16px',
    fontSize:12, cursor:'pointer', fontFamily:'inherit', fontWeight:primary?600:400, ...extra
  })

  function setLabel(s: any): string {
    if (s.set_type==='weighted') return `${s.weight}kg×${s.reps_arr?.join('·')}`
    if (s.set_type==='timed')   return s.timed_seconds?.map((t:number)=>t+'s').join('·') ?? ''
    if (s.set_type==='wt')      return `${s.weight}kg×${s.wt_seconds}s`
    return (s.bw_reps ?? s.reps_arr?.[0]) + 'powt.'
  }

  return (
    <div style={{ background:T.bg, minHeight:'100vh', color:T.text }}>
      <Nav />
      <div style={{ maxWidth:720, margin:'0 auto', padding:'0 0.5rem 2rem' }}>
        <div style={card}>

          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div style={{ fontSize:11, color:T.muted2, textTransform:'uppercase', letterSpacing:'0.04em' }}>Wyszukaj</div>
            <div style={{ display:'flex', gap:8 }}>
              {!showManage && (
                <button style={b(showFavOnly, { padding:'4px 12px', fontSize:11, borderRadius:99 })}
                  onClick={() => { setShowFavOnly(!showFavOnly); setResults(null); setQ('') }}>
                  ★ ulubione
                </button>
              )}
              <button style={b(showManage, { padding:'4px 10px', fontSize:11 })}
                onClick={() => { setShowManage(!showManage); setResults(null); setQ('') }}>
                {showManage ? '← wróć' : '⚙ zarządzaj'}
              </button>
            </div>
          </div>

          {showManage ? (
            <div>
              <div style={lbl}>Dodaj nowe ćwiczenie</div>
              <div style={{ display:'flex', gap:8, marginTop:4, marginBottom:16 }}>
                <input style={{ ...inp, flex:1 }} value={newExName}
                  onChange={e => setNewExName(e.target.value)}
                  placeholder="Nazwa ćwiczenia..."
                  onKeyDown={e => e.key==='Enter' && addExercise()} />
                <button style={b(true, { padding:'7px 14px' })} onClick={addExercise}>Dodaj</button>
              </div>

              <div style={lbl}>Lista ćwiczeń ({exercises.length})</div>
              {manageMsg && (
                <div style={{ fontSize:11, color: manageMsg.ok ? T.accent : T.danger, marginTop:6, lineHeight:1.6 }}>
                  {manageMsg.text}
                </div>
              )}
              <div style={{ marginTop:6 }}>
                {exercises.map(ex => (
                  <div key={ex} style={{ borderBottom:`1px solid ${T.border}`, padding:'6px 0' }}>
                    {renameId === ex ? (
                      <div>
                        <div style={{ display:'flex', gap:6 }}>
                          <input style={{ ...inp, flex:1, fontSize:12 }} value={renameVal}
                            onChange={e => { setRenameVal(e.target.value); setRenameMsg(null); setMergeAsk(null) }} autoFocus
                            onKeyDown={e => { if(e.key==='Enter') renameExercise(ex); if(e.key==='Escape') cancelRename() }} />
                          <button style={b(true, { padding:'4px 12px', fontSize:11 })}
                            onClick={() => renameExercise(ex)} disabled={renameBusy}>{renameBusy ? '...' : 'OK'}</button>
                          <button style={b(false, { padding:'4px 10px', fontSize:11 })} onClick={cancelRename}>✕</button>
                        </div>

                        {renameMsg && !mergeAsk && (
                          <div style={{ marginTop:6, fontSize:11, color: renameMsg.ok ? T.accent : T.danger, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                            <span>{renameMsg.text}</span>
                            {renameMsg.mergeInto && (
                              <button style={b(false, { padding:'2px 10px', fontSize:11 })}
                                onClick={() => setMergeAsk({ from: ex, into: renameMsg.mergeInto! })}>
                                Scal z „{renameMsg.mergeInto}"
                              </button>
                            )}
                          </div>
                        )}

                        {mergeAsk && (
                          <div style={{ marginTop:6, fontSize:11, color:T.muted2, lineHeight:1.6 }}>
                            Historia „{mergeAsk.from}" zostanie przepisana na „{mergeAsk.into}",
                            a „{mergeAsk.from}" zniknie z listy. Tego nie można cofnąć.
                            <div style={{ display:'flex', gap:8, marginTop:6 }}>
                              <button style={b(false, { padding:'3px 10px', fontSize:11, borderColor:T.danger, color:T.danger })}
                                onClick={() => mergeExercise(mergeAsk.from, mergeAsk.into)} disabled={renameBusy}>
                                {renameBusy ? '...' : 'Scal'}
                              </button>
                              <button style={b(false, { padding:'3px 10px', fontSize:11 })}
                                onClick={() => setMergeAsk(null)}>Anuluj</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : confirmDel === ex ? (
                      <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12 }}>
                        <span style={{ color:T.danger, flex:1 }}>Usunąć „{ex}"?</span>
                        <button style={b(false, { padding:'3px 10px', fontSize:11, borderColor:T.danger, color:T.danger })}
                          onClick={() => deleteExercise(ex)}>Usuń</button>
                        <button style={b(false, { padding:'3px 10px', fontSize:11 })} onClick={() => setConfirmDel(null)}>Anuluj</button>
                      </div>
                    ) : (
                      <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13 }}>
                        <button onClick={() => toggleFavorite(ex)}
                          style={{ background:'none', border:'none', cursor:'pointer', fontSize:14, color: favorites.includes(ex) ? T.accent : T.muted, padding:0, lineHeight:1 }}>
                          {favorites.includes(ex) ? '★' : '☆'}
                        </button>
                        <span style={{ flex:1, color:T.text }}>{ex}</span>
                        <button style={b(false, { padding:'2px 10px', fontSize:11 })}
                          onClick={() => { setRenameId(ex); setRenameVal(ex); setRenameMsg(null); setMergeAsk(null); setManageMsg(null) }}>zmień nazwę</button>
                        <button style={b(false, { padding:'2px 10px', fontSize:11, borderColor:T.border, color:T.muted })}
                          onClick={() => setConfirmDel(ex)}>usuń</button>
                      </div>
                    )}
                  </div>
                ))}
                {exercises.length === 0 && <p style={{ fontSize:12, color:T.muted }}>Brak ćwiczeń.</p>}
              </div>
            </div>

          ) : (
            <>
              <div style={lbl}>Szukaj po nazwie</div>
              <div style={{ position:'relative', marginBottom:10, marginTop:4 }}>
                <input style={inp} value={q} onChange={e=>{setQ(e.target.value);setAcOpen(true)}}
                  placeholder="Wpisz nazwę ćwiczenia..." autoComplete="off"
                  onKeyDown={e=>{if(e.key==='Enter')doFilter();if(e.key==='Escape')setAcOpen(false)}} />
                {acOpen && acMatches.length > 0 && (
                  <div style={{ position:'absolute', top:'100%', left:0, right:0, background:T.surface, border:`1px solid ${T.border2}`, borderRadius:7, zIndex:10, maxHeight:140, overflowY:'auto' }}>
                    {acMatches.map(m=>(
                      <div key={m} onMouseDown={()=>doFilter(m)}
                        style={{ padding:'8px 10px', fontSize:12, cursor:'pointer', color:T.text, fontFamily:'monospace' }}
                        onMouseEnter={e=>(e.currentTarget.style.background=T.surface2)}
                        onMouseLeave={e=>(e.currentTarget.style.background='')}>{m}</div>
                    ))}
                  </div>
                )}
              </div>
              <button style={{ ...b(true), marginBottom:16 }} onClick={() => doFilter()}>Szukaj</button>

              {results !== null && results.length === 0 && (
                <p style={{ fontSize:12, color:T.muted, marginBottom:12 }}>Brak wyników.</p>
              )}
              {results !== null && results.length > 0 && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11, color:T.muted2, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.04em' }}>
                    Wyniki — {results.length} {results.length===1?'sesja':results.length<5?'sesje':'sesji'}
                  </div>
                  {results.map(({date,sets})=>(
                    <div key={date} onClick={() => router.push(`/calendar?day=${date}`)}
                      style={{ padding:'8px 0', borderBottom:`1px solid ${T.border}`, fontSize:12, cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}
                      onMouseEnter={e=>(e.currentTarget.style.background=T.surface2)}
                      onMouseLeave={e=>(e.currentTarget.style.background='')}>
                      <span style={{ color:T.accent, fontFamily:'monospace' }}>{fmtDate(date)}</span>
                      <span style={{ color:T.muted2, fontFamily:'monospace', fontSize:11 }}>
                        {sets.map((s:any) => setLabel(s)).join('  ')}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {results === null && (
                <>
                  <div style={{ fontSize:11, color:T.muted2, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.04em' }}>
                    {showFavOnly ? 'Ulubione' : 'Najpopularniejsze'}
                  </div>
                  {displayList.length === 0 && <p style={{ fontSize:12, color:T.muted }}>Brak ćwiczeń.</p>}
                  {displayList.map(ex => (
                    <div key={ex.name}
                      style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:`1px solid ${T.border}`, fontSize:13 }}
                      onMouseEnter={e=>(e.currentTarget.style.background=T.surface2)}
                      onMouseLeave={e=>(e.currentTarget.style.background='')}>
                      <span onClick={() => doFilter(ex.name)} style={{ color:T.text, flex:1, cursor:'pointer' }}>{ex.name}</span>
                      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                        <span style={{ fontSize:11, color:T.muted, fontFamily:'monospace' }}>{ex.sessions} sesji</span>
                        <button onClick={() => toggleFavorite(ex.name)}
                          style={{ background:'none', border:'none', cursor:'pointer', fontSize:14, color: favorites.includes(ex.name) ? T.accent : T.muted, padding:0, lineHeight:1 }}>
                          {favorites.includes(ex.name) ? '★' : '☆'}
                        </button>
                      </div>
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