'use client'
import { useEffect, useState } from 'react'
import SharedPlanDetails from '@/components/SharedPlanDetails'
import { authorLabel, getSharedPlan, loadCatalog, SCORE_HINT, type CatalogEntry, type SharedPlan } from '@/lib/sharing'

const T = { surface:'#181818', surface2:'#222', border:'#2a2a2a', border2:'#383838', text:'#e8e8e8', muted:'#555', muted2:'#888', accent:'#c8f135', danger:'#ff4444' }
const card: React.CSSProperties = { background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:'14px 16px', marginBottom:10 }
const inp: React.CSSProperties = { width:'100%', background:T.surface2, border:`1px solid ${T.border2}`, borderRadius:7, padding:'8px 10px', fontSize:13, color:T.text, fontFamily:'var(--font-sans)', outline:'none', boxSizing:'border-box' }
const b = (primary: boolean, extra: React.CSSProperties = {}): React.CSSProperties => ({ background:primary?T.accent:'transparent', color:primary?'#111':T.muted2, border:`1px solid ${primary?T.accent:T.border2}`, borderRadius:7, padding:'7px 16px', fontSize:12, cursor:'pointer', fontWeight:primary?600:400, fontFamily:'inherit', ...extra })

const plural = (n: number, one: string, few: string, many: string) =>
  n === 1 ? one : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? few : many

export default function PlanCatalog({ onImported }: { onImported: (planId: string) => void }) {
  const [entries, setEntries] = useState<CatalogEntry[] | null>(null)
  const [query, setQuery]     = useState('')
  const [open, setOpen]       = useState<string | null>(null)
  const [details, setDetails] = useState<SharedPlan | null>(null)
  const [err, setErr]         = useState('')

  async function load(q: string) {
    setErr('')
    try {
      setEntries(await loadCatalog(q))
    } catch (e: any) {
      console.error('plan_catalog failed', e)
      setErr(`Nie wczytano katalogu: ${e.message}`)
      setEntries([])
    }
  }

  useEffect(() => { load('') }, [])

  async function toggle(token: string) {
    if (open === token) { setOpen(null); return }
    setOpen(token); setDetails(null)
    try {
      const plan = await getSharedPlan(token)
      if (!plan) { setErr('Ten plan nie jest już w katalogu.'); setOpen(null); await load(query); return }
      setDetails(plan)
    } catch (e: any) {
      console.error('get_shared_plan failed', e)
      setErr(`Nie wczytano planu: ${e.message}`); setOpen(null)
    }
  }

  // Plus zmienia wynik tylko lokalnie; kolejność odświeża się przy następnym wczytaniu.
  function updateDetails(plan: SharedPlan) {
    setDetails(plan)
    setEntries(prev => prev?.map(e => e.token === plan.token
      ? { ...e, votes: plan.votes, score: plan.score, my_vote: plan.my_vote } : e) ?? null)
  }

  return (
    <>
      <div style={card}>
        <div style={{ display:'flex', gap:8 }}>
          <input style={{ ...inp, flex:1 }} value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Szukaj po nazwie planu..." onKeyDown={e => { if (e.key === 'Enter') load(query) }} />
          <button style={b(false, { padding:'7px 14px' })} onClick={() => load(query)}>Szukaj</button>
        </div>
        <p style={{ fontSize:11, color:T.muted, marginTop:8, marginBottom:0 }}>Kolejność: {SCORE_HINT}.</p>
      </div>

      {err && <p style={{ fontSize:12, color:T.danger, margin:'0 0 10px' }}>{err}</p>}
      {entries === null && <p style={{ fontSize:12, color:T.muted }}>Wczytywanie...</p>}
      {entries?.length === 0 && !err && (
        <p style={{ fontSize:12, color:T.muted }}>{query.trim() ? 'Brak planów o tej nazwie.' : 'Katalog jest jeszcze pusty. Opublikuj swój plan w zakładce Moje.'}</p>
      )}

      {entries?.map(e => (
        <div key={e.token} style={card}>
          <div onClick={() => toggle(e.token)} style={{ cursor:'pointer', display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:14, fontWeight:600, color:T.text }}>{e.title}</div>
              <div style={{ fontSize:11, color:T.muted2, marginTop:3 }}>
                {e.is_mine ? 'Twój plan' : authorLabel(e.author)} · {e.exercises} {plural(e.exercises, 'ćwiczenie', 'ćwiczenia', 'ćwiczeń')} · ▲ {e.votes} · importy {e.imports}
              </div>
            </div>
            <div title={SCORE_HINT} style={{ fontSize:15, fontWeight:700, color: e.my_vote ? T.accent : T.text, fontFamily:'monospace' }}>{e.score}</div>
            <span style={{ fontSize:12, color:T.muted2 }}>{open === e.token ? '▴' : '▾'}</span>
          </div>
          {open === e.token && (
            <div style={{ marginTop:12 }}>
              {details?.token === e.token
                ? <SharedPlanDetails plan={details} loginHref={null} onChange={updateDetails} onImported={onImported} />
                : <p style={{ fontSize:12, color:T.muted }}>Wczytywanie...</p>}
            </div>
          )}
        </div>
      ))}
    </>
  )
}
