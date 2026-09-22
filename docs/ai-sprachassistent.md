# Sprach-Assistent: Live-Sitzung je Sprachbefehl

Der Assistent auf der Karte hat zwei Wege zum Modell. Beide führen über
dieselben Werkzeuge und denselben Kartenkontext — sie unterscheiden sich nur
darin, wie Ton und Antwort übertragen werden.

| | Live-Sitzung | Einzelaufruf |
| --- | --- | --- |
| Datei | [useAiLiveAssistant.ts](../src/hooks/aiAssistant/useAiLiveAssistant.ts) | [useAiAssistant.ts](../src/hooks/aiAssistant/useAiAssistant.ts) |
| Dienst | Gemini Developer API, direkt | Agent Platform über Firebase AI Logic |
| Zugangsmittel | kurzlebiges Token je Befehl | öffentlicher Browser-Key + App Check |
| Modell | `GEMINI_LIVE_MODEL` | `GEMINI_MODEL` |
| Ton hinein | PCM-Strom während des Sprechens | WebM am Stück nach dem Sprechen |
| Ton heraus | vom Modell gesprochen | `/api/tts`, sonst Browser-Sprachsynthese |

Der Live-Weg ist der Normalfall, der Einzelaufruf der Rückfall. Beide bleiben
im Code, und zwar dauerhaft — die Gründe stehen unten.

## Warum die Sitzung nur einen Befehl lang lebt

Die Live-API ist für ein laufendes Gespräch gebaut: Verbindung auf, Mikrofon
offen, Modell und Mensch reden abwechselnd, bis jemand auflegt. Genau das
macht der Assistent **nicht**. Er öffnet die Sitzung beim Druck auf den
Knopf und schließt sie, wenn die Antwort zu Ende gesprochen ist.

Das ist keine halbe Umsetzung, sondern die Entscheidung, an der alles Weitere
hängt:

- **Der Kartenkontext kann nicht veralten.** Er geht wie beim Einzelaufruf mit
  dem abschließenden Beitrag frisch hinaus. In einer stehenden Sitzung stünde
  der Stand vom Verbindungsaufbau im Kontext, und nach zehn Minuten Einsatz
  wäre er falsch — mit einem Werkzeug „aktuellen Kartenstand holen" wäre das zu
  lösen, aber es wäre ein Werkzeug mehr unter 32 und ein Modellaufruf mehr je
  ortsbezogenem Befehl.
- **Zeitgrenze und Wiederaufnahme spielen keine Rolle.** Eine Audio-Sitzung
  endet nach rund 15 Minuten und fasst 128k Token; ein Einsatz dauert Stunden.
  Ohne stehende Sitzung braucht es weder `resumeSession` noch die Behandlung
  von `goingAwayNotice`.
- **Das Mikrofon ist zu, solange niemand drückt.** An der Einsatzstelle stehen
  Pumpe, Funk und Zurufe im Raum, und die Spracherkennung der Live-API lässt
  sich derzeit nicht konfigurieren. Ein Fehlauslöser würde hier nicht nur
  antworten, sondern ein Element auf der Karte anlegen.

## Warum nicht `startAudioConversation`

Das Firebase-SDK bringt mit `startAudioConversation` genau die Klammer mit, die
man hier vermuten würde: Mikrofon, Nachrichtenschleife und Wiedergabe in einem
Aufruf, samt `functionCallingHandler` für die Werkzeuge. Zwei Eigenschaften
machen es für den Sprechtasten-Betrieb unbrauchbar:

1. Sein `stop()` räumt beim Beenden **auch die geplante Wiedergabe** ab
   (`cleanup()` ruft `interruptPlayback()`). Beim Loslassen der Taste wäre
   damit genau die Antwort weg, auf die der Benutzer wartet.
2. Es verbraucht den Nachrichtenstrom selbst. Werkzeugergebnisse, Abschrift und
   das Ende des Sprecherwechsels sind von außen nicht mehr zu sehen — der Toast
   bekäme keinen Text, und niemand wüsste, wann die Sitzung geschlossen werden
   darf.

Deshalb sind Aufnahme und Wiedergabe in [liveAudio.ts](../src/hooks/aiAssistant/liveAudio.ts)
zwei getrennte Einheiten mit **eigenem `AudioContext`**: Das Mikrofon endet beim
Loslassen, die Wiedergabe läuft weiter, bis sie leer ist.

## Warum die Live-Sitzung ohne Firebase-SDK auskommt

