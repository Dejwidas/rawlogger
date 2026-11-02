'use client'
import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { WITH_NAME, flattenExercise } from '@/lib/exercises'
import Nav from '@/components/Nav'
import CalendarView from '@/components/CalendarView'

const T = { bg:'#0e0e0e',text:'#e8e8e8',accent:'#c8f135' }

async function loadDays(from: string, to: string) {
  const { data, error } = await supabase.from('training_sets').select('date').gte('date',from).lte('date',to)
  if (error) throw error
  return (data ?? []).map((r: any) => r.date as string)
}

async function loadDay(ds: string) {
  const { data: s, error } = await supabase.from('training_sets').select(WITH_NAME).eq('date', ds)
    .order('display_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
  if (error) throw error
  const { data: n } = await supabase.from('training_notes').select('note').eq('date', ds).maybeSingle()
  return { sets: (s ?? []).map(flattenExercise), note: n?.note ?? '' }
}

function CalendarContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/login')
    })
  }, [])

  return (
    <div style={{ background:T.bg, minHeight:'100vh', color:T.text }}>
      <Nav />
      <div style={{ maxWidth:720, margin:'0 auto', padding:'0 0.5rem 2rem' }}>
        <CalendarView initialDay={searchParams.get('day')} loadDays={loadDays} loadDay={loadDay}
          dayAction={(date, hasSets) => (
            <button onClick={() => router.push(`/day/${date}`)}
              style={{ background:T.accent, color:'#111', border:`1px solid ${T.accent}`, borderRadius:7, padding:'5px 14px',
                fontSize:12, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>
              {hasSets ? '✎ edytuj trening' : '+ dodaj trening'}
            </button>
          )} />
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
