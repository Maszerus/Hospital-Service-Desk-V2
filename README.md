# Hospital-Service-Desk-V2

MediDesk to makieta fikcyjnego szpitalnego Service Desku, napisana w HTML,
CSS i zwykłym JavaScripcie. Przykładowe konta i zgłoszenia są fikcyjne.
Nie ma backendu ani bazy danych.

## Uruchomienie

Otwórz `public/login.html` w przeglądarce. Link „Przejdź do demonstracji”
prowadzi do pulpitu. Interakcje działają lokalnie, bez serwera.

## Sprawdzenie interakcji

- Na stronie „Zgłoszenia” wybierz status „Nowe”, „W trakcie” lub „Zamknięte”.
  Zobaczysz tylko pasujący wiersz. „Wszystkie” przywraca trzy zgłoszenia.
- Na stronie „Nowe zgłoszenie” wyszukaj zgłaszającego, wpisując `Alicja`,
  `Testowy` albo `DEMO-003`. Lista zawęża się odpowiednio do imienia,
  nazwiska lub numeru pracownika. Wielkość liter i polskie znaki nie mają
  znaczenia. Wpisz `brak`, aby sprawdzić komunikat o braku wyników.
  Wyczyść wyszukiwanie, aby ponownie zobaczyć wszystkich pracowników.
- Wyślij pusty formularz nowego zgłoszenia. Pojawi się polski komunikat,
  a focus trafi do pierwszego niepoprawnego pola. Sprawdź także tytuł
  lub opis składający się wyłącznie ze spacji oraz brak zgłaszającego.
- Uzupełnij tytuł i opis, wybierz priorytet i fikcyjnego zgłaszającego.
  Kliknij „Utwórz zgłoszenie (makieta)”. Komunikat potwierdzi wyłącznie
  sprawdzenie formularza. Dane nie są wysyłane ani zapisywane, a lista
  zgłoszeń pozostaje przykładowa.
- Na stronie logowania sprawdź puste pola i błędny e-mail, np. `demo`.
  Następnie wpisz `demo@example.invalid` i dowolne fikcyjne hasło.
  Komunikat informuje, że formularz jest poprawny, ale nie następuje
  logowanie. Do pulpitu przejdź osobnym linkiem.

Walidacja w przeglądarce ułatwia obsługę formularzy i nie jest zabezpieczeniem.
Po dodaniu backendu potrzebna będzie również walidacja na serwerze.
Nie wpisuj prawdziwych haseł, danych pracowników ani danych pacjentów.

## Formatowanie

Po zainstalowaniu zależności poleceniem `npm install` uruchom `npm run format`.
Prettier korzysta z ustawienia `printWidth: 80`.
