# Basis-URL, erlaubte Origins und Cron-Aufrufer

Cloud Run stellt die öffentliche URL **nicht** als Umgebungsvariable bereit —
Custom Domains sind dem Container unbekannt. Die Origin kommt deshalb aus dem
Request: Cloud Run reicht den Original-`Host` durch und setzt
`X-Forwarded-Proto`. Zuständig ist [src/server/auth/baseUrl.ts](../src/server/auth/baseUrl.ts):

- `requestOrigin()` — Origin aus den Forwarded-Headern, geprüft gegen die
  Allowlist. Für WebAuthn zwingend, weil RP ID und Origin sich zwischen Prod,
  Dev und localhost unterscheiden.
- `getBaseUrl()` — dasselbe, mit `NEXTAUTH_URL` als Fallback für request-lose
  Kontexte (E-Mail-Versand, Hintergrund-Jobs). Für generierte Links verwenden.

Ohne `PASSKEY_ALLOWED_ORIGINS` gilt `NEXTAUTH_URL` plus `http://localhost:3000`.
**Außerhalb von Produktion** wird zusätzlich jede Loopback-Adresse akzeptiert
(`localhost`, `127.0.0.1`, `::1`) — unabhängig von Port und Schema, damit
`next dev -p 3001` und `npm run dev:https` (dort lautet die Origin
`https://localhost:3000`) nicht an einer auf einen Port festgelegten Allowlist
scheitern. LAN-IPs und Tunnel-Domains bleiben außen vor: über http sind sie kein
Secure Context, dort verweigert schon der Browser die WebAuthn-Ceremony. Wer sie
braucht (z.B. `*.nip.io` mit TLS für Gerätetests), trägt sie explizit in
`PASSKEY_ALLOWED_ORIGINS` ein.

Wird eine Origin abgelehnt, protokolliert `requestOrigin()` sie zusammen mit der
Allowlist — der Aufrufer sieht sonst nur `passkey: request origin is not allowed`.

## `req.nextUrl.origin` ist nicht die öffentliche Adresse

**In einem Route Handler nie `req.nextUrl.origin` als Basis einer Weiterleitung
oder eines nach außen gegebenen Links verwenden.** Next.js baut `nextUrl` aus der
Adresse, auf die der Server hört — im Container von Cloud Run ist das
`0.0.0.0:8080`, und mit `X-Forwarded-Proto: https` entsteht daraus ein
`https://0.0.0.0:8080`. Lokal fällt das nicht auf, weil dort beides
zusammenfällt.

Sichtbar geworden ist es am OAuth-Flow des MCP-Zugangs: `/api/oauth/authorize`
leitete auf `https://0.0.0.0:8080/oauth/consent?…` weiter, womit der Browser in
einer Sackgasse landete, und der `WWW-Authenticate`-Header von `/api/mcp` wies
auf einen Resource-Metadata-Pfad unter derselben Adresse. Beide nehmen jetzt
`getBaseUrl()` bzw. `getOauthIssuer()` als Basis. Eine relative `Location` wäre
zwar auch zulässig (RFC 7231), aber die absolute URL ist dieselbe, die schon im
Issuer und in der Discovery steht — eine Quelle für alle.

## CRON_INVOKER_EMAILS

`CRON_INVOKER_EMAILS` ist eine komma-separierte Allowlist der
Service-Account-Adressen, die zeitplan-gesteuerte Endpoints aufrufen dürfen
(aktuell `/api/fahrtenbuch/weekly-report`). **Pflicht für diese Endpoints:**
Ohne die Variable lehnt `cronRequired` jeden Aufruf ab (fail closed) — ein
offener Endpoint, der Mails an gepflegte Verteilerlisten verschickt, wäre ein
Mail-Relay. In Cloud Run setzt terraform den Wert als Env-Var des Dienstes
(`local.cron_invoker_emails` im jeweiligen Root), abgeleitet aus dem Projekt
und den Namen der Invoker-Service-Accounts. Die Liste enthält die Invoker
**beider** Umgebungen, weil Dev und Prod das Projekt `ffn-utils` teilen; deren
Namen unterscheidet `name_suffix` des Moduls `cloud-scheduler`. Ein
`check`-Block im Root prüft, dass der tatsächliche Invoker auf der Liste steht.

