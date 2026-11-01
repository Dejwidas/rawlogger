import { supabase } from '@/lib/supabase'

export const normalizeExerciseName = (raw: string) => {
  const name = raw.trim()
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
}

// Katalog do list i autocomplete. Ćwiczenia zarchiwizowane nie są tu
// widoczne, ale ich historia zostaje i można je przywrócić w Zarządzaj.
export async function loadActiveExerciseNames(): Promise<string[]> {
  const { data, error } = await supabase.from('exercises').select('name')
    .is('archived_at', null).order('name')
  if (error) console.error('load exercises failed', error)
  return data?.map((e: any) => e.name as string) ?? []
}

// Tożsamością ćwiczenia jest exercise_id, a nazwa przychodzi z katalogu.
// Wersja inner pozwala filtrować po nazwie: .ilike('exercises.name', ...).
export const WITH_NAME = '*, exercises(name)'
export const WITH_NAME_INNER = '*, exercises!inner(name)'

// Spłaszcza osadzoną nazwę do exercise_name, którego używają widoki.
export function flattenExercise(row: any) {
  const { exercises, ...rest } = row
  return { ...rest, exercise_name: exercises.name as string }
}

// Zwraca wpis z katalogu. Tworzy brakujące ćwiczenie, a zarchiwizowane
// przywraca, więc wołać przed zapisem serii lub wpisu w planie.
export async function ensureExercise(name: string): Promise<{ id: string; name: string }> {
  const { data: canonical, error } = await supabase.rpc('ensure_exercise', { p_name: name })
  if (error) throw error
  const { data, error: readError } = await supabase.from('exercises').select('id, name')
    .eq('name', canonical).single()
  if (readError) throw readError
  return data
}

export async function loadFavoriteNames(): Promise<string[]> {
  const { data, error } = await supabase.from('favorite_exercises').select('exercises(name)')
  if (error) console.error('load favorites failed', error)
  return (data ?? []).map((f: any) => f.exercises.name as string)
    .sort((a, b) => a.localeCompare(b, 'pl'))
}

export async function setFavorite(userId: string, name: string, on: boolean) {
  const { data: ex, error: readError } = await supabase.from('exercises').select('id')
    .eq('name', name).single()
  if (readError) { console.error('favorite lookup failed', readError); return }
  const { error } = on
    ? await supabase.from('favorite_exercises').insert({ user_id: userId, exercise_id: ex.id })
    : await supabase.from('favorite_exercises').delete().eq('user_id', userId).eq('exercise_id', ex.id)
  if (error) console.error('favorite update failed', error)
}
