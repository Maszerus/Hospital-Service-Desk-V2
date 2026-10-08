# Hospital-Service-Desk-V2

MediDesk to lokalny, demonstracyjny szpitalny Service Desk. Frontend korzysta
z HTML, CSS i zwykłego JavaScriptu, backend z Express, a dane z SQLite.
Wszyscy pracownicy, konta i zgłoszenia są fikcyjne.

## Uruchomienie

Wymagany jest Node.js 24.x i npm. SQLite pochodzi z modułu `node:sqlite`
wbudowanego w Node.js; nie trzeba instalować osobnego serwera bazy.

```powershell
npm install
npm run db:init
npm start
```

Otwórz http://127.0.0.1:3000/login.html. Serwer nasłuchuje wyłącznie
na `127.0.0.1`. Frontendu nie otwieramy już bezpośrednio jako pliku HTML.

Konto demonstracyjne: `demo01@example.invalid` (Alicja Przykładowa).
Hasło jest generowane przy każdym starcie i wyświetlane w terminalu.
Nie jest zapisywane w kodzie ani w bazie. Opcjonalnie można podać własne
fikcyjne hasło przez zmienną środowiskową `MEDIDESK_DEMO_PASSWORD`
(12–200 znaków). Nie używaj rzeczywistych haseł i nie zapisuj tej zmiennej
w plikach repozytorium. Port można zmienić zmienną `PORT`.

Sesje są przechowywane w pamięci i wygasają po godzinie. Restart serwera
usuwa sesje i zmienia wygenerowane hasło. Dane zgłoszeń pozostają w SQLite.
To demonstracyjny mechanizm logowania do lokalnego laboratorium.

## Baza danych

Domyślny plik to `data/medidesk.sqlite`. Serwer inicjalizuje brakującą bazę
automatycznie. `npm run db:init` tworzy tabele i trzy przykładowe zgłoszenia
bez resetowania istniejących danych.

Aby przywrócić fikcyjne dane początkowe, zatrzymaj serwer (Ctrl+C), a potem:

```powershell
npm run db:reset
npm start
```

Reset usuwa wszystkie lokalne zgłoszenia i pracowników z tej bazy,
a następnie odtwarza trzy fikcyjne konta pracowników i trzy zgłoszenia.
Opcjonalna zmienna `MEDIDESK_DB_PATH` wskazuje inny plik SQLite, zarówno
dla serwera, jak i skryptów inicjalizacji i resetu.

`data/` i `node_modules/` są lokalnie pomijane przez wpisy
w `.git/info/exclude`. Plik `.gitignore` nie został zmieniony.
Przy nowym klonowaniu należy również wykluczyć te katalogi lokalnie
przed dodaniem plików do commita.

## Sprawdzenie działania

1. Zaloguj się kontem demonstracyjnym i hasłem z terminala.
2. Na pulpicie i stronie „Zgłoszenia” zobacz dane odczytane z bazy.
   Wybierz status, aby zawęzić listę.
3. W „Nowym zgłoszeniu” wyszukaj `Przykładowa`, `Testowy` lub `DEMO-003`.
   Wyszukiwanie obsługuje też imię, fragment tekstu, wielkość liter
   i wpisy bez polskich znaków. Wybierz pracownika z listy.
4. Sprawdź pusty formularz i tekst składający się ze spacji.
   Tytuł musi mieć 1–120 znaków, a opis 1–5000 znaków.
5. Uzupełnij formularz, wybierz priorytet i zgłaszającego, a następnie
   kliknij „Utwórz zgłoszenie”. Zgłoszenie zapisuje się w SQLite.
6. Otwórz jego szczegóły z listy. Zmień status i odśwież stronę,
   aby potwierdzić trwały zapis. Restart serwera zachowuje zgłoszenie.
7. Kliknij „Wyloguj się”. API danych wymaga ponownego zalogowania.

Walidacja przeglądarkowa ułatwia obsługę i nie jest zabezpieczeniem.
Serwer niezależnie sprawdza dane i używa parametryzowanych zapytań SQL.
Nie wpisuj danych pacjentów ani prawdziwych danych pracowników.

Sesja używa ciasteczka HttpOnly i SameSite=Strict. Operacje zmieniające
dane, w tym logowanie, wymagają JSON i tokenu CSRF w nagłówku
`X-CSRF-Token`. Token jest pobierany z `GET /api/session` i zmieniany
przy logowaniu. Serwer sprawdza też nagłówek Origin, jeśli jest obecny.
Nie dodano trybu podatnego. Ciasteczko nie ma flagi Secure, ponieważ
laboratorium działa wyłącznie na lokalnym HTTP.

## API

Wszystkie odpowiedzi API są w JSON. Poza sesją i logowaniem endpointy
wymagają zalogowania.

| Metoda | Endpoint                      | Działanie                                            |
| ------ | ----------------------------- | ---------------------------------------------------- |
| GET    | /api/session                  | Bieżący użytkownik i token CSRF                      |
| POST   | /api/login                    | Logowanie: email, password                           |
| POST   | /api/logout                   | Zakończenie sesji                                    |
| GET    | /api/employees?search=Testowy | Wyszukiwanie pracowników                             |
| GET    | /api/tickets                  | Lista zgłoszeń                                       |
| GET    | /api/tickets/:id              | Szczegóły zgłoszenia                                 |
| POST   | /api/tickets                  | Utworzenie: title, description, priority, reporterId |
| PATCH  | /api/tickets/:id/status       | Zmiana: status                                       |

Priorytety: `low`, `medium`, `high`. Statusy: `new`, `progress`, `closed`.
`reporterId` jest dodatnią liczbą całkowitą wskazującą pracownika w bazie.

## Testy i formatowanie

```powershell
npm test
npm run format
```

Test integracyjny uruchamia własny serwer na `127.0.0.1` i korzysta
z oddzielnej tymczasowej bazy. Sprawdza sesję, walidację serwerową,
ochronę CSRF, wyszukiwanie, zapis i odczyt, zmianę statusu, trwałość
po restarcie, wylogowanie i reset. Nie zmienia bazy użytkownika.

Prettier korzysta z ustawienia `printWidth: 80`.

Dokumentacja wykorzystanych mechanizmów:
[SQLite w Node.js 24](https://nodejs.org/docs/latest-v24.x/api/sqlite.html),
[Express](https://expressjs.com/en/5x/api/),
[express-session](https://expressjs.com/en/resources/middleware/session/).
