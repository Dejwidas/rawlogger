'use client'
import { useEffect, useState } from 'react'

const T = { surface:'#181818', border2:'#383838', text:'#e8e8e8', muted2:'#888', accent:'#c8f135' }

// Przeglądarki wbudowane w komunikatory (Messenger itp.) i iPhone nie
// przekazują linków do aplikacji z ekranu głównego, a ma ona osobną sesję.
// Na Androidzie link intent:// bez wskazanej aplikacji oddaje adres systemowi,
// a ten otwiera aplikację z ekranu głównego, jeśli ma ona włączone otwieranie
// linków. Wskazanie Chrome to pomija: Chrome nie przekazuje kart do aplikacji.
// Wszędzie zostaje skopiowanie i wklejenie.
export default function OpenInAppHint({ pasteWhere }: { pasteWhere: string }) {
  const [show, setShow]     = useState(false)
  const [intent, setIntent] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
    setShow(!standalone && window.matchMedia('(pointer: coarse)').matches)
    if (!standalone && /Android/i.test(navigator.userAgent)) {
      setIntent(`intent://${window.location.host}${window.location.pathname}#Intent;scheme=https;end`)
    }
  }, [])

  async function copyHere() {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true) }
    catch (e) { console.error('copy failed', e) }
  }

  if (!show) return null
  return (
    <div style={{ background:T.surface, border:`1px solid ${T.border2}`, borderRadius:10, padding:'14px 16px', marginBottom:10, color:T.text }}>
      <div style={{ fontSize:13, marginBottom:6 }}>Masz rawlogger na ekranie głównym?</div>
      {intent && (
        <a href={intent} style={{ display:'inline-block', background:T.accent, color:'#111', borderRadius:7, padding:'7px 16px', fontSize:12, fontWeight:600, textDecoration:'none', marginBottom:10 }}>
          Otwórz w aplikacji
        </a>
      )}
      <div style={{ fontSize:12, color:T.muted2, marginBottom:10 }}>
        {intent ? 'Jeśli to nie zadziała: ' : ''}skopiuj link, otwórz aplikację i wklej go w {pasteWhere}.
      </div>
      <button onClick={copyHere} style={{ background: intent ? 'transparent' : T.accent, color: intent ? T.muted2 : '#111',
        border: intent ? `1px solid ${T.border2}` : 'none', borderRadius:7, padding:'7px 16px', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
        {copied ? 'Skopiowano ✓' : 'Kopiuj link'}
      </button>
    </div>
  )
}
