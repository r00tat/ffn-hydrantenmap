# Sprach-Assistent: Live-Gespräch auf der Karte

Der Assistent auf der Karte hat zwei Wege zum Modell. Beide führen über
dieselben Werkzeuge und denselben Kartenkontext — sie unterscheiden sich nur
darin, wie Ton und Antwort übertragen werden.

| | Live-Sitzung | Einzelaufruf |
| --- | --- | --- |
| Datei | [useAiLiveAssistant.ts](../src/hooks/aiAssistant/useAiLiveAssistant.ts) | [useAiAssistant.ts](../src/hooks/aiAssistant/useAiAssistant.ts) |
| Dienst | Gemini Developer API, direkt | Agent Platform über Firebase AI Logic |
| Zugangsmittel | kurzlebiges Token je Gespräch | öffentlicher Browser-Key + App Check |
| Modell | `GEMINI_LIVE_MODEL` | `GEMINI_MODEL` |
| Ton hinein | PCM-Strom während des Sprechens | WebM am Stück nach dem Sprechen |
| Ton heraus | vom Modell gesprochen | `/api/tts`, sonst Browser-Sprachsynthese |

Der Live-Weg ist der Normalfall, der Einzelaufruf der Rückfall. Beide bleiben
im Code, und zwar dauerhaft — die Gründe stehen unten.

## Warum der Kartenkontext zu Beginn hinausgeht und nicht am Ende

Die erste Fassung öffnete die Sitzung beim Druck auf den Knopf, schickte den
Kartenkontext mit dem **abschließenden** Beitrag hinaus und schloss die Sitzung,
sobald die Antwort gesprochen war — ein Befehl je Tastendruck. Das hat nicht
getragen, und der Grund steckt im Protokoll:

Die Live-API erkennt die Sprechpause selbst. Sie wartet nicht darauf, dass der
Browser den Sprecherwechsel schließt, sondern schließt ihn, sobald es still
wird, und antwortet sofort. In einer gemessenen Sitzung sah das so aus:

```text
<< {gehoert: 'Lage im Einsatz'}
<< {tonbloecke: 1, gesagt: 'Es liegen derzeit keine '}   <- Antwort läuft schon
<< {turnComplete: true}                                  <- Turn bereits zu
>> Ton gesendet: {bloecke: 3752, sekunden: 10.2}         <- jetzt erst loslassen
>> Beitrag abgeschlossen: {teile: 2, zeichen: 3499}      <- Kontext kommt zu spät
```

Die Folgen reihum:

- Das Modell wählte sein Werkzeug **ohne Kartenkontext** und ohne den Hinweis,
  dass eine Frage zu beantworten und nicht abzulegen ist. „Wie ist die aktuelle
  Lage?" landete als Tagebucheintrag.
- Die Tonblöcke lagen beim Loslassen längst in der Warteschlange und erreichten
  die Wiedergabe erst dann — die Antwort war zu hören, nachdem der Benutzer
  fertig war, nicht während.
- Die Antwort auf den nachgereichten Kontext kam als **zweiter**
  Sprecherwechsel und fiel unter den Tisch, weil die Sitzung da schon zu war.

Deshalb jetzt umgekehrt: Der Kontext geht **einmal zu Beginn** hinaus, als
Beitrag ohne `turnComplete` — er liegt dem Gespräch bei, ohne eine Antwort
auszulösen. Danach folgt `CONVERSATION_PROMPT`, und erst dann geht das Mikrofon
auf. Wenn das Modell sein Werkzeug wählt, weiß es, was auf der Karte steht.

## Warum die Sitzung ein ganzes Gespräch lang lebt

Die Sitzung lebt vom „Gespräch starten" bis zum „Gespräch beenden" und trägt
beliebig viele Sprecherwechsel. Das Mikrofon bleibt offen, der Server erkennt
die Pause, das Modell antwortet, und wer ihm ins Wort fällt, unterbricht es.

