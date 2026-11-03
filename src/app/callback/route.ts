import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Tylko ścieżki w obrębie aplikacji (jak nextPath na stronie logowania).
function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : null
}

// Wspólny powrót z linków w mailach od Supabase:
//   * reset hasła: bez next, prowadzi do /reset-password (jak dotąd)
//   * potwierdzenie rejestracji: z next (np. /f/<token> z zaproszenia)
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = safeNext(requestUrl.searchParams.get('next'))

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(next ?? '/reset-password', requestUrl.origin))
    }
    // Link potwierdzający otwarty w innej przeglądarce niż rejestracja (np. z
    // aplikacji pocztowej): adres jest już potwierdzony, ale sesji tu nie
    // ma. Wystarczy się zalogować i wrócić tam, skąd przyszło zaproszenie.
    if (next) {
      return NextResponse.redirect(new URL(`/login?info=confirmed&next=${encodeURIComponent(next)}`, requestUrl.origin))
    }
  }

  const back = next ? `&next=${encodeURIComponent(next)}` : ''
  return NextResponse.redirect(new URL(`/login?error=invalid_link${back}`, requestUrl.origin))
}
