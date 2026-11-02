'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'
import CalendarView from '@/components/CalendarView'
import { friendTrainingDay, friendTrainingDays, getFriend } from '@/lib/friends'

const T = { bg:'#0e0e0e', surface:'#181818', border:'#2a2a2a', text:'#e8e8e8', muted:'#555', muted2:'#888', accent:'#c8f135', danger:'#ff4444' }

// Kalendarz znajomego tylko do odczytu. Baza zwraca serie bez notatek,
// więc CalendarView niczego tu nie ukrywa, po prostu ich nie dostaje.
export default function FriendCalendarPage() {
  const router = useRouter()
  const id = useParams().id as string
  const [friend, setFriend] = useState<{ id: string, name: string } | null | 'missing'>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace(`/login?next=/friends/${id}`); return }
      try { setFriend((await getFriend(id)) ?? 'missing') }
      catch (e: any) { console.error('get_friend failed', e); setErr(e.message) }
    })
  }, [id])

  return (
    <div style={{ background:T.bg, minHeight:'100vh', color:T.text }}>
      <Nav />
      <div style={{ maxWidth:720, margin:'0 auto', padding:'0 0.5rem 2rem' }}>
        <div style={{ display:'flex', alignItems:'baseline', gap:10, marginBottom:10 }}>
          <Link href="/friends" style={{ fontSize:12, color:T.muted2 }}>← Znajomi</Link>
          {friend && friend !== 'missing' && <span style={{ fontSize:15, fontWeight:600 }}>Kalendarz: {friend.name}</span>}
        </div>
        {err && <p style={{ fontSize:12, color:T.danger }}>{err}</p>}
        {friend === null && !err && <p style={{ fontSize:12, color:T.muted }}>Wczytywanie...</p>}
        {friend === 'missing' && <p style={{ fontSize:13 }}>Nie jesteście już znajomymi albo to konto nie istnieje.</p>}
        {friend && friend !== 'missing' && (
          <CalendarView
            loadDays={(from, to) => friendTrainingDays(id, from, to)}
            loadDay={async date => ({ sets: await friendTrainingDay(id, date), note: '' })} />
        )}
      </div>
    </div>
  )
}