Der Knopf mit dem Haken ist **nicht** mehr die Sprechtaste, sondern nur noch
das ausdrückliche „ich bin fertig": Er schickt `audioStreamEnd` und schließt
den Beitrag sofort, statt die Sprechpause abzuwarten. Ohne ihn geht es auch.

Was diese Entscheidung kostet, und wie es aufgefangen ist:

- **Der Kartenkontext veraltet.** Deshalb wird er nach jedem abgeschlossenen
  Beitrag nachgereicht — aber nur, wenn er sich geändert hat (`sentContextRef`).
  Ein Werkzeug „aktuellen Kartenstand holen" bliebe die Alternative; es wäre ein
  Werkzeug mehr unter 32 und ein Modellaufruf mehr je ortsbezogenem Befehl.
- **Die Schleife läuft länger als ein Render.** `runLiveConversation` startet
  einmal und bekommt `executeTool` mit; der Kontext wird über `sendContext`
  gebaut. Beide schließen über `existingItems` und `lastCreatedItem` ein.
  Hielte die Schleife die Fassung vom Gesprächsbeginn, fände „nicht das KLF,
  sondern das KRF" das eben angelegte KLF nicht („Element nicht gefunden"), und
  der nachgereichte Kontext wäre immer der alte — und würde, weil unverändert,
  gar nicht erst geschickt. Deshalb gehen beide wie die Rückrufe über ein Ref,
  das jedem Render folgt. Innerhalb *eines* Werkzeugaufrufs mit mehreren
  Funktionen bleibt der Stand der des Aufrufbeginns.
- **Zeitgrenze und Wiederaufnahme.** Eine Audio-Sitzung endet nach rund
  15 Minuten und fasst 128k Token; ein Einsatz dauert Stunden. Ein Gespräch ist
  keine Einsatzdauer — es dauert Minuten, und danach wird neu gestartet.
  `goingAwayNotice` und `sessionResumptionUpdate` werden deshalb weiterhin
  entgegengenommen und verworfen.
- **Das Mikrofon ist offen, solange das Gespräch läuft.** An der Einsatzstelle
  stehen Pumpe, Funk und Zurufe im Raum, und die Spracherkennung der Live-API
  lässt sich derzeit nicht konfigurieren. Ein Fehlauslöser antwortet hier nicht
  nur, sondern legt ein Element auf der Karte an. Deshalb ist das Gespräch
  ausdrücklich zu starten und ausdrücklich zu beenden, und der Knopf pulst
  rot, solange es läuft.

## Warum die Blöcke des Mikrofons gesammelt werden

Ein `process()`-Aufruf des AudioWorklet liefert 128 Bilder — bei 48 kHz sind
das 2,7 ms, nach der Umrechnung auf 16 kHz rund 85 Byte. Jeder Block einzeln
verschickt ergab in der oben zitierten Messung **3752 WebSocket-Nachrichten für
zehn Sekunden**: 375 pro Sekunde, jede mit JSON- und base64-Aufschlag um ein
Vielfaches größer als ihre Nutzlast. Beim Einzelbefehl blieb das unbemerkt, im
Dauergespräch läuft es durchgehend. `CHUNK_MS` in
[liveAudio.ts](../src/hooks/aiAssistant/liveAudio.ts) sammelt deshalb im
Audio-Thread auf 100 ms — die Blockgröße, mit der die Live-API in ihren eigenen
Beispielen gefüttert wird, und weit unter allem, was als Verzögerung auffällt.

## Warum nicht `startAudioConversation`

Das Firebase-SDK bringt mit `startAudioConversation` genau die Klammer mit, die
man hier vermuten würde: Mikrofon, Nachrichtenschleife und Wiedergabe in einem
Aufruf, samt `functionCallingHandler` für die Werkzeuge. Zwei Eigenschaften
machen es hier unbrauchbar:

1. Sein `stop()` räumt beim Beenden **auch die geplante Wiedergabe** ab
   (`cleanup()` ruft `interruptPlayback()`). Damit wäre jedes Beenden ein
   Abbruch mitten im Satz.
