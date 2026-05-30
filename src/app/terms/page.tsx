export default function TermsPage() {
  const T = { bg:'#0e0e0e', surface:'#181818', border:'#2a2a2a', text:'#e8e8e8', muted:'#888', accent:'#c8f135' }
  return (
    <div style={{ background:T.bg, minHeight:'100vh', color:T.text, fontFamily:'system-ui, sans-serif' }}>
      <div style={{ maxWidth:720, margin:'0 auto', padding:'2rem 1rem' }}>
        <a href="/login" style={{ fontSize:12, color:T.muted, textDecoration:'none', display:'block', marginBottom:24 }}>← Powrót</a>
        <p style={{ fontSize:22, fontWeight:700, letterSpacing:'-0.03em', color:T.accent, marginBottom:4 }}>rawlogger</p>
        <h1 style={{ fontSize:18, fontWeight:600, marginBottom:8 }}>Regulamin korzystania z serwisu</h1>
        <p style={{ fontSize:12, color:T.muted, marginBottom:32 }}>Ostatnia aktualizacja: {new Date().toLocaleDateString('pl-PL')}</p>

        {[
          ['§1. Postanowienia ogólne', [
            'Serwis rawlogger dostępny pod adresem rawlogger.pl (dalej: „Serwis") prowadzony jest przez osobę fizyczną (dalej: „Administrator").',
            'Korzystanie z Serwisu oznacza akceptację niniejszego Regulaminu.',
            'Serwis umożliwia prowadzenie osobistego dziennika treningowego.',
          ]],
          ['§2. Rejestracja i konto', [
            'Korzystanie z Serwisu wymaga założenia konta przy użyciu adresu e-mail i hasła.',
            'Użytkownik zobowiązany jest do podania prawdziwych danych oraz zachowania hasła w poufności.',
            'Konto jest przypisane do konkretnej osoby i nie może być udostępniane osobom trzecim.',
            'Administrator zastrzega sobie prawo do usunięcia konta, które narusza postanowienia Regulaminu.',
          ]],
          ['§3. Zasady korzystania', [
            'Serwis przeznaczony jest wyłącznie do osobistego, niekomercyjnego użytku.',
            'Zabrania się wykorzystywania Serwisu do celów niezgodnych z prawem.',
            'Użytkownik ponosi odpowiedzialność za treści wprowadzane do Serwisu.',
          ]],
          ['§4. Dane i prywatność', [
            'Zasady przetwarzania danych osobowych określa Polityka Prywatności dostępna pod adresem rawlogger.pl/privacy.',
            'Dane treningowe użytkownika są przechowywane na serwerach Supabase (supabase.com) zgodnie z ich polityką prywatności.',
            'Administrator nie sprzedaje ani nie udostępnia danych użytkowników osobom trzecim.',
          ]],
          ['§5. Dostępność serwisu', [
            'Administrator dokłada starań, aby Serwis był dostępny nieprzerwanie, jednak nie gwarantuje 100% dostępności.',
            'Administrator zastrzega sobie prawo do przerw technicznych oraz modyfikacji funkcjonalności Serwisu.',
            'Serwis jest udostępniany w stanie „takim, jaki jest" bez jakichkolwiek gwarancji.',
          ]],
          ['§6. Usunięcie konta', [
            'Użytkownik może w każdej chwili usunąć konto z poziomu ustawień Serwisu.',
            'Usunięcie konta powoduje trwałe usunięcie wszystkich danych treningowych użytkownika.',
            'Administrator może usunąć konto po 24 miesiącach braku aktywności.',
          ]],
          ['§7. Zmiany Regulaminu', [
            'Administrator zastrzega sobie prawo do zmiany Regulaminu.',
            'O istotnych zmianach użytkownicy będą informowani drogą e-mailową.',
            'Dalsze korzystanie z Serwisu po wprowadzeniu zmian oznacza ich akceptację.',
          ]],
          ['§8. Kontakt', [
            'W sprawach związanych z Regulaminem prosimy o kontakt pod adresem: kontakt@rawlogger.pl',
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