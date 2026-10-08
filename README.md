# MediDesk — instrukcja demonstracji

MediDesk to lokalny szpitalny Service Desk: HTML, CSS i JavaScript,
Express oraz SQLite w Node.js 24.x. Wszystkie zgłoszenia i zgłaszający
są fikcyjni. Jedyny zatwierdzony wyjątek to cztery konta członków zespołu
projektowego, używane za ich zgodą. Aplikacja nie wysyła poczty.

Instrukcja opisuje backend w `server.js`, `database.js` i katalogach
warstw poniżej, frontend w `public/` oraz testy w `lab/` i `tests/`.
Wykonuj testy 1–10 po kolei. Przed niezależnym powtórzeniem testu wykonaj
jego przygotowanie i reset. Polecenia terminalowe są dla PowerShell
uruchomionego w głównym katalogu repozytorium.

## Struktura backendu i odpowiedzialność warstw

```text
server.js
database.js
config/
  server.js
  database.js
routes/
  apiRoutes.js
controllers/
  apiController.js
services/
  peopleService.js
  ticketService.js
  demoService.js
  validation.js
repositories/
  peopleRepository.js
  ticketRepository.js
  databaseRepository.js
middleware/
  security.js
  lab.js
  errors.js
scripts/
  init-db.js
public/                     frontend bez zmian
lab/                        osobna lokalna strona i serwer testu CSRF
tests/
  server.test.js
  browser.test.py
```

| Warstwa                        | Odpowiedzialność                                                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routes/apiRoutes.js`          | Przypisuje metody i ścieżki do kontrolera, wskazuje wymóg zalogowania. Nie zawiera SQL ani reguł biznesowych.                                                             |
| `controllers/apiController.js` | Odczytuje body, query i parametry; wywołuje serwisy; przygotowuje JSON, status HTTP i obsługuje cykl sesji logowania/wylogowania.                                         |
| `services/peopleService.js`    | Waliduje logowanie i wyszukiwanie, sprawdza hasło, tworzy hashe, udostępnia agentów bez hashy.                                                                            |
| `services/ticketService.js`    | Waliduje zgłoszenie, zgłaszającego, agenta i status. Zezwala na usuwanie tylko zamkniętych zgłoszeń.                                                                      |
| `services/demoService.js`      | Przygotowuje dane inicjalizacyjne, stały wpis XSS i jego hash CSP oraz waliduje wybór wariantu.                                                                           |
| `services/validation.js`       | Wspólne sprawdzenie identyfikatorów i zgłaszanie błędów walidacji/reguł do obsługi HTTP.                                                                                  |
| `repositories/`                | Wykonuje parametryzowane zapytania SQLite. `databaseRepository.js` tworzy/migruje schemat i zapisuje dane początkowe; pozostałe repozytoria obsługują osoby i zgłoszenia. |
| `middleware/security.js`       | Kontrola Host, sesja, wymóg zalogowania, token CSRF, Origin i format danych API.                                                                                          |
| `middleware/lab.js`            | Sprawdza wariant z sesji, wybiera dozwolone renderowanie opisu i ustawia CSP; utrzymuje identyfikator stałego wpisu testowego.                                            |
| `middleware/errors.js`         | Wspólne odpowiedzi dla braku endpointu/strony i błędów; nie ujawnia wewnętrznych błędów SQLite.                                                                           |
| `config/`                      | Czyta i sprawdza ustawienia nasłuchu, portu, TLS, hasła demonstracyjnego i ścieżki bazy. HOST jest sprawdzany przed otwarciem bazy przez serwer.                          |

`server.js` łączy warstwy, inicjalizuje bazę i laboratorium oraz uruchamia
i zamyka serwer. `database.js` utrzymuje pojedyncze połączenie SQLite,
tworzy katalog bazy i ustawia PRAGMA; nie obsługuje zgłoszeń ani HTTP.
`scripts/init-db.js` używa tego samego serwisu inicjalizacji co aplikacja.

Przepływ zwykłego żądania to **middleware → route → controller → service
→ repository → SQLite**, a odpowiedź wraca przez kontroler.
Nie ma fabryk, kontenera zależności ani nowych bibliotek.

Kolejność middleware zachowuje kontrolę Host, parsowanie body,
sesję, CSP i kontrolę CSRF przed routerem. Wyjątek CSRF w BEFORE nadal
dotyczy wyłącznie POST/PATCH `/api/tickets/:id/status`. Usuwanie w obu
wariantach przechodzi pełną ochronę CSRF; serwis sprawdza status,
a SQL dodatkowo zawiera `WHERE id = ? AND status = 'closed'`.
AFTER i zwykły start wstawiają opis jako tekst. Ścieżki API, interfejs,
polecenia startu i resetowania oraz zakres demonstracji nie zmieniły się.

## Przygotowanie wspólne

### Wymagania i konta

Potrzebne są Node.js 24.x, npm i aktualna przeglądarka z DevTools.
Test HTTPS dodatkowo wymaga OpenSSL. Nie otwieraj stron przez
`file://` ani `localhost`; używaj dokładnie `127.0.0.1`.

| Agent                  | Konto demonstracyjne       |
| ---------------------- | -------------------------- |
| Przemysław Rozmanowski | p.rozmanowski@jakotako.com |
| Jaromir Malina         | j.malina@jakotako.com      |
| Daniel Pejs            | d.pejs@jakotako.com        |
| Adrian Szymczyk        | a.szymczyk@jakotako.com    |

W każdym teście loguj się jako **p.rozmanowski@jakotako.com**, chyba że
krok każe sprawdzić pozostałe konta. Hasło pobierz z terminala aplikacji,
z wiersza „Hasło na czas tego uruchomienia”. Jest wspólne dla czterech
agentów, generowane przy starcie, a w SQLite zapisane jako osobne solone
hashe scrypt. Restart unieważnia sesje i zmienia wygenerowane hasło.

Usuń odziedziczoną zmienną `MEDIDESK_DEMO_PASSWORD` według poleceń niżej,
aby otrzymywać hasło z terminala. Opcjonalne własne hasło demonstracyjne
można podać tą zmienną (12–200 znaków), ale nie zapisuj go w repozytorium.

### A. Oddzielna baza i pełny reset prezentacji

1. Zatrzymaj działające serwery MediDesk i strony CSRF przez Ctrl+C.
2. W terminalu A wykonaj:

```powershell
node --version
npm --version
npm ci
$env:HOST = "127.0.0.1"
$env:PORT = "3000"
$env:MEDIDESK_DB_PATH = Join-Path $env:LOCALAPPDATA "MediDesk\presentation.sqlite"
Remove-Item Env:MEDIDESK_DEMO_PASSWORD -ErrorAction SilentlyContinue
Remove-Item Env:MEDIDESK_TLS_CERT, Env:MEDIDESK_TLS_KEY -ErrorAction SilentlyContinue
npm run db:reset
```

Reset usuwa dane **wyłącznie wskazanej bazy prezentacyjnej**, a następnie
odtwarza zgłaszających, agentów i trzy zgłoszenia. Nie wykonuj go na bazie,
której dane chcesz zachować. Alternatywnie `npm run db:init` inicjalizuje
bazę i migruje stare dane bez usuwania istniejących zgłoszeń.
Bez `MEDIDESK_DB_PATH` aplikacja używa `data/medidesk.sqlite`.

Po pełnym resecie dane są następujące:

| Zgłoszenie | Tytuł                      | Status                 | Zgłaszający                  |
| ---------- | -------------------------- | ---------------------- | ---------------------------- |
| MD-001     | Drukarka nie drukuje       | W trakcie (`progress`) | Alicja Przykładowa, DEMO-001 |
| MD-002     | Prośba o dostęp do folderu | Nowe (`new`)           | Bartosz Testowy, DEMO-002    |
| MD-003     | Wymiana klawiatury         | Zamknięte (`closed`)   | Celina Fikcyjna, DEMO-003    |