2. Es verbraucht den Nachrichtenstrom selbst. Werkzeugergebnisse, Abschrift und
   das Ende des Sprecherwechsels sind von außen nicht mehr zu sehen — der Toast
   bekäme keinen Text, und niemand wüsste, wann die Sitzung geschlossen werden
   darf.

Deshalb sind Aufnahme und Wiedergabe in [liveAudio.ts](../src/hooks/aiAssistant/liveAudio.ts)
zwei getrennte Einheiten mit **eigenem `AudioContext`**, und die
Nachrichtenschleife liegt offen in
[liveConversation.ts](../src/hooks/aiAssistant/liveConversation.ts).

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
Dadurch bleibt [liveConversation.ts](../src/hooks/aiAssistant/liveConversation.ts)
vom Verbindungsaufbau unberührt.

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

- **Gedächtnis über die Sitzung hinaus.** Der Einzelaufruf hält eine Historie
  über 15 Minuten (`MEMORY_TIMEOUT_MS`), damit „und wie weit ist das?" auch nach
  einer Pause noch dieselbe Sache meint. Das Live-Gespräch erinnert sich
  innerhalb der Sitzung an alles, aber mit dem Beenden ist es vergessen. Die
  Rückfrage-Optionen des Toasts laufen deshalb weiterhin über den Einzelaufruf
  (`processText`).
- **Denkaufwand steuern.** `ThinkingLevel.LOW` gibt es nur beim Einzelaufruf;
  die Live-API nimmt derzeit keine Konfiguration dafür entgegen.

## Abschrift

Mit Tonausgabe liefert das Modell keinen Text mehr. Beides — `inputAudioTranscription`
und `outputAudioTranscription` — ist deshalb eingeschaltet:

- Die **Ausgabe-Abschrift** ist die Antwort im Toast und alles, was
  protokolliert werden kann.
- Die **Eingabe-Abschrift** ist die einzige Kontrolle darüber, ob der
  gesprochene Beitrag richtig angekommen ist. Beim Einzelaufruf steht das in den
  Werkzeugargumenten, hier sonst nirgends. In der Konsole steht sie als
  `[AI-Live] verstanden:` — ist sie leer, hat das Modell den Satz nie bekommen,
  und jede Werkzeugwahl danach ist geraten.

Die Abschrift kommt in Bruchstücken („Das TLFA " / „ist eingetragen.") und wird
in [liveConversation.ts](../src/hooks/aiAssistant/liveConversation.ts)
zusammengesetzt. Die Ausgabe-Abschrift geht dabei **schon während des
Sprechens** als `onPartialAnswer` hinaus: Die Meldung soll mit der Stimme
erscheinen und nicht, wenn der Satz zu Ende gesprochen ist.

## Wann Werkzeuge zusammengelegt werden

Jedes Werkzeug kostet zweimal: Seine Deklaration geht in jedem Einzelaufruf und
im Token der Live-Sitzung mit, und es ist eine weitere Wahl, die das Modell bei
jedem Satz treffen muss. Zusammengelegt wird deshalb, was **gleich aufgebaut ist
und sich nur in einer Art unterscheidet**:

- `createMarker` legt über `kind` auch die Einsatzleitung (`el`) und den
  Atemschutzsammelplatz (`assp`) an. Beide sind eigene Elementtypen, haben aber
  keine eigenen Felder. Weil der Typ nicht mehr aus dem Werkzeugnamen folgt,
  gibt der Handler ihn als `createdItemType` im Ergebnis zurück.
- `calculateStrahlenschutz` rechnet über `formel` alle vier Formeln des
  Strahlenschutz-Rechners. Jede Formel ist „gib alle Größen bis auf eine an";
  die Parameter überschneiden sich nur in `r`, dessen Beschreibung beide
  Bedeutungen nennt.

