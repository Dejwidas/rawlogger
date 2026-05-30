'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface UserCtx {
  email: string
  nickname: string
  userId: string
  reload: () => void
}

const UserContext = createContext<UserCtx>({ email:'', nickname:'', userId:'', reload:()=>{} })

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [email, setEmail]       = useState('')
  const [nickname, setNickname] = useState('')
  const [userId, setUserId]     = useState('')

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    setEmail(session.user.email ?? '')
    setUserId(session.user.id)
    const { data } = await supabase.from('user_profiles').select('nickname').eq('id', session.user.id).single()
    setNickname(data?.nickname ?? '')
  }

  useEffect(() => { load() }, [])

  return (
    <UserContext.Provider value={{ email, nickname, userId, reload: load }}>
      {children}
    </UserContext.Provider>
  )
}

export const useUser = () => useContext(UserContext)