**Bewusst kein Secret-Manager-Secret:** Der Wert ist eine Kennung, kein
Geheimnis — wer die Adresse kennt, kann kein Token dafür ausstellen, dazu
braucht es IAM-Rechte auf den Service Account.

## Der Firebase-Auth-Handler unter der eigenen Domain

`authDomain` zeigt in der Firebase-Konfiguration auf
`ffn-utils.firebaseapp.com`. Damit läuft jeder Google-Login über eine **fremde
Origin**, und daran scheitert er in WebKit-Browsern:

- `signInWithPopup` gibt sein Ergebnis per `postMessage` an `window.opener`
  zurück. Bluefy und andere WKWebView-Browser öffnen `window.open` als
  eigenständigen Tab ohne diese Beziehung — der Handler bleibt als weiße Seite
  stehen, ohne Fehler und ohne Rückweg. Aufgefallen ist es in Bluefy, das auf
  dem iPhone als einziger Browser Web Bluetooth mitbringt und damit der einzige
  Weg zum Radiacode ist — WebKit selbst kennt die API nicht.
- `signInWithRedirect` bräuchte Storage auf der Handler-Domain. Die ist dort
  Third-Party und wird von WebKit blockiert.

Der von Firebase dokumentierte Ausweg: `/__/auth/*` unter der **eigenen**
Domain ausliefern und `authDomain` dorthin zeigen lassen. Dann ist der ganze
Ablauf same-origin — ohne Popup, ohne Third-Party-Storage. Beteiligt sind:

| Stelle | Aufgabe |
| --- | --- |
| [next.config.js](../next.config.js) | Rewrite `/__/auth/:path*` → `https://<authDomain>/__/auth/:path*`. **Immer aktiv**, unabhängig vom Schalter — nur so lässt sich der Weg auf einem einzelnen Gerät ausprobieren. |
| [authDomain.ts](../src/components/firebase/authDomain.ts) | Entscheidet, ob `initializeApp` die eigene Domain als `authDomain` bekommt. |
| [signInStrategy.ts](../src/components/firebase/signInStrategy.ts) | Popup oder Redirect. Bei aktivem Proxy **immer** Redirect, auf jedem Gerät. |
| [firebase-ui-login.tsx](../src/components/firebase/firebase-ui-login.tsx) | wendet das auf den Web-Login an (`signInFlow`) |
| [patterns.ts](../src/worker/patterns.ts) | `NetworkOnly` für `/__/auth/*` — der Service Worker darf den Handler nicht zwischenspeichern. |

### Schalter

Es gewinnt jeweils das Nähere:

1. `NEXT_PUBLIC_FIREBASE_AUTH_PROXY=true` — Voreinstellung je Umgebung, als
   Repository-Variable gesetzt und beim Image-Build ins Bundle inlined.
2. `?authProxy=1` bzw. `?authProxy=0` in der URL — schaltet für dieses Gerät um
   und merkt sich die Wahl.
3. der gemerkte Wert im `localStorage` (`firebaseAuthProxy`).

Davon getrennt steht die Frage, ob Popup oder Redirect verwendet wird: Bei
aktivem Proxy gilt **immer** Redirect. `?signInFlow=popup` ist der Notausstieg
zurück auf den alten Weg, `?signInFlow=redirect` nimmt ihn wieder zurück; auch
diese Wahl wird im `localStorage` gemerkt (`firebaseSignInFlow`) und wirkt nur
bei aktivem Proxy — ein Redirect auf die fremde Handler-Domain wäre schlechter
als das Popup, nicht besser.

Zum Ausprobieren genügt daher ein Aufruf von
`https://einsatz-dev.ffnd.at/login?authProxy=1`; für alle anderen Benutzer
ändert sich nichts.

### Warum keine Geräteerkennung

Zuerst stand hier eine: Redirect nur auf iOS, sonst das angenehmere Popup. Das
war der falsche Ansatz. iPadOS meldet sich seit Version 13 als `Macintosh` und
ist nur an `navigator.maxTouchPoints` vom echten Mac zu unterscheiden;
WKWebView-Browser bringen eigene Kennungen mit, und mit jedem iOS-Update kann
sich das wieder ändern. Greift die Erkennung nicht, fällt der Login lautlos auf
genau den Popup-Weg zurück, der in WebKit kaputt ist — ohne Fehler, ohne
Hinweis. Eine Weiche, deren Fehlerfall der Fehler selbst ist, taugt nicht.

