'use client'
import { useState } from 'react'
import Link from 'next/link'
import { importPlan, SCORE_HINT, togglePlanVote, type SharedPlan } from '@/lib/sharing'

const T = { surface2:'#222', border:'#2a2a2a', border2:'#383838', text:'#e8e8e8', muted:'#555', muted2:'#888', accent:'#c8f135', danger:'#ff4444' }
const b = (primary: boolean, extra: React.CSSProperties = {}): React.CSSProperties => ({ background:primary?T.accent:'transparent', color:primary?'#111':T.muted2, border:`1px solid ${primary?T.accent:T.border2}`, borderRadius:7, padding:'7px 16px', fontSize:12, cursor:'pointer', fontWeight:primary?600:400, fontFamily:'inherit', textDecoration:'none', display:'inline-block', ...extra })

interface Props {
  plan: SharedPlan
  // null = niezalogowany: zamiast akcji link do logowania
  loginHref: string | null
  onChange: (plan: SharedPlan) => void
  onImported: (planId: string) => void
}

export default function SharedPlanDetails({ plan, loginHref, onChange, onImported }: Props) {
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState('')

  async function vote() {
    setBusy(true); setErr('')
    try {
      const { my_vote, votes } = await togglePlanVote(plan.token)
      onChange({ ...plan, my_vote, votes, score: votes + 2 * plan.imports })
    } catch (e: any) {
      console.error('toggle_plan_vote failed', e)
      setErr(e.message)
    } finally { setBusy(false) }
  }

  async function doImport() {
    setBusy(true); setErr('')
    try {
      onImported(await importPlan(plan.token))
    } catch (e: any) {
      console.error('import_plan failed', e)
      setErr(`Nie zaimportowano: ${e.message}`)
      setBusy(false)
    }
  }

  return (
    <div>
      {plan.exercises.length === 0 && <p style={{ fontSize:12, color:T.muted }}>Plan nie ma jeszcze ćwiczeń.</p>}
      {plan.exercises.map((ex, i) => (
        <div key={i} style={{ display:'flex', gap:8, padding:'6px 0', borderBottom:`1px solid ${T.border}`, fontSize:13 }}>
          <span style={{ fontSize:11, color:T.muted, fontFamily:'monospace', minWidth:20, paddingTop:1 }}>#{i+1}</span>
          <div style={{ flex:1 }}>
            <div style={{ color:T.text }}>{ex.name}</div>
            {ex.note && <div style={{ fontSize:12, color:T.muted2, marginTop:2 }}>{ex.note}</div>}
          </div>
        </div>
      ))}

      <div style={{ fontSize:11, color:T.muted2, margin:'10px 0' }} title={SCORE_HINT}>
        ▲ {plan.votes} · importy {plan.imports} · wynik {plan.score}
      </div>

      {loginHref ? (
        <Link href={loginHref} style={b(true)}>Zaloguj się, aby zaimportować</Link>
      ) : plan.is_mine ? (
        <p style={{ fontSize:12, color:T.muted2 }}>To Twój plan.</p>
      ) : (
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button style={b(true)} onClick={doImport} disabled={busy || plan.exercises.length === 0}>
            {busy ? '...' : '⇩ importuj do moich planów'}
          </button>
          <button style={b(plan.my_vote, { padding:'7px 12px' })} onClick={vote} disabled={busy}>
            ▲ {plan.my_vote ? 'plus dodany' : 'plus'}
          </button>
        </div>
      )}
      {err && <p style={{ fontSize:12, color:T.danger, marginTop:8 }}>{err}</p>}
    </div>
  )
}