Zgłoszenia początkowo nie mają przypisanego agenta. Fikcyjni pracownicy
nie mają kont logowania. Laboratorium dodaje jeden wpis
„LAB: kontrolowany przykład XSS”; jego numer odczytuj z linku
„Przykład XSS” lub `GET /api/session`, pole `lab.ticketId`.
Po świeżym resecie będzie to MD-004; w zachowanej bazie numer może być inny.
Nie usuwaj MD-001 ani wpisu XSS podczas prezentacji.

### B. Uruchomienie laboratorium HTTP

Po przygotowaniu A, w tym samym terminalu A:

```powershell
$env:LAB_MODE = "1"
$env:HOST = "127.0.0.1"
$env:PORT = "3000"
Remove-Item Env:MEDIDESK_TLS_CERT, Env:MEDIDESK_TLS_KEY -ErrorAction SilentlyContinue
npm start
```

1. Otwórz http://127.0.0.1:3000/login.html.
2. Wpisz konto `p.rozmanowski@jakotako.com` i hasło z bieżącego terminala.
3. Kliknij „Zaloguj się”. Otworzy się `dashboard.html`.
4. Potwierdź baner „Lokalne laboratorium — używaj wyłącznie fikcyjnych danych”
   i domyślnie wybrany „LAB: AFTER”.
5. Przełączaj wariant przyciskami „LAB: BEFORE” / „LAB: AFTER”.
   Po kliknięciu poczekaj na przeładowanie strony.

Przełącznik wykonuje `POST /api/lab/mode` z JSON
`{"variant":"BEFORE"}` albo `{"variant":"AFTER"}`,
nagłówkami `Content-Type: application/json`, `X-CSRF-Token`
i ciasteczkiem bieżącej sesji. Stan jest sprawdzany na serwerze i zapisany
w sesji; parametr URL go nie zmienia. Karty tej samej sesji współdzielą
wariant, ale po zmianie odśwież pozostałe strony przed oceną ich wyglądu.

### C. Lokalna strona CSRF — drugi terminal

W terminalu B, również w katalogu repozytorium:

```powershell
$env:LAB_MODE = "1"
$env:HOST = "127.0.0.1"
$env:CSRF_PORT = "3001"
$env:MEDIDESK_TARGET_ORIGIN = "http://127.0.0.1:3000"
Remove-Item Env:MEDIDESK_TLS_CERT, Env:MEDIDESK_TLS_KEY -ErrorAction SilentlyContinue
npm run lab:csrf
```

Otwórz http://127.0.0.1:3001 w drugiej karcie **tej samej przeglądarki
i profilu**, w którym jesteś zalogowany do MediDesk. Sprawdź komunikat
„Cel testu: http://127.0.0.1:3000. Wybierz brak lub błędny token.”.
Strona testowa nie wymaga osobnego logowania. Wynik formularza otwiera
się w nowej karcie; pozwól tej lokalnej stronie otworzyć ją, jeśli
przeglądarka blokuje nowe karty.

Porty 3000 i 3001 to różne originy, ale ten sam site przy tym samym
protokole i hoście. Dlatego SameSite=Strict nie blokuje tej konkretnej
lokalnej próby. Nie dodajemy CORS ani żądań do zewnętrznych serwerów.

### D. DevTools, żądania i dowody

1. Na stronie aplikacji naciśnij F12.
2. Otwórz **Network**, zaznacz **Preserve log** i **Disable cache**.
3. Przy operacji wybierz odpowiedni request. W **Headers** sprawdź
   Request URL, Request Method, Status Code, Request Headers i Response
   Headers. W **Payload** sprawdź dane, w **Response** odpowiedź JSON.
4. Dla strony testowej CSRF otwórz DevTools również w jej karcie przed
   wysłaniem formularza. Jeśli przeglądarka nie zachowa żądania nowej
   karty, w DevTools ustaw automatyczne otwieranie narzędzi dla nowych
   okien/kart (Chrome: F1 → Preferences → Global →
   „Auto-open DevTools for popups”) i wyślij ponownie po resecie.
5. Wynik requestu potwierdzaj **nowym GET i odświeżeniem szczegółów**,
   nie samym komunikatem formularza.

W dowodach zakrywaj hasło, wartości `Cookie`, `Set-Cookie`,
`X-CSRF-Token` oraz `csrfToken` w odpowiedzi sesji/logowania.
Zachowuj nazwy i flagi nagłówków. Nie dołączaj nieoczyszczonych HAR,
kluczy, certyfikatów ani plików SQLite.

Poniższy pomocnik wklej do zakładki **Console** na zalogowanej stronie
**http://127.0.0.1:3000**, nie na stronie CSRF. Po nawigacji lub
przeładowaniu wklej go ponownie, jeśli konsola utraci definicję.
Przy HTTPS używaj konsoli na **https://127.0.0.1:3000**.

```javascript
async function demoRequest(url, method = "GET", body, tokenMode = "valid") {
  const headers = {};
  if (method !== "GET") {
    headers["Content-Type"] = "application/json";
    if (tokenMode === "valid") {
      const session = await fetch("/api/session").then((result) =>
        result.json(),
      );
      headers["X-CSRF-Token"] = session.csrfToken;
    } else if (tokenMode === "invalid") {
      headers["X-CSRF-Token"] = "invalid-lab-token";
    }
  }
  const response = await fetch(url, {
    method,
    credentials: "same-origin",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (data && "csrfToken" in data) data.csrfToken = "[UKRYTO]";
  console.log({ status: response.status, data });
  return { status: response.status, data };
}
```

Pomocnik jest kodem do ręcznego testu, nie nowym endpointem aplikacji.
`tokenMode="missing"` pomija nagłówek, `"invalid"` wysyła stały błędny
token, a domyślny `"valid"` pobiera aktualny token w pamięci przeglądarki.
Nie wypisuje poprawnego tokenu ani cookies. Przeglądarka sama wysyła
ciasteczko `medidesk.sid` i właściwy Origin dla operacji zmieniających dane.
Każdy pokazany niżej kod konsoli wykonuj na originie aplikacji.

### E. Reset MD-001 między próbami

1. Otwórz http://127.0.0.1:3000/ticket-details.html?id=1.
2. Wybierz „LAB: AFTER”, w polu „Status zgłoszenia” wybierz „W trakcie”.
3. Kliknij „Zapisz status”, poczekaj na „Zapisano nowy status zgłoszenia.”.
4. W Network potwierdź `PATCH /api/tickets/1/status`, HTTP 200,
   JSON `{"status":"progress"}` i obecność `X-CSRF-Token`.
5. Odśwież stronę. W szczegółach musi nadal być „W trakcie”.
6. Na stronie CSRF przywróć numer `1`, „Zamknięte”, „Bez tokenu”.
   Zamknij poprzednie karty odpowiedzi.

To reset pojedynczej próby, bez restartu i utraty sesji.
Pełny reset to ponownie A, następnie B i logowanie nowym hasłem.

## 1. XSS BEFORE — wykonanie nieszkodliwego komunikatu

**Przygotowanie i start:** A + B; zaloguj konto
`p.rozmanowski@jakotako.com`. Strona CSRF z C nie jest potrzebna.

1. Na pulpicie wybierz „LAB: AFTER” i kliknij „Przykład XSS”.
2. Zanotuj numer wpisu i adres `ticket-details.html?id=...`.
   Nie twórz własnego payloadu ani nie zmieniaj opisu.
3. Otwórz DevTools według D. Kliknij „LAB: BEFORE” i poczekaj
   na przeładowanie.
4. Pojawi się alert **„LAB XSS: nieszkodliwy komunikat demonstracyjny.”**.
   Zrób zrzut z numerem zgłoszenia, banerem i wybranym BEFORE; zamknij alert.
