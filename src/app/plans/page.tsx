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

export default function PlansPage() {
  const router = useRouter()
  const [email, setEmail]     = useState('')
  const [userId, setUserId]   = useState('')
  const [plans, setPlans]     = useState<Plan[]>([])
  const [editId, setEditId]   = useState<string|null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding]   = useState(false)
  const [confirmDel, setConfirmDel] = useState<string|null>(null)
  const [editContent, setEditContent] = useState('')
  const [showHelp, setShowHelp] = useState(false)

useEffect(() => {
  if (activePlan) setEditContent(activePlan.content ?? '')
}, [editId])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      setEmail(session.user.email ?? '')
      setUserId(session.user.id)
      const { data } = await supabase.from('training_plans').select('*').order('created_at')
      setPlans(data ?? [])
    })
  }, [])

  async function addPlan() {
    const title = newTitle.trim()
    if (!title) return
    const { data, error } = await supabase.from('training_plans')
      .insert({ user_id: userId, title, content: '' }).select().single()
    if (!error && data) {
      setPlans(prev => [...prev, data])
      setEditId(data.id)
    }
    setNewTitle(''); setAdding(false)
  }

  async function updatePlan(id: string, field: 'title'|'content', val: string) {
    await supabase.from('training_plans').update({ [field]: val, updated_at: new Date().toISOString() }).eq('id', id)
    setPlans(prev => prev.map(p => p.id === id ? { ...p, [field]: val } : p))
  }

  async function deletePlan(id: string) {
    await supabase.from('training_plans').delete().eq('id', id)
    setPlans(prev => prev.filter(p => p.id !== id))
    if (editId === id) setEditId(null)
    setConfirmDel(null)
  }

  const activePlan = plans.find(p => p.id === editId)

  return (
    <div style={{ background:T.bg, minHeight:'100vh', color:T.text }}>
      <Nav email={email} />
      <div style={{ maxWidth:720, margin:'0 auto', padding:'0 0.5rem 2rem' }}>

        {/* plan list */}
        <div style={card}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div style={{ fontSize:11, color:T.muted2, textTransform:'uppercase', letterSpacing:'0.04em' }}>Plany treningowe</div>
            <button style={b(false, { padding:'4px 10px', fontSize:11 })} onClick={() => setAdding(!adding)}>
              {adding ? '✕ anuluj' : '+ nowy plan'}
            </button>
          </div>

          {adding && (
            <div style={{ display:'flex', gap:8, marginBottom:12 }}>
              <input style={{ ...inp, flex:1 }} value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Nazwa planu (np. Push, Pull, A, B...)"
                autoFocus onKeyDown={e => { if(e.key==='Enter') addPlan(); if(e.key==='Escape') setAdding(false) }} />
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
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <input value={activePlan.title}
                onChange={e => updatePlan(activePlan.id, 'title', e.target.value)}
                style={{ ...inp, fontSize:15, fontWeight:600, padding:'4px 8px', width:'auto', flex:1, marginRight:8 }} />
              {confirmDel === activePlan.id ? (
                <div style={{ display:'flex', gap:6 }}>
                  <button style={b(false, { padding:'3px 10px', fontSize:11, borderColor:T.danger, color:T.danger })}
                    onClick={() => deletePlan(activePlan.id)}>Usuń</button>
                  <button style={b(false, { padding:'3px 10px', fontSize:11 })} onClick={() => setConfirmDel(null)}>Anuluj</button>
                </div>
              ) : (
                <button style={b(false, { padding:'3px 10px', fontSize:11, borderColor:T.border, color:T.muted })}
                  onClick={() => setConfirmDel(activePlan.id)}>usuń plan</button>
              )}
            </div>
            <div style={lbl}>Notatka</div>
<textarea value={editContent}
  onChange={e => setEditContent(e.target.value)}
  placeholder="Rozpisz swój plan treningowy..."
  style={{ ...inp, minHeight:200, resize:'vertical', lineHeight:1.8, marginTop:4, fontSize:13 }} />
<button style={{ ...b(true, { padding:'6px 16px', fontSize:12, marginTop:8 }) }}
  onClick={() => updatePlan(activePlan.id, 'content', editContent)}>
  Zapisz
</button>
          </div>
        )}
      </div>
    </div>
  )
}
