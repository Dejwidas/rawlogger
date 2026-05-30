export default function PrivacyPage() {
  const T = { bg:'#0e0e0e', surface:'#181818', border:'#2a2a2a', text:'#e8e8e8', muted:'#888', accent:'#c8f135' }
  return (
    <div style={{ background:T.bg, minHeight:'100vh', color:T.text, fontFamily:'system-ui, sans-serif' }}>
      <div style={{ maxWidth:720, margin:'0 auto', padding:'2rem 1rem' }}>
        <a href="/login" style={{ fontSize:12, color:T.muted, textDecoration:'none', display:'block', marginBottom:24 }}>← Powrót</a>
        <p style={{ fontSize:22, fontWeight:700, letterSpacing:'-0.03em', color:T.accent, marginBottom:4 }}>rawlogger</p>
        <h1 style={{ fontSize:18, fontWeight:600, marginBottom:8 }}>Polityka Prywatności</h1>
        <p style={{ fontSize:12, color:T.muted, marginBottom:32 }}>Ostatnia aktualizacja: {new Date().toLocaleDateString('pl-PL')}</p>

        {[
          ['1. Administrator danych', [
            'Administratorem Twoich danych osobowych jest osoba fizyczna prowadząca serwis rawlogger.pl.',
            'Kontakt w sprawach danych osobowych: kontakt@rawlogger.pl',
          ]],
          ['2. Jakie dane zbieramy', [
            'Adres e-mail — niezbędny do założenia i obsługi konta.',
            'Dane treningowe — serie, ciężary, powtórzenia, notatki wprowadzane dobrowolnie przez użytkownika.',
            'Dane techniczne — adres IP, typ przeglądarki, czas wizyty (zbierane automatycznie przez Vercel Analytics w sposób zanonimizowany).',
          ]],
          ['3. Cel i podstawa przetwarzania', [
            'Realizacja umowy o świadczenie usług (art. 6 ust. 1 lit. b RODO) — prowadzenie konta i dziennika treningowego.',
            'Prawnie uzasadniony interes administratora (art. 6 ust. 1 lit. f RODO) — bezpieczeństwo serwisu i analityka.',
          ]],
          ['4. Przechowywanie danych', [
            'Dane przechowywane są na serwerach Supabase (Stany Zjednoczone) zabezpieczonych zgodnie z wymogami RODO.',
            'Supabase jest certyfikowanym podmiotem przetwarzającym dane (DPA dostępne na supabase.com).',
            'Dane przechowujemy przez czas korzystania z konta oraz 30 dni po jego usunięciu.',
          ]],
          ['5. Twoje prawa', [
            'Prawo dostępu do danych — możesz zażądać kopii swoich danych.',
            'Prawo do sprostowania — możesz poprawić nieprawidłowe dane.',
            'Prawo do usunięcia — możesz usunąć konto wraz ze wszystkimi danymi w ustawieniach.',
            'Prawo do przenoszenia danych — możesz otrzymać swoje dane w formacie JSON.',
            'Prawo do wniesienia skargi — do Prezesa Urzędu Ochrony Danych Osobowych (uodo.gov.pl).',
          ]],
          ['6. Pliki cookie i analityka', [
            'Serwis używa Vercel Analytics — narzędzia do anonimowej analityki bez plików cookie.',
            'Vercel Analytics nie śledzi użytkowników między stronami i jest zgodne z RODO.',
            'Do obsługi sesji używamy bezpiecznych tokenów JWT przechowywanych w pamięci przeglądarki.',
          ]],
          ['7. Udostępnianie danych', [
            'Dane nie są sprzedawane ani udostępniane podmiotom trzecim w celach marketingowych.',
            'Podmioty przetwarzające: Supabase Inc. (baza danych), Vercel Inc. (hosting), home.pl (poczta e-mail).',
          ]],
          ['8. Kontakt', [
            'W sprawach dotyczących prywatności: kontakt@rawlogger.pl',
            'Odpowiadamy na zapytania w ciągu 30 dni.',
          ]],
        ].map(([title, items]) => (
          <div key={title as string} style={{ marginBottom:28 }}>
            <h2 style={{ fontSize:14, fontWeight:600, color:T.accent, marginBottom:10 }}>{title as string}</h2>
            {(items as string[]).map((item, i) => (
              <p key={i} style={{ fontSize:13, lineHeight:1.8, color:'#ccc', marginBottom:6, paddingLeft:16, borderLeft:`2px solid ${T.border}` }}>
                {item}
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}