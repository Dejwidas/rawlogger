import { supabase } from '@/lib/supabase'

// Udostępniany plan to same ćwiczenia z notatkami. Notatka do planu
// zostaje prywatna, a autor jest pseudonimem albo "Anonim".
export interface SharedPlan {
  token: string
  title: string
  is_public: boolean
  author: string | null
  is_mine: boolean
  my_vote: boolean
  votes: number
  imports: number
  score: number
  exercises: { name: string; note: string | null }[]
}

export interface CatalogEntry {
  token: string
  title: string
  author: string | null
  exercises: number
  votes: number
  imports: number
  score: number
  my_vote: boolean
  is_mine: boolean
  published_at: string | null
}

export const NOTE_MAX = 140
export const SCORE_HINT = 'wynik = plusy + 2 × importy'

export const authorLabel = (author: string | null) => author ?? 'Anonim'
export const shareUrl = (token: string) => `${window.location.origin}/p/${token}`
export const newShareToken = () => crypto.randomUUID().replace(/-/g, '')
export const loginHrefFor = (path: string) => `/login?next=${encodeURIComponent(path)}`

export async function getSharedPlan(token: string): Promise<SharedPlan | null> {
  const { data, error } = await supabase.rpc('get_shared_plan', { p_token: token })
  if (error) throw error
  return data as SharedPlan | null
}

export async function loadCatalog(query: string): Promise<CatalogEntry[]> {
  const { data, error } = await supabase.rpc('plan_catalog', { p_query: query.trim() || null })
  if (error) throw error
  return (data ?? []) as CatalogEntry[]
}

export async function togglePlanVote(token: string): Promise<{ my_vote: boolean; votes: number }> {
  const { data, error } = await supabase.rpc('toggle_plan_vote', { p_token: token })
  if (error) throw error
  if (!data?.ok) throw new Error(data?.reason === 'own'
    ? 'Nie możesz dać plusa własnemu planowi.'
    : 'Plan nie jest już udostępniony.')
  return { my_vote: data.my_vote, votes: data.votes }
}

// Zwraca id nowego planu u importującego.
export async function importPlan(token: string): Promise<string> {
  const { data, error } = await supabase.rpc('import_plan', { p_token: token })
  if (error) throw error
  if (!data?.ok) throw new Error('Plan nie jest już udostępniony.')
  return data.plan_id as string
}