5. W Network sprawdź `GET /api/tickets/<numer z linku>`, HTTP 200:
   `descriptionRendering` ma wartość `"html"`. W Elements element
   `#ticket-description` zawiera rzeczywisty element `img`.
6. Sprawdź lokalne żądanie `GET /lab/xss-demo-missing-image`, HTTP 404.
   To zamierzony brak obrazu, który uruchamia stały handler `onerror`.

**Ten sam wpis używany w obu wariantach:**

```html
<img
  src="/lab/xss-demo-missing-image"
  alt="Demonstracja XSS"
  onerror="alert('LAB XSS: nieszkodliwy komunikat demonstracyjny.')"
/>
```

GET nie wymaga nagłówka CSRF ani body; wymaga zalogowanej sesji.
Wyjątek HTML dotyczy tylko tego wpisu, jego identyfikatora i dokładnego
opisu sprawdzanych przez serwer. Nie odczytuje cookies ani danych,
nie wykonuje połączeń zewnętrznych.

**Potwierdzenie:** alert i element `img`, a nie wyłącznie etykieta BEFORE.
**Reset:** kliknij „LAB: AFTER”; pozostaw wpis i opis bez zmian.
**Dowód:** zrzut alertu, JSON z `descriptionRendering: "html"`,
lokalny request obrazu 404 i nagłówek CSP dokumentu (test 6).

## 2. XSS AFTER — ten sam wpis jako tekst

**Przygotowanie i start:** A + B albo kontynuuj test 1 bez resetowania
bazy. Zalogowane konto: `p.rozmanowski@jakotako.com`.

1. Otwórz ten sam wpis linkiem „Przykład XSS”.
2. Kliknij „LAB: AFTER”. W opisie zobacz dosłowny znacznik z testu 1;
   alert nie może się pojawić.
3. Odśwież stronę. W Network sprawdź
   `GET /api/tickets/<ten sam numer>`, HTTP 200,
   `descriptionRendering: "text"` i niezmieniony opis.
4. W Elements sprawdź `#ticket-description`: opis jest węzłem tekstowym,
   bez potomnego elementu `img`. W Console możesz wykonać:

```javascript
document.querySelector("#ticket-description").childElementCount;
```

Wynik to `0`.

5. Dopisz `&variant=BEFORE` do bieżącego adresu szczegółów i naciśnij Enter.
   AFTER i tekstowy opis mają pozostać aktywne. Potwierdź przez
   `GET /api/session?variant=BEFORE` (pomocnik D): `lab.variant` to AFTER.
6. Nie oceniaj braku wykonania tylko po braku alertu: potwierdź tekst
   w DOM i odpowiedź API, ponieważ sam CSP również może blokować skrypt.

**Reset:** usuń dodatkowy parametr URL; pozostaw AFTER i niezmieniony opis.
Aby ponowić porównanie, wróć do testu 1, bez dodawania kolejnego wpisu.
**Dowód:** zrzut literalnego opisu z tym samym numerem co BEFORE,
JSON `descriptionRendering: "text"`, DOM bez `img`, wynik próby URL.
Strona CSRF nie uczestniczy w tym teście.

## 3. CSRF BEFORE — zmiana statusu bez tokenu

**Przygotowanie i start:** A + B + C, konto
`p.rozmanowski@jakotako.com`; wykonaj reset E.

1. W MediDesk na http://127.0.0.1:3000/ticket-details.html?id=1
   sprawdź „W trakcie”, następnie kliknij „LAB: BEFORE”.
2. Na http://127.0.0.1:3001 ustaw „Numer zgłoszenia” = `1`,
   „Nowy status” = „Zamknięte”, „Token CSRF” = „Bez tokenu”.
3. Przygotuj Network według D. Kliknij „Wyślij próbę CSRF”.
4. Nowa karta pokaże odpowiedź HTTP 200 z `id: 1`, `status: "closed"`.
   Żądanie ma następującą strukturę:

```http
POST /api/tickets/1/status
Origin: http://127.0.0.1:3001
Content-Type: application/x-www-form-urlencoded

status=closed
```

Przeglądarka dołącza bieżącą sesję, lecz request nie ma
`X-CSRF-Token` ani pola `csrfToken`. Nie kopiuj cookies do README/raportu.

5. Odśwież szczegóły MD-001 w MediDesk. Status musi być „Zamknięte”.
   Dodatkowo w konsoli aplikacji, po wklejeniu pomocnika D, wykonaj:

```javascript
await demoRequest("/api/tickets/1");
```

Oczekuj HTTP 200, `status: "closed"`. To potwierdza rzeczywisty zapis.

**Reset:** zamknij odpowiedź; wykonaj E, potwierdzając `progress`.
**Dowód:** request bez tokenu i odpowiedź 200, zrzuty MD-001 przed/po
próbie oraz GET po resecie. BEFORE pomija CSRF i Origin wyłącznie
dla POST/PATCH zmiany statusu; nadal wymaga sesji i poprawnego statusu.

## 4. CSRF AFTER — odmowa braku i błędnego tokenu

**Przygotowanie i start:** B + C po A lub kontynuacja testu 3.
Konto `p.rozmanowski@jakotako.com`; reset E przed każdą próbą.

### 4.1. AFTER — brak tokenu

1. W szczegółach MD-001 wybierz „LAB: AFTER”; potwierdź „W trakcie”.
2. Na http://127.0.0.1:3001 wybierz `1`, „Zamknięte”, „Bez tokenu”.
3. Kliknij „Wyślij próbę CSRF”. To **identyczne** żądanie POST
   i body `status=closed` jak w teście 3.
4. Oczekuj HTTP 403 i JSON:
   `{"message":"Niepoprawny token CSRF. Odśwież stronę."}`.
5. Odśwież szczegóły na porcie 3000 i odczytaj
   `GET /api/tickets/1`: status musi pozostać `progress`.

**Reset:** E; zamknij kartę odpowiedzi. **Dowód:** POST bez tokenu,
403 z komunikatem oraz GET potwierdzający brak zmiany statusu.

### 4.2. AFTER — błędny token

1. Pozostaw AFTER i MD-001 w stanie „W trakcie”.
2. Na tej samej stronie CSRF zmień tylko „Token CSRF” na „Błędny token”.
3. Kliknij „Wyślij próbę CSRF”. Struktura żądania:

```http
POST /api/tickets/1/status
Origin: http://127.0.0.1:3001
Content-Type: application/x-www-form-urlencoded

status=closed&csrfToken=invalid-lab-token
```

4. Oczekuj HTTP 403 i tego samego komunikatu o tokenie.
   Odśwież MD-001, sprawdź `GET /api/tickets/1`: nadal `progress`.
5. Dla sprawdzenia nagłówka JSON, w konsoli **aplikacji** użyj D:

```javascript
await demoRequest(
  "/api/tickets/1/status",
  "PATCH",
  { status: "closed" },
  "missing",
);
await demoRequest(
  "/api/tickets/1/status",
  "PATCH",
  { status: "closed" },
  "invalid",
);
await demoRequest("/api/tickets/1");
```

Oba PATCH dają 403; GET daje 200 i `progress`.
Pomocnik używa `Content-Type: application/json`; pierwsze żądanie nie ma
`X-CSRF-Token`, drugie ma `X-CSRF-Token: invalid-lab-token`.
To sprawdza token na originie aplikacji, niezależnie od obcego Origin.

**Reset:** E i „Bez tokenu” na stronie testowej.
**Dowód:** osobne request/response obu prób formularza i obu PATCH,
GET statusu po odmowach. Nie zaliczaj testu, jeśli request nie dotarł
do serwera, np. z powodu blokady przeglądarki.

## 5. CSRF AFTER — poprawny token i działający formularz