Bewusst **nicht** zusammengelegt sind Werkzeuge mit eigenen Feldern und eigener
Logik — Fahrzeug, taktische Einheit, Rohr, Kreis, Tagebuch und Geschäftsbuch,
die Atemschutztrupps (Anlegen, Status, Meldung) und die beiden
Fahrtenbuch-Werkzeuge (Schreiben gegen Nachsehen). Ein „lege irgendein Element
an" oder „mach etwas mit dem Trupp" macht deren Parameter unscharf, und die
Unterscheidung wandert vom Werkzeugnamen, auf den das Modell verlässlich
auswählt, in ein Feld, das es leichter falsch belegt.

Der MCP-Zugang behält `el` und `assp` als eigene Typen von `create_item`
([writeTools.ts](../src/server/mcp/writeTools.ts)) und bildet sie auf
`createMarker` mit `kind` ab; seine Strahlenschutz-Tools in
[calcTools.ts](../src/server/mcp/calcTools.ts) sind ein eigenes Tool-Set und
bleiben getrennt.

## „Links neben dem TLFA": Richtung statt fester Versatz

`nearItem` setzte früher immer rund 20 m schräg rechts oben ab. „Links" und
„rechts" ließen sich nicht ausdrücken, jeder Aufruf landete auf demselben
Punkt, und das Modell meldete trotzdem „steht jetzt links". Die Position
trägt deshalb `direction` (`left`, `right`, `above`, `below`) und `distance`
in Metern ([resolveOrigin.ts](../src/hooks/aiAssistant/resolveOrigin.ts)).
Links heißt Westen: Die Karte ist genordet und nicht drehbar, der Benutzer
meint die Seite, die er auf dem Bildschirm sieht. Der Ost-West-Versatz ist
mit dem Kosinus der Breite gerechnet, damit 20 m auch 20 m sind.

