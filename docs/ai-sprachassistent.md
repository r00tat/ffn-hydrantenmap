# Sprach-Assistent: Live-Sitzung je Sprachbefehl

Der Assistent auf der Karte hat zwei Wege zum Modell. Beide führen über
dieselben Werkzeuge und denselben Kartenkontext — sie unterscheiden sich nur
darin, wie Ton und Antwort übertragen werden.

| | Live-Sitzung | Einzelaufruf |
| --- | --- | --- |
| Datei | [useAiLiveAssistant.ts](../src/hooks/aiAssistant/useAiLiveAssistant.ts) | [useAiAssistant.ts](../src/hooks/aiAssistant/useAiAssistant.ts) |
| Backend | Gemini Developer API (`GoogleAIBackend`) | Agent Platform (`VertexAIBackend`, `global`) |
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

## Warum zwei Backends nebeneinander

Für Gemini 3 gibt es die Live-API ausschließlich über die Gemini Developer API.
Das Agent-Platform-Backend, über das der übrige Assistent und die Auswertungen
laufen, führt nur die 2.5er-Live-Modelle. `getAI` schlüsselt seine Instanz je
Backend, beide dürfen also nebeneinander bestehen —
[vertexai.ts](../src/components/firebase/vertexai.ts) bleibt unverändert, die
Live-Sitzung hängt an [liveAi.ts](../src/components/firebase/liveAi.ts).

Zu tun ist das im Firebase-Projekt einmal: **`generativelanguage.googleapis.com`
aktivieren** — im Projekt, **nicht** am Browser-Key. Der Browser ruft den Dienst
nie auf, die AI Logic tut es hinter ihrem Proxy; am Key wäre der Eintrag nur
eine offene Flanke (Begründung in [api-keys.md](api-keys.md)). Solange die
Freischaltung fehlt, scheitert `connect()` — was kein Ausfall ist, siehe unten.

## App Check deckt die Live-Verbindung nicht ab

Das ist der offene Punkt dieser Bauweise, und er ist im SDK nachzulesen
(`@firebase/ai` 12.19.0):

- Der **Einzelaufruf** geht per `fetch` hinaus. `getHeaders()` setzt
  `x-goog-api-key`, **`X-Firebase-AppCheck`** und `Authorization: Firebase <ID-Token>`.
  Hier greift App Check samt Replay-Schutz (`useLimitedUseAppCheckTokens`).
- Die **Live-Sitzung** ist ein WebSocket. `WebSocketUrl.toString()` hängt
  ausschließlich `?key=<Browser-Key>` an, und die `setup`-Nachricht trägt weder
  App-Check- noch Auth-Token. Browser können auf einem WebSocket-Handshake keine
  eigenen Header setzen — das ist keine Nachlässigkeit des SDK, sondern eine
  Grenze der Plattform.

Daraus folgt zweierlei, und was davon zutrifft, muss **vor dem Ausrollen in dev
gemessen werden**: Entweder die erzwungene App-Check-Prüfung weist den Handshake
ab — dann läuft der Assistent dauerhaft im Rückfall und die Live-Sitzung bringt
nichts. Oder der WebSocket-Endpunkt ist von der Erzwingung ausgenommen — dann
hängt er allein am Browser-Key, und wer den aus dem Bundle liest, kann auf
Rechnung des Projekts Sitzungen öffnen.

Bis das geklärt ist, gilt für die Live-Sitzung der Grundsatz aus
[api-keys.md](api-keys.md) nicht, dass hinter jedem Dienst am Key entweder
Firestore-Regeln oder App Check stehen. Gegenmittel, unabhängig vom Ausgang:
ein Kontingent (Quota) auf `firebasevertexai.googleapis.com` im Cloud-Projekt
und ein Budget-Alarm, damit der Schaden im Missbrauchsfall begrenzt und sichtbar
ist.

## Der Rückfall ist kein Notnagel

Scheitert der Verbindungsaufbau, nimmt der Knopf still den Einzelaufruf und
merkt sich das für den Rest der Sitzung
([AiAssistantButton.tsx](../src/components/Map/AiAssistantButton.tsx)). Der
Benutzer spricht zu diesem Zeitpunkt bereits — eine Fehlermeldung hülfe ihm
nicht, ein funktionierender Weg schon.

Dass es diesen Weg weiterhin gibt, ist Absicht: Die Live-API des Web-SDK ist
als `@beta` gekennzeichnet, das Live-Modell ist ein Preview-Modell, und beides
steht ohne Zusagen zu Verfügbarkeit und Abkündigung. Der Einzelaufruf ist
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