**Przygotowanie i start:** B, konto `p.rozmanowski@jakotako.com`, reset E.
Stronę C możesz pozostawić otwartą, ale poprawną operację wykonuje MediDesk.

1. Otwórz http://127.0.0.1:3000/ticket-details.html?id=1,
   wybierz „LAB: AFTER”.
2. W „Status zgłoszenia” wybierz „Zamknięte”; kliknij „Zapisz status”.
3. W Network potwierdź HTTP 200, metodę PATCH i strukturę:

```http
PATCH /api/tickets/1/status
Origin: http://127.0.0.1:3000
Content-Type: application/json
X-CSRF-Token: <AKTUALNY_TOKEN_Z_SESJI>

{"status":"closed"}
```

`<AKTUALNY_TOKEN_Z_SESJI>` to opis miejsca na token, nie gotowa wartość.
Formularz sam pobiera go z `GET /api/session`; nie wpisuj tokenu ręcznie.
Ciasteczko sesji wysyła przeglądarka.

4. Oczekuj „Zapisano nowy status zgłoszenia.” i statusu „Zamknięte”.
   Odśwież stronę i potwierdź `GET /api/tickets/1` z `closed`.

**Reset:** wybierz „W trakcie”, kliknij „Zapisz status”, odśwież i sprawdź
`progress`. **Dowód:** PATCH 200 z zakrytym tokenem, odpowiedź i GET po
zapisie/resetowaniu. W BEFORE ten sam formularz również działa; jego
działanie nie dowodzi ochrony CSRF. Odmowy ochrony sprawdza test 4.

## 6. CSP i flagi sesyjnego cookie, w tym HTTPS/Secure

**Przygotowanie i start HTTP:** B, konto
`p.rozmanowski@jakotako.com`. Nie resetuj opisu XSS.

### 6.1. BEFORE na HTTP

1. Otwórz „Przykład XSS”, wybierz „LAB: BEFORE” i zamknij alert.
2. W Network wybierz request **dokumentu** `ticket-details.html?id=...`,
   nie requestu API. W Response Headers odczytaj Content-Security-Policy.
3. CSP zawiera `default-src 'self'`, `style-src 'self'`,
   `frame-ancestors 'none'`, `base-uri 'none'`, `form-action 'self'`.
   `script-src` zawiera `'self'`, `'unsafe-hashes'` i jeden
   `'sha256-...'` będący skrótem dokładnego handlera z testu 1.
   Nie zawiera `'unsafe-inline'` ani `'unsafe-eval'`.
4. Otwórz `dashboard.html`, odśwież i sprawdź jego dokument:
   nawet w BEFORE nie ma tam wyjątku `unsafe-hashes`.
5. DevTools → Application → Storage → Cookies →
   http://127.0.0.1:3000. Znajdź `medidesk.sid`.
   Sprawdź HttpOnly = true, SameSite = Strict, Secure = false,
   Path = `/`. Sesja ma czas ważności około godziny.

### 6.2. AFTER na HTTP

1. Wybierz „LAB: AFTER”, otwórz wpis XSS i odśwież.
2. Dokument ma `script-src 'self'`, bez `unsafe-hashes` i skrótu handlera.
   Pozostałe dyrektywy są takie jak wyżej. Opis pozostaje tekstem.
3. Cookie nadal ma HttpOnly i SameSite=Strict, bez Secure na tym HTTP.
   Zmiana BEFORE/AFTER nie zmienia konfiguracji flags cookie.

**Dowód HTTP:** nagłówki CSP obu dokumentów oraz tabela flag cookie
z zakrytą wartością. **Reset HTTP:** wybierz AFTER; nie usuwaj cookies
przed następnymi testami, chyba że ponownie się zalogujesz.

### 6.3. Lokalne HTTPS — osobne uruchomienie

1. Zatrzymaj oba serwery Ctrl+C. Zachowaj bazę prezentacyjną.
2. W terminalu A utwórz certyfikat i klucz **poza repozytorium**.
   Jeśli OpenSSL jest w PATH, zamiast pełnej ścieżki użyj `openssl`.

```powershell
$tlsDirectory = Join-Path $env:LOCALAPPDATA ("MediDesk\tls-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tlsDirectory
& "C:\Program Files\Git\usr\bin\openssl.exe" req -x509 -newkey rsa:2048 -nodes -days 2 `
  -keyout "$tlsDirectory\key.pem" -out "$tlsDirectory\cert.pem" `
  -subj "/CN=127.0.0.1" -addext "subjectAltName=IP:127.0.0.1"
$env:MEDIDESK_TLS_CERT = Join-Path $tlsDirectory "cert.pem"
$env:MEDIDESK_TLS_KEY = Join-Path $tlsDirectory "key.pem"
$env:MEDIDESK_DB_PATH = Join-Path $env:LOCALAPPDATA "MediDesk\presentation.sqlite"
$env:HOST = "127.0.0.1"
$env:PORT = "3000"
$env:LAB_MODE = "1"
Remove-Item Env:MEDIDESK_DEMO_PASSWORD -ErrorAction SilentlyContinue
npm start
```

3. Otwórz https://127.0.0.1:3000/login.html. Zaakceptuj wyłącznie ten
   własny lokalny certyfikat w ostrzeżeniu przeglądarki. Jeśli przeglądarka
   nie umożliwia wyjątku, zaimportuj ten certyfikat do lokalnego zaufania
   dla testu; nie wyłączaj globalnie walidacji TLS.
4. Zaloguj `p.rozmanowski@jakotako.com` nowym hasłem z terminala.
   Application → Cookies → https://127.0.0.1:3000:
   `medidesk.sid` ma **Secure = true**, HttpOnly = true,
   SameSite = Strict. W Network po logowaniu nagłówek Set-Cookie
   również zawiera te flagi; zakryj jego wartość.
5. Powtórz kroki 6.1–6.2 na HTTPS: CSP nadal zależy od wariantu,
   Secure pozostaje true zarówno BEFORE, jak i AFTER.
6. Dla ponowienia testów 3–5 przez HTTPS uruchom terminal B.
   Skopiuj **same ścieżki** certyfikatu i klucza z terminala A, nie ich
   zawartość. W B wykonaj, zastępując oznaczone miejsca tymi ścieżkami:

```powershell
$env:MEDIDESK_TLS_CERT = "<ŚCIEŻKA_CERTYFIKATU_Z_TERMINALA_A>"
$env:MEDIDESK_TLS_KEY = "<ŚCIEŻKA_KLUCZA_Z_TERMINALA_A>"
$env:HOST = "127.0.0.1"
$env:CSRF_PORT = "3001"
$env:LAB_MODE = "1"
$env:MEDIDESK_TARGET_ORIGIN = "https://127.0.0.1:3000"
npm run lab:csrf
```

7. Otwórz https://127.0.0.1:3001 i zaakceptuj ten sam lokalny certyfikat
   również na tym porcie. W krokach 3–5 używaj HTTPS w obu kartach;
   Origin w requestach ma teraz `https://`.
8. Sprawdź dowolny zalogowany GET do `/api/tickets` przez HTTPS (200).
   Próba otwarcia http://127.0.0.1:3000 przy serwerze HTTPS ma zakończyć
   się błędem połączenia/protokołu, bez odpowiedzi aplikacji.
   Flaga Secure na loopback nie jest dowodem zachowania publicznego HTTP.

**Reset:** zatrzymaj oba serwery, wykonaj B i C (usuwają zmienne TLS),
zaloguj nowym hasłem i wykonaj E. HTTP ponownie ma Secure = false.
**Dowód:** flags cookie HTTP/HTTPS, Set-Cookie z zakrytą wartością,
CSP BEFORE/AFTER, działający GET HTTPS i błąd wejścia HTTP na port HTTPS.
Certyfikat i klucz pozostają poza repozytorium; nie dołączaj ich do raportu.

