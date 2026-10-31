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

// Zwraca nazwę w zapisie z katalogu. Tworzy brakujące ćwiczenie, a
// zarchiwizowane przywraca, więc wołać przed zapisem serii lub wpisu w planie.
export async function ensureExercise(name: string): Promise<string> {
  const { data, error } = await supabase.rpc('ensure_exercise', { p_name: name })
  if (error) throw error
  return data as string
}