Mit erst-party Handler ist der Redirect überall unterstützt, und auf der
Anmeldeseite kostet der Seitenneuaufbau nichts — es gibt kein Formular, das
dabei verloren geht. Deshalb: ein Weg statt zwei.

### Die Schalter gelten pro Origin — inklusive Port

Ein `?authProxy=1` auf `https://localhost:3000` wirkt auf
`https://localhost:3001` nicht, und weil die Voreinstellung „aus" ist, läuft
dort der erste Aufruf wieder über `firebaseapp.com`. Wer beim Testen den Port
wechselt, muss den Parameter erneut mitgeben.

Sichtbar wird das an der Diagnosezeile: `authDomain=` nennt die Domain, mit
der die Firebase-App tatsächlich angelegt wurde, und die steht **für die
Lebensdauer der Seite fest** — sie wird beim Laden des Moduls entschieden,
nicht bei jedem Anmeldeversuch neu.

### Welche Anmeldeoberfläche eigentlich läuft

Im Browser rendert [LoginUi.tsx](../src/components/pages/LoginUi.tsx)
**FirebaseUI**, in der Android-App stattdessen `NativeLoginPanel`. FirebaseUI
bringt seinen eigenen Ablauf mit — der Popup-/Redirect-Weg wird ihm über
`signInFlow` mitgegeben, nicht über `signInWithGoogle` aus dem
`googleAuthAdapter`.

`StyledLogin.tsx` sieht wie die Anmeldeseite aus, ist aber **nirgends
importiert**. Wer dort etwas ändert, ändert nichts an der laufenden App.

**FirebaseUI darf je Container nur einmal gestartet werden.** `ui.start()`
setzt die zuvor gestartete Instanz zurück (`if (In) { … In.reset() }` in
FirebaseUIs Render-Funktion), und `reset()` verwirft ein **laufendes**
Einlösen: Ergebnis auf `{user: null, credential: null}`, `redirectStatus`
gelöscht. Beim Redirect-Weg beginnt das Einlösen sofort beim Seitenaufbau —
ein zweiter Start dazwischen lässt die Anmeldung auf FirebaseUIs Wegwerf-App
`[DEFAULT]-firebaseui-temp` hängen, wo sie unsere App nie erreicht, und zwar
ohne Fehler und ohne Rückmeldung. Genau zwei Aufrufe passieren aber
regelmäßig, weil React Effekte im StrictMode doppelt aufruft; beim Popup
fällt es nicht auf, weil zwischen Seitenaufbau und Klick Sekunden liegen.
Dagegen steht [widgetGuard.ts](../src/components/firebase/widgetGuard.ts) —
bewusst ohne Gegenstück zum Freigeben, siehe dort.

Daraus folgt auch, dass FirebaseUI die Kontenverknüpfung bestimmt: Zu einer
Adresse, die schon ein Google-Konto hat, verweigert es den E-Mail-Weg mit
„You've already used … Sign in with Google to continue". Ein Login per
E-Mail-Link ist für solche Konten also kein Ausweichweg.

### Voraussetzung in der Google Cloud Console

**Jede Origin, die den Handler ausliefert, muss beim OAuth-Client als
Redirect-URI eingetragen sein** — `https://<origin>/__/auth/handler`. Fehlt
sie, antwortet Google mit `redirect_uri_mismatch`, und zwar erst mitten im
Login. Betroffen ist der Client „Web client (auto created by Google Service)"
im Projekt `ffn-utils`; einzutragen sind

- `https://einsatz.ffnd.at/__/auth/handler`,
- `https://einsatz-dev.ffnd.at/__/auth/handler`,
- `http://localhost:3000/__/auth/handler` für die lokale Entwicklung.

Der bestehende Eintrag `https://ffn-utils.firebaseapp.com/__/auth/handler`
bleibt stehen — ohne ihn bricht der Login für alle, die den Schalter nicht
gesetzt haben. Ein zusätzlicher Eintrag ändert für den alten Weg nichts, das
Eintragen ist also gefahrlos und muss **vor** dem ersten Test passieren.

Die Domains selbst stehen bereits unter „Authorized domains" in der
Firebase-Konsole; das ist Voraussetzung dafür, dass die App dort überhaupt
anmelden darf, und gilt schon für den Popup-Weg.