Für Gemini 3 gibt es die Live-API ausschließlich über die Gemini Developer API.
Der naheliegende Weg dorthin wäre ein zweites Firebase-AI-Logic-Backend
(`GoogleAIBackend`) — er ist gebaut worden und hat nicht getragen:

```text
WebSocket connection closed by server.
Reason: 'Requests from referer <empty> are blocked.'
```

Der Grund ist die Referrer-Bindung des öffentlichen Browser-Keys. Ein Browser
schickt auf einem WebSocket-Upgrade **keinen `Referer`**, der Key-Prüfer sieht
`<empty>` und weist ab. Der Einzelaufruf ist nicht betroffen, weil er ein
gewöhnliches HTTPS-Request ist und den Header mitschickt. Die Sperre ließe sich
nur lösen, indem man einen Key ohne Application-Restriction erlaubt — also genau
das, was [api-keys.md](api-keys.md) verbietet.

Der Ausweg ist, **gar keinen Key in den Browser zu geben**:

1. [aiLiveToken.ts](../src/app/actions/aiLiveToken.ts) (Server Action) prüft mit
   `actionUserRequired()` die Sitzung, zählt das Tageskontingent und prägt mit
   dem geheimen `GEMINI_LIVE_API_KEY` ein kurzlebiges Token
   (`POST /v1beta/auth_tokens`).
2. Der Browser bekommt nur dieses Token und verbindet damit auf
   `…GenerativeService.BidiGenerateContentConstrained?access_token=…`
   ([liveConnection.ts](../src/hooks/aiAssistant/liveConnection.ts)).

Weil in der Anfrage kein API-Key mehr steckt, gibt es auch keine
Referrer-Regel, die greifen könnte. Das Problem ist nicht umgangen, sondern
entfallen.

### Was im Token festgenagelt ist

[aiLiveToken.ts](../src/common/aiLiveToken.ts) baut den Token-Rumpf **ohne
`fieldMask`**. Das ist die entscheidende Auslassung: Liegt ein
`bidiGenerateContentSetup` vor und keine Maske, gilt das Setup des Tokens
vollständig und das Setup, das der Browser beim Verbinden schickt, wird
verworfen. Modell, Systemanweisung, Werkzeuge und Ausgabeform stehen damit
serverseitig fest — ein veränderter Client kann weder die Systemanweisung
austauschen noch ein teureres Modell wählen.

Dazu `uses: 1` und 60 Sekunden Frist zum Verbinden: Ein abgefangenes Token
taugt für nichts mehr, wenn die Sitzung schon offen ist.

Zwei Kleinigkeiten, die den direkten Weg vom SDK-Weg unterscheiden und beide im
Code kommentiert sind: Die Schema-Typen der Werkzeuge müssen groß geschrieben
werden (`'object'` → `'OBJECT'`), weil der Firebase-Proxy diese Umschrift bisher
übernommen hat; und die beiden Abschriften gehören in das `setup`, nicht in die
`generationConfig`.

### Warum die Verbindung von Hand gebaut ist

`@firebase/ai` hängt an die WebSocket-Adresse fest `?key=<apiKey>` und kennt nur
den Firebase-Proxy-Pfad — `WebSocketUrl` liest nicht einmal `baseUrl` aus den
`singleRequestOptions`. Es gibt also keine Stelle, an der sich ein Token
unterschieben ließe. [liveConnection.ts](../src/hooks/aiAssistant/liveConnection.ts)
baut die Verbindung deshalb selbst nach und reicht die Nachrichten in **genau
der Form** weiter, die das SDK geliefert hat (`{type: 'serverContent', …}`).
Dadurch bleibt [liveTurn.ts](../src/hooks/aiAssistant/liveTurn.ts) unverändert.

Die API-Fassung ist `v1alpha`, nicht `v1beta`: So steht es im Live-Modul des
offiziellen `js-genai`, das bei jeder anderen Fassung warnt. Die
Übersichtsseite der Doku nennt `v1beta` — im Zweifel gilt der Code.

## App Check gilt hier nicht — und das ist kein Loch mehr

App Check erzwingt je Firebase-Dienst, bei diesem Projekt unter dem Altnamen
`firebaseml.googleapis.com`. `generativelanguage.googleapis.com` ist kein
Firebase-Dienst; dort gibt es nichts zu erzwingen, und der Browser schickt auf
dem WebSocket ohnehin keine eigenen Header.

Der Schutz wandert damit von der Plattform zur Anwendung, und er wird dabei
schärfer statt schwächer:

