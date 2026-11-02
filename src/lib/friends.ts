import { supabase } from '@/lib/supabase'

// Podpis znajomego to zawsze pseudonim albo stała nazwa zwierzę_numer
// z bazy (display_name). E-maile innych osób nigdy tu nie trafiają.
export interface Friend { id: string; name: string; since: string }
export interface FriendOverview {
  friends: Friend[]
  incoming: { id: string; name: string }[]
  outgoing: { id: string; email: string }[]
}
export interface FriendInvite { name: string; is_self: boolean; already_friends: boolean }

export const inviteUrl = (token: string) => `${window.location.origin}/f/${token}`

export async function loadFriendOverview(): Promise<FriendOverview> {
  const { data, error } = await supabase.rpc('friend_overview')
  if (error) throw error
  return data as FriendOverview
}

export async function friendRequestCount(): Promise<number> {
  const { data, error } = await supabase.rpc('friend_request_count')
  if (error) throw error
  return data as number
}

// Ta sama odpowiedź bez względu na to, czy adres ma konto.
export async function sendFriendRequest(email: string): Promise<string> {
  const { data, error } = await supabase.rpc('send_friend_request', { p_email: email })
  if (error) throw error
  if (!data?.ok) {
    if (data?.reason === 'self') throw new Error('To Twój adres.')
    if (data?.reason === 'limit') throw new Error('Masz już 50 wysłanych zaproszeń. Anuluj część, żeby wysłać kolejne.')
    throw new Error('To nie wygląda na adres e-mail.')
  }
  if (data.status === 'accepted') return 'Ta osoba już Cię zaprosiła, więc jesteście znajomymi.'
  if (data.status === 'already_friends') return 'Już jesteście znajomymi.'
  return 'Zaproszenie wysłane. Gdy ta osoba założy konto lub się zaloguje, zobaczy je u siebie.'
}

export async function respondFriendRequest(id: string, accept: boolean) {
  const { data, error } = await supabase.rpc('respond_friend_request', { p_id: id, p_accept: accept })
  if (error) throw error
  if (!data?.ok) throw new Error('Zaproszenie zostało już wycofane.')
}

export async function cancelFriendRequest(id: string) {
  const { error } = await supabase.rpc('cancel_friend_request', { p_id: id })
  if (error) throw error
}

export async function removeFriend(id: string) {
  const { error } = await supabase.rpc('remove_friend', { p_friend: id })
  if (error) throw error
}

export async function getInviteToken(reset = false): Promise<string> {
  const { data, error } = await supabase.rpc('get_friend_invite_link', { p_reset: reset })
  if (error) throw error
  return data as string
}

export async function getFriendInvite(token: string): Promise<FriendInvite | null> {
  const { data, error } = await supabase.rpc('get_friend_invite', { p_token: token })
  if (error) throw error
  return data as FriendInvite | null
}

export async function acceptFriendInvite(token: string): Promise<'accepted' | 'already_friends'> {
  const { data, error } = await supabase.rpc('accept_friend_invite', { p_token: token })
  if (error) throw error
  if (!data?.ok) throw new Error(data?.reason === 'self'
    ? 'To Twój własny link.'
    : 'Ten link wygasł. Poproś o nowy.')
  return data.status
}

export async function getFriend(id: string): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase.rpc('get_friend', { p_friend: id })
  if (error) throw error
  return data
}

export async function friendTrainingDays(id: string, from: string, to: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('friend_training_days', { p_friend: id, p_from: from, p_to: to })
  if (error) throw error
  return (data ?? []) as string[]
}

export async function friendTrainingDay(id: string, date: string): Promise<any[]> {
  const { data, error } = await supabase.rpc('friend_training_day', { p_friend: id, p_date: date })
  if (error) throw error
  return (data ?? []) as any[]
}
