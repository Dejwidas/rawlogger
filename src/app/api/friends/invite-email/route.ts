import nodemailer from 'nodemailer'
import { createSupabaseServerClient } from '@/lib/supabase-server'

// Mail z zaproszeniem do znajomych. Zgodę daje funkcja claim_invite_email
// w bazie (jest zaproszenie, jeden mail na adres, 10 maili na dobę), wołana
// sesją zalogowanej osoby z ciasteczek. Serwer nie ma klucza service_role.
//
// Zmienne środowiskowe: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
// SMTP_FROM (np. "rawlogger <zaproszenia@rawlogger.pl>"), opcjonalnie SITE_URL.

const SITE_URL = process.env.SITE_URL ?? 'https://www.rawlogger.pl'

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Pseudonim wpisuje użytkownik: bez znaków sterujących i z limitem długości.
const cleanName = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 60) || 'Znajomy'

function smtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM)
}

export async function POST(request: Request) {
  let email: string
  try {
    email = String((await request.json())?.email ?? '').trim().toLowerCase()
  } catch {
    return Response.json({ ok: false, reason: 'bad_request' }, { status: 400 })
  }
  if (!email.includes('@') || email.length > 254) {
    return Response.json({ ok: false, reason: 'bad_request' }, { status: 400 })
  }

  if (!smtpConfigured()) {
    console.error('invite-email: brak konfiguracji SMTP')
    return Response.json({ ok: false, reason: 'not_configured' }, { status: 503 })
  }

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ ok: false, reason: 'auth' }, { status: 401 })

  const { data: claim, error } = await supabase.rpc('claim_invite_email', { p_email: email })
  if (error) {
    console.error('claim_invite_email failed', error)
    return Response.json({ ok: false, reason: 'error' }, { status: 500 })
  }
  if (!claim?.ok) return Response.json({ ok: false, reason: claim?.reason ?? 'error' })

  const name = cleanName(claim.name)
  const link = `${SITE_URL}/f/${claim.token}`
  const text = [
    'Cześć!',
    '',
    `${name} zaprasza Cię do znajomych w rawlogger, prostym dzienniku treningowym.`,
    'Jako znajomi będziecie widzieć nawzajem swoje kalendarze treningów (bez notatek).',
    '',
    `Dołącz tutaj: ${link}`,
    '',
    'Jeśli nie masz konta, załóż je pod tym linkiem, a od razu będziecie znajomymi.',
    'Jeśli nie znasz tej osoby, po prostu zignoruj tę wiadomość.',
  ].join('\n')
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#222">
<p>Cześć!</p>
<p><b>${escapeHtml(name)}</b> zaprasza Cię do znajomych w rawlogger, prostym dzienniku treningowym.
Jako znajomi będziecie widzieć nawzajem swoje kalendarze treningów (bez notatek).</p>
<p><a href="${link}" style="display:inline-block;background:#c8f135;color:#111;padding:10px 20px;border-radius:7px;text-decoration:none;font-weight:600">Dołącz do znajomych</a></p>
<p style="font-size:13px;color:#666">Jeśli nie masz konta, załóż je pod tym linkiem, a od razu będziecie znajomymi.<br>
Jeśli nie znasz tej osoby, po prostu zignoruj tę wiadomość.</p>
</div>`

  try {
    const port = Number(process.env.SMTP_PORT ?? 465)
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: `${name} zaprasza Cię do rawlogger`,
      text,
      html,
    })
  } catch (e) {
    console.error('invite-email: wysyłka nieudana', e)
    await supabase.rpc('release_invite_email', { p_email: email })
    return Response.json({ ok: false, reason: 'send_failed' }, { status: 502 })
  }

  return Response.json({ ok: true })
}