## 7. Brak zmian danych przez GET

**Przygotowanie i start:** B po A, konto
`p.rozmanowski@jakotako.com`. Wykonaj E. MD-003 musi nadal istnieć
i mieć `closed`. Strona C nie jest potrzebna.

### 7.1. BEFORE

1. Otwórz MD-001, kliknij „LAB: BEFORE”.
2. Wklej D do konsoli aplikacji i wykonaj po kolei:

```javascript
var beforeGet = (await demoRequest("/api/tickets")).data;
await demoRequest("/api/tickets/1/status?status=closed&variant=AFTER");
await demoRequest("/api/tickets/3?delete=1");
await demoRequest("/api/lab/mode?variant=AFTER");
await demoRequest("/api/session?variant=AFTER");
var afterGet = (await demoRequest("/api/tickets")).data;
JSON.stringify(beforeGet) === JSON.stringify(afterGet);
```

3. Oczekuj odpowiednio: lista 200, status-endpoint GET 404,
   szczegóły MD-003 200 (bez usunięcia), GET przełącznika 404,
   sesja 200 z `lab.variant: "BEFORE"`, lista 200.
   Ostatnie porównanie ma zwrócić `true`.
4. Odśwież MD-001: „W trakcie”. Na liście nadal jest MD-003.
   GET nie wymaga Content-Type, body ani tokenu; używa bieżącej sesji.

**Reset:** dane nie powinny się zmienić; potwierdź E i wybierz AFTER.
**Dowód:** metody GET, statusy odpowiedzi, identyczne listy i wynik `true`.

### 7.2. AFTER

1. Wybierz „LAB: AFTER”, wklej D ponownie po przeładowaniu.
2. Powtórz kod 7.1, zamieniając trzy parametry `variant=AFTER`
   na `variant=BEFORE` (w URL zmiany statusu, przełącznika i sesji).
3. Oczekuj tych samych statusów i `true`; sesja ma nadal AFTER,
   MD-001 `progress`, MD-003 `closed`. Odśwież szczegóły i listę.

**Reset:** pozostaw AFTER i E. **Dowód:** taki sam zestaw GET dla AFTER.
Test dotyczy danych zgłoszeń i wyboru wariantu; `GET /api/session`
może utworzyć sesję/token, ale nie zmienia tych danych.

## 8. Usuwanie zamkniętych zgłoszeń i odmowy

**Przygotowanie i start:** B, konto
`p.rozmanowski@jakotako.com`. Nie usuwaj danych używanych w testach 1–7.
Dla **każdego** wariantu twórz osobne zgłoszenie według poniższego kodu.
Strona C nie jest używana: podatny CSRF obejmuje tylko zmianę statusu.

### 8.1. BEFORE

1. Wybierz „LAB: BEFORE”. Otwórz dodatkowe karty
   http://127.0.0.1:3000/dashboard.html i
   http://127.0.0.1:3000/tickets.html; zapisz licznik wszystkich zgłoszeń.
2. W konsoli głównej karty aplikacji wklej D i utwórz rekord:

```javascript
var deletionTicket = await demoRequest("/api/tickets", "POST", {
  title: "Fikcyjne zgłoszenie testowe",
  description: "Opis fikcyjnej awarii.",
  priority: "high",
  reporterId: 1,
  agentId: 2,
});
var deletionId = deletionTicket.data.id;
```

Oczekuj 201, `status: "new"`, agent „Jaromir Malina”.
To dane po pełnym resecie A. JSON wymaga poprawnego `X-CSRF-Token`,
sesji i `Content-Type: application/json`; pomocnik je obsługuje.

3. Jeszcze w tej konsoli wykonaj:

```javascript
await demoRequest("/api/tickets/" + deletionId, "DELETE", {});
await demoRequest("/api/tickets/" + deletionId);
await demoRequest("/api/tickets/" + deletionId + "/status", "PATCH", {
  status: "progress",
});
await demoRequest("/api/tickets/" + deletionId, "DELETE", {});
await demoRequest("/api/tickets/" + deletionId);
```

Oba DELETE z **poprawnym** tokenem dają 409 i komunikat
„Można usunąć tylko zamknięte zgłoszenie.”. GET potwierdza kolejno
`new` i `progress`. PATCH daje 200.
Zanotuj `deletionId`; po nawigacji zmienna konsoli może zniknąć.

4. Otwórz `ticket-details.html?id=<zanotowany numer>` na porcie 3000.
   Przycisk „Usuń zgłoszenie” ma być ukryty. Zamknij zgłoszenie
   formularzem „Status zgłoszenia” → „Zamknięte” → „Zapisz status”.
   Przycisk usuwania ma się pojawić.
5. Wklej D. Pobierz numer z adresu otwartych szczegółów i wykonaj:

```javascript
var deletionId = Number(new URLSearchParams(location.search).get("id"));
await demoRequest("/api/tickets/" + deletionId, "DELETE", {}, "missing");
await demoRequest("/api/tickets/" + deletionId, "DELETE", {}, "invalid");
await demoRequest("/api/tickets/" + deletionId);
```

Oba DELETE dają 403: „Niepoprawny token CSRF. Odśwież stronę.”.
Pierwszy pomija nagłówek, drugi wysyła
`X-CSRF-Token: invalid-lab-token`; oba mają JSON body `{}`.
GET daje 200 i `closed`: zgłoszenie nadal istnieje.

6. Kliknij „Usuń zgłoszenie”. W prośbie
   „Czy na pewno usunąć zamknięte zgłoszenie? Tej operacji nie można cofnąć.”
   wybierz anulowanie. W Network nie może pojawić się DELETE;
   odświeżenie szczegółów potwierdza, że zgłoszenie istnieje.
7. Kliknij ponownie i potwierdź. Oczekuj DELETE 200:

```http
DELETE /api/tickets/<zanotowany numer>
Origin: http://127.0.0.1:3000
Content-Type: application/json
X-CSRF-Token: <AKTUALNY_TOKEN_Z_SESJI>

{}
```

Odpowiedź: `{"message":"Usunięto zamknięte zgłoszenie."}`.
Aplikacja otworzy `tickets.html`. Sprawdź brak rekordu na liście,
aktualizację otwartych kart listy i pulpitu oraz powrót licznika do
wartości sprzed utworzenia rekordu. W konsoli z D wykonaj GET
`/api/tickets/<zanotowany numer>`: ma dać 404.

**Reset:** usuniętego zgłoszenia nie da się cofnąć; do następnej próby
utwórz nowy rekord kodem z kroku 2 i zanotuj nowy id.
**Dowód:** 409 dla `new` i `progress`, oba 403 i zachowany `closed`,
anulowane potwierdzenie, DELETE 200, GET 404, lista i licznik po usunięciu.

### 8.2. AFTER

1. Wybierz „LAB: AFTER”.
2. Powtórz wszystkie kroki 8.1 z **nowym** zgłoszeniem.
3. Oczekiwane rezultaty są identyczne: 409 dla otwartego, 403 dla braku
   i błędnego tokenu, 200 dla poprawnego usunięcia zamkniętego.
   Anulowanie nie wysyła DELETE; listy i dashboard aktualizują się.

**Reset i dowód:** jak w 8.1, osobno oznacz materiał jako AFTER.
Usuwanie nie ma laboratoryjnego obejścia CSRF w żadnym wariancie.
Serwer wykonuje warunkowe DELETE tylko dla `status = 'closed'`,
nie polega na widoczności przycisku.

## 9. Utworzenie, szczegóły i przypisanie agenta

**Przygotowanie i start:** B po A albo zachowana baza z danymi
początkowymi. Konto `p.rozmanowski@jakotako.com`.
Strona C nie uczestniczy w teście. Twórz osobny rekord w każdym wariancie.

### 9.1. BEFORE