| | Einzelaufruf | Live-Sitzung |
| --- | --- | --- |
| Prüft | App Check: „eine echte Instanz der App" | Server Action: „dieser angemeldete, freigeschaltete Benutzer" |
| Kostendeckel | keiner | `uses: 1`, 60 s, Modell im Token festgenagelt |
| Missbrauch skaliert | über den öffentlichen Key | nur über ein Benutzerkonto, begrenzt durch das Tageskontingent |

Das Tageskontingent steht in
[liveTokenQuota.ts](../src/server/ai/liveTokenQuota.ts): ein Firestore-Dokument
je Benutzer und Tag (`aiLiveQuota/{uid}_{JJJJ-MM-TT}`), geschrieben ausschließlich
vom Admin-SDK — deshalb braucht es dafür keine Firestore-Regel. Fällt Firestore
aus, wird durchgelassen: Ein Sprachbefehl im Einsatz darf nicht an der
Buchhaltung scheitern.

Im Cloud-Projekt richtet Terraform alles ein: den Dienst
`generativelanguage.googleapis.com`, einen **eigenen** API-Key dafür
(`google_apikeys_key.gemini_live` in
[project-base/secrets.tf](../terraform/modules/project-base/secrets.tf), mit
API-Restriction genau auf diesen einen Dienst und ohne
Application-Restriction), und den Key-String als Secret-Version unter
`GEMINI_LIVE_API_KEY`. Von Hand ist nichts zu tun. Dieser Dienst gehört
**nicht** in den öffentlichen Browser-Key; warum, steht in
[api-keys.md](api-keys.md).

## Der Rückfall ist kein Notnagel

Scheitert das Prägen des Tokens oder der Verbindungsaufbau, nimmt der Knopf
still den Einzelaufruf und
merkt sich das für den Rest der Sitzung
([AiAssistantButton.tsx](../src/components/Map/AiAssistantButton.tsx)). Der
Benutzer spricht zu diesem Zeitpunkt bereits — eine Fehlermeldung hülfe ihm
nicht, ein funktionierender Weg schon.

Dass es diesen Weg weiterhin gibt, ist Absicht: Die kurzlebigen Tokens sind
als Preview gekennzeichnet, das Live-Modell ebenfalls, und beides steht ohne
Zusagen zu Verfügbarkeit und Abkündigung. Ohne gesetztes `GEMINI_LIVE_API_KEY`
— lokal der Normalfall — gibt die Server Action `unconfigured` zurück und der
Assistent arbeitet unverändert weiter. Der Einzelaufruf ist
dagegen ein einzelner HTTPS-Request, der sich wiederholen lässt — im Funkloch
an der Einsatzstelle das robustere Verfahren.

## Was der Einzelaufruf kann und die Live-Sitzung nicht

- **Gedächtnis über mehrere Befehle.** Der Einzelaufruf hält eine Historie über
  15 Minuten (`MEMORY_TIMEOUT_MS`), damit „und wie weit ist das?" noch dieselbe
  Sache meint. Die Live-Sitzung endet mit dem Befehl; eine Folgefrage beginnt
  von vorn. Die Rückfrage-Optionen des Toasts laufen deshalb weiterhin über den
  Einzelaufruf (`processText`).
- **Denkaufwand steuern.** `ThinkingLevel.LOW` gibt es nur beim Einzelaufruf;
  die Live-API nimmt derzeit keine Konfiguration dafür entgegen.

## Abschrift

Mit Tonausgabe liefert das Modell keinen Text mehr. Beides — `inputAudioTranscription`
und `outputAudioTranscription` — ist deshalb eingeschaltet:

- Die **Ausgabe-Abschrift** ist die Antwort im Toast und alles, was
  protokolliert werden kann.
- Die **Eingabe-Abschrift** ist die einzige Kontrolle darüber, ob der
  Sprachbefehl richtig angekommen ist. Beim Einzelaufruf steht das in den
  Werkzeugargumenten, hier sonst nirgends.

Die Abschrift kommt in Bruchstücken („Das TLFA " / „ist eingetragen.") und
wird in [liveTurn.ts](../src/hooks/aiAssistant/liveTurn.ts) zusammengesetzt.

## Was gemeinsam bleibt

[useAiToolRunner.ts](../src/hooks/aiAssistant/useAiToolRunner.ts) hält
Positionsauflösung, Werkzeugausführung, Kartenkontext und das Gedächtnis über
zuletzt angelegte Elemente. Beide Wege hängen daran, denn was ein
Werkzeugaufruf bewirkt, darf nicht davon abhängen, über welche Leitung er
hereinkam.

Eine Folge davon ist im Knopf zu sehen: „Rückgängig" fragt beide Hooks, weil
jeder nur das zurücknehmen kann, was er selbst angelegt hat.