Beim Verschieben fällt das verschobene Element aus der Suche nach dem
Bezug — sonst findet „neben das TLF" beim Verschieben eines TLF das Fahrzeug
selbst. `updateItem` meldet zurück, wohin das Element kam („links neben
"TLFA 4000"") und ob der Bezug fehlte. Aus dieser Rückmeldung baut das Modell
seine Antwort; eine Verschiebung ohne Aufruf zu behaupten, verbietet der
Systemprompt ausdrücklich.

Messpunkte werden in Himmelsrichtungen angesagt („weiterer Datenpunkt 10 m
nordöstlich"), deshalb kennt `direction` auch `north` … `southwest`. Und sie
beziehen sich auf den vorigen Punkt, der keinen unterscheidbaren Namen hat —
alle heißen „Messung". `nearItem`/`atItem` **ohne** `itemName` meint daher das
zuletzt angelegte Element (`itemId` aus `lastCreatedItem`, gesetzt in
`mitBezug`). Vorher fiel eine solche Angabe still auf Standort oder
Kartenmitte zurück, alle Punkte lagen übereinander, und das Modell meldete
trotzdem „10 m nordöstlich". Deshalb nennt jetzt auch `createMarker` in der
Rückmeldung, wo der Punkt tatsächlich liegt, samt fehlendem Bezug.

## Was das Modell von einem Element sieht und ändern kann

Das Modell sieht nicht das ganze Dokument, sondern die Projektion aus
[itemDto.ts](../src/common/mcp/itemDto.ts), und ändern kann es nur, was
`updateItem` als Feld führt. Ein Feld, das dort fehlt, gibt es für das Modell
nicht — es sagt dann zu Recht, dass es das nicht kann. Wer ein Feld
sprachfähig machen will, braucht beides: das Feld in der Projektion, damit
das Modell den jetzigen Wert kennt, und den Parameter an `updateItem`.

Die Drehung ist so ein Feld. `rotation` setzt den Winkel, `rotateBy` dreht
vom jetzigen aus weiter; beides in Grad im Uhrzeigersinn, wie der Griff auf
der Karte, und „nach rechts" ist positiv. Das relative Feld gibt es, weil
„noch 45° weiter" die übliche Anweisung ist und das Modell sonst selbst
rechnen müsste. Gedreht werden nur Fahrzeuge und Rohre — dieselben Typen,
deren `isRotatable()` wahr ist; bei allen anderen liegt `rotation` zwar im
Dokument, die Karte zeigt sie aber nicht. Die Projektion nennt die Drehung nur,
wenn sie nicht 0 ist.

Die übrigen Felder der Dialoge — Feuerwehr, Besatzung, Zeiten, Durchfluss,
Radius und so fort — stehen je Typ in
[editableFields.ts](../src/hooks/aiAssistant/editableFields.ts). Die Liste
liegt dort und nicht in den Elementklassen, weil die an Leaflet hängen und im
MCP-Server nicht laden; ein Test prüft sie gegen `fields()` der Klassen. Ein
Feld, das der Typ nicht hat, lehnt `updateItem` mit den änderbaren Feldern ab
und schreibt dann gar nichts — ein halb übernommener Befehl wäre schlimmer als
eine Rückfrage. Zeiten nimmt es als „jetzt", „14:30" oder ISO und speichert
ISO, wie der Dialog.

## Ebenen und Messwerte: „Neue Messung 37 Millisievert pro Stunde"

Eine Ebene kann Datenfelder haben (`dataSchema`: Schlüssel, Bezeichnung,
Einheit, Typ, auch berechnete Felder), die Werte liegen am Element in
`fieldData`. Der Kontext führt die Ebenen mit ihren Feldern und `activeLayer`;
die Werte der Messpunkte holt das Modell mit `findItems` (siehe unten). `createMarker` und `updateItem` nehmen `layer`
und `values`; die Logik steht in
[layerFields.ts](../src/hooks/aiAssistant/layerFields.ts).

- **Aktive Ebene.** Ohne genannte Ebene kommt ein neuer Marker in die zuletzt
  gewählte, `lastSelectedLayer` des `MapEditorProvider` — dieselbe, die die
  Oberfläche beim Anlegen vorbelegt. Eine genannte Ebene wird danach zur
  aktiven, damit „noch eine Messung, 40" ohne erneute Angabe dort landet. Der
  MCP-Server hat keine aktive Ebene; dort muss die Ebene genannt werden.
- **Einheiten rechnet der Code, nicht das Modell.** Das Modell gibt Zahl und
  gesagte Einheit weiter („37", „mSv/h"), `convertUnit` rechnet über
  SI-Vorsätze derselben Grundeinheit in die Einheit des Felds. Ein Faktor 1000
  zwischen Milli- und Mikrosievert ist genau der Fehler, der einem Modell
  unterläuft und im Einsatz nicht auffallen darf. Unverträgliche Einheiten
  (ppm gegen µSv/h) werden abgelehnt statt still übernommen.
- **Berechnete Felder und Vorgaben** wie im Dialog: Nach dem Setzen rechnet
  `computeAllFields` die Formeln neu; ein neues Element bekommt die
  Vorgabewerte der Ebene. Ein berechnetes Feld lässt sich nicht setzen.
- **Alles oder nichts.** Fehlt die Ebene, ein Feld oder ist ein Wert
  unlesbar, wird nichts angelegt; die Rückmeldung nennt die vorhandenen
  Ebenen bzw. Felder, damit das Modell nachfragen kann.

Ebene und `fieldData` stehen damit auch in der Projektion des MCP-Servers.

## Ebenen anlegen und ändern

„Lege eine Ebene EX-Messung an mit UEG in Prozent" geht an `editLayer`, ein
Werkzeug mit `action` `create` oder `update` — wie bei `createMarker` mit
`kind` beschreiben beide dieselben Angaben (Name, Datenfelder). Die Logik der
Felder steht in [layerSchema.ts](../src/hooks/aiAssistant/layerSchema.ts) und
folgt dem `DataSchemaEditor`:

- **Der Schlüssel entsteht aus der Bezeichnung** (`slugify`, doppelte bekommen
  `_2`) und bleibt beim Umbenennen stehen — die Werte der Elemente hängen an
  ihm.
- **Ändern statt doppelt anlegen.** Ein Eintrag, dessen Bezeichnung einem
  vorhandenen Feld entspricht oder der es in `field` nennt, ändert dieses.
  „Dosisleistung in Millisievert" legt also kein zweites Feld an.
- **Einheit und Typ bleiben, sobald Elemente Werte tragen.** Aus 5 µSv/h
  würden sonst stillschweigend 5 mSv/h; umrechnen und alle Punkte neu
  schreiben wäre die Alternative, ist aber ein Massenschreibvorgang, den
  niemand angesagt hat. Das Werkzeug lehnt ab und nennt die Zahl der Punkte.
- **Formeln werden geprüft**, bevor gespeichert wird: Jeder Name muss ein
  Schlüssel eines nicht berechneten Felds oder eine Funktion von mathjs sein.
  Das gilt auch beim Entfernen — ein Feld, von dem eine Formel abhängt, bleibt.
- **Eine neue Ebene wird aktiv**, damit die nächste Messung dort landet. Ohne
  genannte Ebene ändert `update` die aktive. Eine gleichnamige zweite Ebene
  wird nicht angelegt.
- Löschen ist bewusst nicht dabei: Beim Löschen einer Ebene werden alle ihre
  Elemente mitgelöscht, das bleibt der Oberfläche.

„Rückgängig" nimmt eine angelegte Ebene nicht zurück — `lastCreatedItem`
sucht in den Kartenelementen, und Ebenen sind keine.

## Der Kontext ist ein Überblick, Details holt `findItems`

Früher lag jedes Element mit Koordinaten im Kontext. Das trägt nicht: eine
Messreihe hat schnell hundert Punkte, das Einsatztagebuch wächst über Stunden,
und beides geht in der Live-Sitzung bei jedem neuen Element erneut hinaus.
Deshalb trägt der Kontext ([contextBuilder.ts](../src/hooks/aiAssistant/contextBuilder.ts))
nur noch, was für Zuordnung und Rückfragen nötig ist:

- `existingItems`: die benannten Elemente — Fahrzeuge, Marker, Leitungen —
  mit ID, Namen und Feldern, aber **ohne** Koordinaten und `fieldData`. Das
  reicht, damit „das TLFA" auf eine ID auflöst; Positionen rechnet ohnehin
  `resolveOrigin` im Code, nicht das Modell.
- `itemCounts`: wie viele Elemente je Typ es gibt, auch die nicht geführten.
- `latestDiary`: die fünf jüngsten Tagebucheinträge ohne Text, damit
  „der letzte Eintrag" und Anschlussfragen funktionieren.
- `layers`: Messebenen (mit Datenfeldern oder Radiacode) nur als Zahl der
  Punkte und jüngster Punkt mit seinen Werten — „die letzte Messung war 40"
  bleibt so ohne Abfrage zuordenbar. Ihre Punkte fehlen in `existingItems`.

Alles andere fragt das Modell mit `findItems` ab
([findItems.ts](../src/hooks/aiAssistant/findItems.ts)): nach Typ, Text (Name,
Feuerwehr, Beschreibung), Ebene, Feldwert mit Grenzen und Umkreis um eine
Position, sortiert nach neu, nah, höchstem oder niedrigstem Wert, höchstens 50
Treffer. Die Treffer kommen mit Koordinaten, `fieldData` und Tagebuchtext.
Grenzen in einer anderen Einheit („über 10 mSv/h") rechnet derselbe
`convertUnit` wie beim Setzen in die Einheit des Felds, je Ebene — zwei
Ebenen können dasselbe Feld in verschiedenen Einheiten führen.

Der Prompt sagt dem Modell ausdrücklich, dass der Kontext unvollständig ist
und es nie behaupten darf, etwas gebe es nicht, nur weil es im Überblick fehlt.
Der MCP-Server bekommt `findItems` nicht; dort gibt es schon `list_items`.

## Werkzeuge, die die Karte verlassen

Die meisten Werkzeuge schreiben Elemente des laufenden Einsatzes oder rechnen.
Zwei Gruppen schreiben woanders hin: das Fahrtenbuch und die
Atemschutzüberwachung. Für beide gilt dasselbe wie für die Kartenwerkzeuge —
kein „Rückgängig", Fehlschläge als Rückfrage im Gespräch —, sie kommen aber auf
verschiedenen Wegen ans Ziel.

### Das Fahrtenbuch

`createFahrtenbuchEntry` trägt eine Fahrt ins Fahrtenbuch ein — „Lege einen
Fahrtenbucheintrag für das RLFA an, Kilometerstand 1723, gefahren bin ich."
Es schreibt in die Stammdaten einer Gruppe. Drei Dinge fallen dadurch
anders aus:

- **Es läuft über eine Server Action**, nicht über Firestore im Browser. Die
  Fahrzeug- und Personenlisten der Gruppe sind auf der Karte nicht geladen, und
  die Gruppe wird aus dem Einsatz abgeleitet statt vom Client entgegengenommen.
  Warum, steht in [fahrtenbuch.md](fahrtenbuch.md#eine-fahrt-diktieren).
- **Es kennt kein „Rückgängig".** Der Knopf nimmt Kartenelemente über
  `lastCreatedItem` zurück; eine Fahrt ist keins, und `createdItemId` bleibt
  deshalb leer. Eine falsch diktierte Fahrt wird im Fahrtenbuch gelöscht — dort
  gilt ohnehin ein eigenes Änderungsrecht.
- **Seine Fehlschläge sind Rückfragen.** „Kein Fahrzeug „Drehleiter" im
  Fahrtenbuch. Vorhanden sind: …" geht als Werkzeugergebnis zurück ins
  Gespräch. Im Gespräch ist das der billigste Weg: Das Modell liest den Satz
  vor, die Einsatzkraft antwortet, und der zweite Versuch trifft. Ein
  `askClarification` wäre ein zusätzlicher Sprecherwechsel für dieselbe Frage.

Über den MCP-Zugang gibt es die Fahrt nicht: Dessen Token ist auf **einen
Einsatz** ausgestellt und sagt nichts über die Mitgliedschaft in der Gruppe aus,
die das Fahrtenbuch verlangt. `createServerToolDeps` weist den Weg deshalb
ausdrücklich ab, statt ihn offen zu lassen.

### Die Atemschutzüberwachung

`createAtemschutzTrupp`, `setAtemschutzTruppStatus` und
`recordAtemschutzTruppReport` führen die Zeitkontrolle — „Trupp 1 geht rein,
280 bar", „Trupp 1 hat 190 bar". Anders als das Fahrtenbuch laufen sie **im
Browser** über
[useTruppAssistant.ts](../src/components/Atemschutz/useTruppAssistant.ts),
denn jede Aktion an einem Trupp hat auf der Überwachungsseite Nebenwirkungen:
Einsatztagebuch, Warntermin, Push-Registrierung. Eine Server Action hätte sie
nachbauen müssen, und ein Sprachbefehl ohne Warntermin wäre eine stille Frist.
Warum das so ist und welche Rückfragen es gibt:
[atemschutzueberwachung.md](atemschutzueberwachung.md#per-sprach-assistent).

Die laufenden Trupps stehen als `atemschutzTrupps` im Kontext — nur wenn es
welche gibt, damit ein Einsatz ohne Atemschutz nicht jeden Beitrag mit einer
leeren Liste belastet. Über den MCP-Zugang sind die drei Werkzeuge ebenso
ausgesperrt wie das Fahrtenbuch: Ein dort entsendeter Trupp hätte kein Gerät,
das seine Warnungen abonniert.

## Was gemeinsam bleibt

[useAiToolRunner.ts](../src/hooks/aiAssistant/useAiToolRunner.ts) hält
Positionsauflösung, Werkzeugausführung, Kartenkontext und das Gedächtnis über
zuletzt angelegte Elemente. Beide Wege hängen daran, denn was ein
Werkzeugaufruf bewirkt, darf nicht davon abhängen, über welche Leitung er
hereinkam.

Eine Folge davon ist im Knopf zu sehen: „Rückgängig" fragt beide Hooks, weil
jeder nur das zurücknehmen kann, was er selbst angelegt hat.