1. Wybierz „LAB: BEFORE”, kliknij „Nowe zgłoszenie” w nawigacji
   (http://127.0.0.1:3000/new-ticket.html).
2. Kliknij „Utwórz zgłoszenie” przy pustych polach. Oczekuj polskiego
   komunikatu wymaganego pola i focusu na pierwszym błędnym polu;
   POST zgłoszenia nie powinien zostać wysłany.
3. Wprowadź dane używane w teście przeglądarkowym:

| Pole                   | Wartość                            |
| ---------------------- | ---------------------------------- |
| Tytuł zgłoszenia       | `<b>Fikcyjny tytuł</b>`            |
| Opis problemu          | `<img src="x" onerror="alert(1)">` |
| Priorytet              | Wysoki                             |
| Wyszukaj zgłaszającego | `Testowy`                          |
| Zgłaszający            | Bartosz Testowy · DEMO-002         |
| Agent Service Desku    | Daniel Pejs                        |

4. Sprawdź wyszukiwanie: `GET /api/employees?search=Testowy` (200)
   zwraca Bartosza. Powtórz z `Bartosz` i `DEMO-002`;
   za każdym razem wybierz Bartosza z listy.
   Lista agentów z `GET /api/agents` (200) zawiera tylko cztery konta
   zespołu, a nie Alicję, Bartosza ani Celinę.
5. Kliknij „Utwórz zgłoszenie”. W Network oczekuj:

```http
POST /api/tickets
Origin: http://127.0.0.1:3000
Content-Type: application/json
X-CSRF-Token: <AKTUALNY_TOKEN_Z_SESJI>

{
  "title": "<b>Fikcyjny tytuł</b>",
  "description": "<img src=\"x\" onerror=\"alert(1)\">",
  "priority": "high",
  "reporterId": 2,
  "agentId": 3
}
```

Id zgłaszającego i agenta odpowiadają pełnemu resetowi A.
Odpowiedź 201 zwraca zapisany rekord: zanotuj `id`, `createdAt`,
`reporterName`, `reporterEmail`, `agentName` i `status: "new"`.

6. Automatycznie otworzy się okno szczegółów. Porównaj z odpowiedzią 201
   numer, tytuł, opis, status „Nowe”, priorytet „Wysoki”, Bartosza Testowego,
   Daniela Pejsa, kontakt `demo02@example.invalid` i datę utworzenia.
   Data w interfejsie jest lokalnie sformatowana, a w JSON ma format ISO.
   Tytuł i opis są **dosłownym tekstem**: nie pojawia się alert ani obraz.
   W Elements opis okna nie ma elementu `img`.
7. Naciśnij kilka razy Tab i Shift+Tab. Focus ma pozostawać w oknie
   i być widoczny. Naciśnij Escape: okno znika, focus wraca do
   „Utwórz zgłoszenie”.
8. W nowej karcie otwórz pulpit, kliknij nowo utworzone zgłoszenie.
   Porównaj te same pola pełnej strony z oknem i odpowiedzią 201.
   Oba widoki korzystają z `public/partials/ticket-details.html`.
9. Odśwież pełną stronę: `GET /api/tickets/<zanotowany id>` daje 200
   i zachowane przypisanie `agentId: 3`, `agentName: "Daniel Pejs"`.

**Reset:** zamknij utworzone zgłoszenie i usuń z poprawnym tokenem
według testu 8; nie usuwaj wpisu XSS. Wróć do formularza.
**Dowód:** wyszukiwanie i oddzielne listy osób, POST 201 z zakrytym
tokenem, okno z literalnym opisem, ta sama pełna strona, GET przypisania.

### 9.2. AFTER

1. Wybierz „LAB: AFTER”.
2. Powtórz kroki 9.1 z tymi samymi danymi w nowym zgłoszeniu.
3. Tym razem zamknij okno przyciskiem „Zamknij”; sprawdź powrót fokusu.
4. Utwórz jeszcze jeden rekord z tymi samymi danymi. W jego oknie kliknij
   „Otwórz stronę zgłoszenia”. Adres musi zawierać id odpowiedzi 201;
   dane pełnej strony muszą być identyczne z oknem.

**Oczekiwany wynik:** identyczne bezpieczne renderowanie i przypisanie
jak w BEFORE. Laboratoryjny XSS dotyczy wyłącznie stałego wpisu testu 1,
nie opisów tworzonych formularzem ani okna po zapisie.
**Reset:** zamknij i usuń oba nowe rekordy testem 8; pozostaw AFTER.
**Dowód:** osobne POST 201, zamknięcie przyciskiem, link z poprawnym id,
opis jako tekst i odczyt zapisanej relacji z agentem.

## 10. Zwykły bezpieczny start i odmowa innego adresu

### 10.1. Zwykły start bez LAB_MODE

**Przygotowanie:** zatrzymaj oba serwery Ctrl+C. Zachowaj bazę z wpisem XSS,
aby wykazać bezpieczeństwo tego samego opisu po wyłączeniu laboratorium.
W terminalu A wykonaj:

```powershell
Remove-Item Env:LAB_MODE -ErrorAction SilentlyContinue
Remove-Item Env:MEDIDESK_TLS_CERT, Env:MEDIDESK_TLS_KEY -ErrorAction SilentlyContinue
Remove-Item Env:MEDIDESK_DEMO_PASSWORD -ErrorAction SilentlyContinue
$env:HOST = "127.0.0.1"
$env:PORT = "3000"
$env:MEDIDESK_DB_PATH = Join-Path $env:LOCALAPPDATA "MediDesk\presentation.sqlite"
npm start
```

1. Terminal pokazuje „Laboratorium wyłączone; wariant zabezpieczony.”.
2. Otwórz http://127.0.0.1:3000/login.html. Zaloguj
   `p.rozmanowski@jakotako.com` nowym hasłem z terminala.
   Przełączniki LAB są niewidoczne; baner lokalnej demonstracji pozostaje.
3. Wklej D. `await demoRequest("/api/session");` daje 200,
   `lab.enabled: false`, `lab.variant: "AFTER"`.
4. Spróbuj aktywować BEFORE:

```javascript
await demoRequest("/api/lab/mode", "POST", { variant: "BEFORE" });
await demoRequest(
  "/api/tickets/1/status",
  "PATCH",
  { status: "closed" },
  "missing",
);
await demoRequest(
  "/api/tickets/1/status",
  "PATCH",
  { status: "closed" },
  "invalid",
);
```

Oczekuj 403 „Laboratorium jest wyłączone.” dla przełącznika
(z poprawnym tokenem), a dla obu PATCH 403 z komunikatem CSRF.
GET MD-001 potwierdza brak zmiany.
Zwykły formularz z poprawnym tokenem nadal działa — zamknij i przywróć
„W trakcie” przyciskiem „Zapisz status” tak jak w teście 5.

5. Na liście otwórz zachowany wpis „LAB: kontrolowany przykład XSS”.
   Dopisz `&variant=BEFORE`. Opis nadal jest tekstem, bez alertu;
   API zwraca `descriptionRendering: "text"`, dokument ma CSP bez wyjątku.
6. Strona CSRF nie jest potrzebna do powyższych requestów. Aby potwierdzić
   odmowę również dla tego samego formularza z innego originu, uruchom C
   w terminalu B, pozostawiając terminal A bez LAB_MODE.
   Wyślij próbę „Bez tokenu” na MD-001: 403, status bez zmian.

**Reset:** E wykonaj zwykłym formularzem (przyciski LAB są niewidoczne),
zatrzymaj stronę CSRF. Do wznowienia laboratorium zatrzymaj aplikację,
wykonaj B + C i zaloguj nowym hasłem.
**Dowód:** komunikat startu bez hasła, brak przełącznika, sesja z
`enabled: false`, odmowy 403, tekstowy wpis XSS i poprawny formularz.

### 10.2. LAB_MODE=1 i niedozwolony adres nasłuchu

1. Zatrzymaj oba serwery, aby konflikt portu nie zamaskował wyniku.
2. W terminalu A wykonaj:

```powershell
$env:LAB_MODE = "1"
$env:HOST = "0.0.0.0"
node server.js
$LASTEXITCODE
```

3. Oczekuj błędu „Laboratorium może nasłuchiwać tylko na 127.0.0.1.”
   i niezerowego kodu wyjścia. Serwer nie może wystartować.
   Na http://127.0.0.1:3000 nie powinno być odpowiedzi MediDesk.
4. Sprawdź również stronę testową:

```powershell
node lab/csrf-server.js
$LASTEXITCODE
```

Oczekuj „Test wymaga LAB_MODE=1 i adresu 127.0.0.1.” oraz niezerowego kodu.

5. Powtórz oba polecenia z `$env:HOST = "::1"`, a następnie
   `$env:HOST = "localhost"`; oba serwery odmawiają startu.
6. Dla zwykłego wariantu ustaw `$env:HOST = "0.0.0.0"`,
   usuń `Env:LAB_MODE` i uruchom `node server.js`.
   Oczekuj „Aplikacja może nasłuchiwać tylko na 127.0.0.1.”.
7. Przywróć poprawny adres i sprawdź start laboratorium:

```powershell
$env:HOST = "127.0.0.1"
$env:LAB_MODE = "1"
npm start
```

Oczekuj `MediDesk: http://127.0.0.1:3000`. Zaloguj konto demonstracyjne
nowym hasłem; domyślnie aktywny jest AFTER.

**Reset:** pozostaw HOST=127.0.0.1. Dla końcowego zwykłego startu
zatrzymaj serwer i wykonaj polecenia 10.1.
**Dowód:** terminal z każdym adresem, komunikatem i kodem wyjścia,
brak działającego serwera po odmowie oraz poprawny start na 127.0.0.1.
Nie oceniaj kodu wyjścia `npm` jako statusu HTTP — odmowa następuje
przed rozpoczęciem nasłuchu.

## Automatyczna regresja i wyniki

### Backend — polecenie i potwierdzenie

W katalogu projektu:

```powershell
npm test
```

`tests/server.test.js` uruchamia własny serwer na wolnym porcie 127.0.0.1
i oddzielną bazę tymczasową. Nie zmienia danych prezentacji.
Oczekiwane podsumowanie: **tests 9, pass 9, fail 0**.
Dwa testy główne obejmują backend i migrację; siedem podtestów obejmuje
logowanie czterech agentów, cykl sesji/CSRF oraz usuwanie w BEFORE/AFTER.
Sprawdzane są również sesje, hashe, reset, walidacja i przypisanie,
XSS według odpowiedzi serwera, CSRF bez/błędny/poprawny token,
GET bez zmian, zwykły start i odmowy nieprawidłowego HOST.

**Dowód:** pełny wynik terminala bez danych sesji.
**Reset:** automatyczny — test kończy swoje procesy i usuwa swoją bazę.

### Przeglądarka HTTP i HTTPS — polecenie i potwierdzenie

Wymagane: Python 3, zainstalowany Google Chrome i OpenSSL w PATH albo
`C:\Program Files\Git\usr\bin\openssl.exe`.
Playwright jest wyłącznie narzędziem testowym poza repozytorium;
frontend nadal nie korzysta z bibliotek.

```powershell
$browserTools = Join-Path $env:TEMP "medidesk-browser-tools"
python -m pip install --target "$browserTools" playwright
$env:PYTHONPATH = $browserTools
python tests/browser.test.py
```

`tests/browser.test.py` wykonuje dwa testy: `test_http` i `test_https`.
Uruchamia własne serwery na wolnych portach, własne tymczasowe bazy
oraz certyfikat i klucz poza repozytorium. Blokuje requesty przeglądarki
poza 127.0.0.1. Sprawdza rzeczywisty alert XSS, tekst AFTER, formularz
CSRF z osobnego originu, odmowy 403, poprawny status, okno po zapisie,
tożsamość pól pełnego widoku, klawiaturę, usuwanie i aktualizację kart,
cookies oraz zwykły restart. Testy nie usuwają ręcznego przełącznika LAB.

Oczekuj `Ran 2 tests` i `OK`, oba przypadki oznaczone `ok`.
**Dowód:** podsumowanie terminala. **Reset:** automatycznie kończy
własne serwery i usuwa tymczasowe dane; baza prezentacyjna zostaje zachowana.

### Formatowanie

```powershell
npm run format
npx prettier --check public lab scripts tests config routes controllers services repositories middleware server.js database.js README.md package.json package-lock.json .prettierrc.json
```

Prettier ma `printWidth: 80`. Spodziewany wynik kontroli:
`All matched files use Prettier code style!`.
Test Python jest formatowany Blackiem z szerokością 80 znaków;
Prettier go nie formatuje.

### Zapisane wyniki — 8 października 2026

Po dodaniu usuwania i okna szczegółów wykonano:

| Kontrola                       | Wynik                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------- |
| `npm test`                     | 8/8, 0 błędów                                                                   |
| `python tests/browser.test.py` | HTTP i HTTPS: 2/2, OK                                                           |
| XSS                            | rzeczywisty alert BEFORE, tekst AFTER                                           |
| CSRF                           | bez tokenu BEFORE: 200; bez i błędny AFTER: 403; poprawny formularz: 200        |
| Usuwanie                       | otwarte: 409; brak/błędny token: 403 w obu wariantach; zamknięte z tokenem: 200 |
| Szczegóły po zapisie           | odpowiedź 201, zgodne pola, tekstowy opis i klawiatura                          |
| Zwykły start / HOST            | zabezpieczony wariant; odmowy dla 0.0.0.0, ::1 i localhost                      |
| Formatowanie i składnia        | Prettier, Black i kontrola składni: powodzenie                                  |

Środowisko wcześniejszej regresji: Node.js 24.21.0 i Chrome 154.0.8037.98.
Przy kolejnej prezentacji zapisuj własną datę, wersje i wyniki każdego
testu 1–10. Zapisane wyniki nie zastępują sprawdzenia ręcznego CSP i dowodów.
Zmiana samej instrukcji nie zmienia działania aplikacji ani wariantów LAB.

### Regresja po podziale backendu na warstwy

Po refaktoryzacji uruchomiono istniejące testy bez zmiany ich oczekiwanych
wyników ani zakresu. Importy testów nie wymagały aktualizacji: nadal
uruchamiają `server.js` i `scripts/init-db.js` jako osobne procesy.
Skrypt inicjalizacji używa teraz `services/demoService.js`, a skrypt
formatowania obejmuje wszystkie nowe katalogi backendu.

| Wykonana kontrola                    | Wynik                                                                                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                           | 8/8, 0 błędów; cztery konta agentów, walidacja, zapis/przypisanie, usuwanie BEFORE/AFTER, migracja i reset bazy                                |
| `python tests/browser.test.py`       | 2/2, OK; automatyczny test Chrome na HTTP i HTTPS                                                                                              |
| XSS / CSRF BEFORE → AFTER            | Automatycznie potwierdzono rzeczywisty alert, tekst AFTER, zmianę bez tokenu BEFORE, obie odmowy AFTER i poprawny formularz                    |
| Szczegóły i usuwanie w interfejsie   | Automatycznie potwierdzono okno po zapisie, zgodne pola i przypisanie, obsługę klawiatury, potwierdzenie usunięcia i aktualizację list/pulpitu |
| Zabezpieczony start / adres nasłuchu | Potwierdzone testami; zwykły start zachowuje ochronę, laboratorium odrzuca adresy inne niż 127.0.0.1                                           |
| Prettier i składnia JavaScript       | Wszystkie pliki przeszły kontrolę                                                                                                              |

Nie wykonywano po tej refaktoryzacji osobnej ręcznej prezentacji
wszystkich kroków 1–10 ani ręcznego zbierania zrzutów w DevTools.
Wyniki przeglądarkowe powyżej pochodzą z automatyzacji istniejącego
testu, a instrukcje ręczne pozostają do wykonania przez prezentera.
Testy używały baz i certyfikatów tymczasowych poza repozytorium.
Frontend `public/`, lokalny serwer strony CSRF i pliki testów nie
zostały zmienione; API zachowało metody, ścieżki, komunikaty i statusy.

### Cykl życia sesji i tokenu CSRF

Token to 32 losowe bajty zapisane jako 64 znaki szesnastkowe w
`request.session.csrfToken`. `GET /api/session` tworzy go tylko wtedy,
gdy sesja jeszcze go nie ma; kolejne GET i odświeżenia strony zachowują
ten sam token. Poprawne logowanie regeneruje identyfikator sesji,
tworzy nowy token i zwraca go w odpowiedzi. Wylogowanie niszczy sesję
i wygasza cookie `medidesk.sid` z tym samym Path i flagami, których
używała sesja. Nowa sesja anonimowa po wylogowaniu ma nowy token;
ponowne logowanie ponownie zmienia identyfikator i token.

Przed poprawką odtworzono konkretny problem klienta: karta szczegółów
otwarta przed wylogowaniem wysyłała stary token po ponownym logowaniu
w innej karcie i otrzymywała 403. Serwer już regenerował sesję i token.
Frontend teraz pobiera bieżący token przez `GET /api/session` przed
każdą operacją zmieniającą dane. Ten dodatkowy odczyt nie rotuje tokenu.
Żądania API mają `cache: "no-store"`, a odpowiedzi serwera
`Cache-Control: no-store`. Token jest tylko w pamięci bieżącej strony,
bez localStorage/sessionStorage; jest czyszczony po wylogowaniu i 401.
Strona przywrócona z pamięci historii przeglądarki jest przeładowywana,
aby odczytać aktualną sesję zamiast używać starego stanu.

Automatyczny podtest backendu sprawdza stabilność tokenu przy kolejnych
GET i odczytach strony, różne tokeny niezależnych sesji, regenerację
przy ponownym logowaniu, wyczyszczenie cookie i unieważnienie starej
sesji. W AFTER stary token daje 403 bez zmiany danych, nowy działa (200).
Anonimowa sesja z własnym poprawnym tokenem nie może zmienić statusu
(401), a odtworzone stare cookie również nie daje dostępu.
Test przeglądarkowy na HTTP i HTTPS sprawdza odświeżenie strony,
wylogowanie, ponowne logowanie i zapis z wcześniej otwartej karty,
w tym faktyczny token wysłany w nagłówku PATCH. Nie zastępuje to
osobnej ręcznej prezentacji w DevTools.

Po poprawce uruchomiono `npm test`: 9/9, 0 błędów, oraz
`python tests/browser.test.py`: 2/2 (HTTP i HTTPS), OK. Przeszła również
istniejąca regresja XSS/CSRF i usuwania w BEFORE/AFTER. Kontrole
formatowania zakończyły się powodzeniem. Poniższych kroków ręcznych
nie oznaczono jako wykonanych.

Ręczne powtórzenie (do wykonania przez prezentera):

1. Uruchom B i zaloguj `p.rozmanowski@jakotako.com`. Otwórz MD-001
   w drugiej karcie i przygotuj DevTools według D w obu kartach.
2. Na pulpicie odśwież stronę dwa razy. Porównaj pole `csrfToken`
   w kolejnych odpowiedziach `GET /api/session`: musi być identyczne.
3. Na pulpicie kliknij „Wyloguj się”. W POST `/api/logout` sprawdź 200
   i wygaszone Set-Cookie. Strona logowania pobierze nową anonimową
   sesję, więc nowe cookie może od razu pojawić się w Application.
4. Zaloguj ponownie. POST `/api/login` musi zwrócić nowy token
   i nowe cookie; porównuj odpowiedzi, a nie zapisany nagłówek Postmana.
5. W starej karcie szczegółów, bez jej odświeżania, wybierz „Zamknięte”
   i „Zapisz status”. Oczekuj GET bieżącej sesji, następnie PATCH 200
   z nowym tokenem. Odśwież stronę i potwierdź zapis w SQLite przez API.
6. Przywróć „W trakcie” formularzem. Aby sprawdzić odmowę starego
   tokenu, w Postmanie użyj aktualnego cookie zalogowanej sesji,
   `Content-Type: application/json`, ale starego `X-CSRF-Token`.
   PATCH `/api/tickets/1/status` z `{"status":"closed"}` w AFTER ma
   zwrócić 403. Z nowym tokenem daje 200. Przywróć `progress`.
7. Zbierz request/response odświeżeń, logowania, wylogowania i odmowy;
   zakryj wartości cookie i tokenów w dowodach. Pełna regresja:
   `npm test` oraz `python tests/browser.test.py` według poleceń wyżej.

## Zestawienie API i zasad

| Metoda       | Endpoint                      | Dane / działanie                                  |
| ------------ | ----------------------------- | ------------------------------------------------- |
| GET          | /api/session                  | agent, csrfToken, lab                             |
| POST         | /api/login                    | email, password; nowa sesja i token               |
| POST         | /api/logout                   | JSON {}; zakończenie sesji                        |
| POST         | /api/lab/mode                 | variant: BEFORE albo AFTER                        |
| GET          | /api/employees?search=Testowy | fikcyjni zgłaszający                              |
| GET          | /api/agents                   | czterej agenci, bez hashy                         |
| GET          | /api/tickets                  | lista                                             |
| GET          | /api/tickets/:id              | szczegóły                                         |
| POST         | /api/tickets                  | title, description, priority, reporterId, agentId |
| PATCH / POST | /api/tickets/:id/status       | status                                            |
| DELETE       | /api/tickets/:id              | JSON {}; tylko closed                             |

Poza sesją i logowaniem API wymaga zalogowania.
Operacje zmieniające dane wymagają JSON, tokenu `X-CSRF-Token`
i zgodnego Origin, jeśli jest obecny. Wyjątek: laboratoryjny formularz
statusu dopuszcza `application/x-www-form-urlencoded` i token w polu
`csrfToken`; w BEFORE tylko zmiana statusu pomija CSRF i Origin.
Logowanie, wylogowanie, tworzenie, usuwanie i przełącznik zawsze
wymagają poprawnego tokenu, także w BEFORE.

Priorytety: `low`, `medium`, `high`.
Statusy: `new`, `progress`, `closed`.
Tytuł: 1–120 znaków po trim; opis: 1–5000.
`reporterId` i niepuste `agentId` muszą być dodatnimi liczbami całkowitymi
istniejącymi w odpowiednich tabelach. `agentId: null` oznacza
„Nieprzypisane”. Walidacja przeglądarkowa jest ułatwieniem obsługi;
serwer niezależnie waliduje dane i stosuje parametryzowane zapytania SQL.

Sesje są w pamięci, wygasają po godzinie i nie przeżywają restartu;
zgłoszenia pozostają w SQLite. Nie ma prawdziwych haseł ani sekretów
zapisanych w repozytorium. Konta zespołu są jedynym wyjątkiem od
fikcyjnych osób; nie używaj danych pacjentów ani innych prawdziwych osób.

`AGENTS.md`, `data/` i `node_modules/` są lokalnie pomijane w
`.git/info/exclude`; `.gitignore` nie jest zmieniany.
Przy nowym klonowaniu sprawdź lokalne wykluczenia przed dodawaniem plików.
Nie dodawaj do commita baz, certyfikatów, kluczy, haseł ani AGENTS.md.
