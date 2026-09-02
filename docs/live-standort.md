# Live-Standort der Einsatzkräfte

Wer im Einsatz „Standort teilen" drückt, schreibt seine Position nach
`call/{einsatzId}/livelocation/{docId}`; alle im Einsatz berechtigten Benutzer
lesen die Collection und sehen die Marker im Overlay „Live-Standorte". Die
Bedienung steckt in [src/components/LiveLocation/](../src/components/LiveLocation/),
das Schreiben in [useLiveLocationShare.ts](../src/hooks/useLiveLocationShare.ts),
das Lesen in [useLiveLocations.ts](../src/hooks/useLiveLocations.ts).

Dieses Dokument hält das fest, was sich aus dem Code nicht ableiten lässt.

## Ein Dokument je Gerät, nicht je Benutzer

Die Dokument-ID ist `<uid>_<deviceId>` ([`liveLocationDocId`](../src/common/liveLocation.ts)).
Ursprünglich war sie die bloße uid — mit zwei Folgen, die zusammen dafür
sorgten, dass ein Konto auf mehreren Geräten nie funktionierte:

- Beide Geräte schrieben **dasselbe** Dokument und überschrieben sich
  gegenseitig. Es gab nie zwei Positionen, sondern eine, die zwischen den
  Geräten hin- und hersprang.
- Der Lesepfad filtert die **eigene** Freigabe weg (die eigene Position kommt
  schon vom `PositionMarker`) — bei einer ID je Benutzer traf das auch das
  andere Gerät desselben Kontos.

Das ist keine Randerscheinung: bei der FF Neusiedl laufen mehrere Tablets unter
demselben Google-Konto. Gefiltert wird deshalb **dieses Gerät**, nicht das
Konto.

Die Geräte-ID liegt im `localStorage`
([`liveLocationDeviceId`](../src/common/liveLocationDevice.ts)) und muss dort
stabil bleiben: wechselt sie, hinterlässt jedes Teilen ein zweites Dokument,
das erst die TTL nach einer Stunde wegräumt — bis dahin steht der eigene Pin
doppelt auf den Karten der anderen. Ohne `localStorage` (SSR, gesperrter
Speicher) bleibt sie leer, und es gilt wieder ein Dokument je Benutzer.

**Die Firestore-Regeln hängen am Aufbau der ID.** Sie erlauben nur Dokumente,
deren ID die eigene uid ist oder mit `<uid>_` beginnt, gefolgt von
`[A-Za-z0-9]+`. Wer das Format der Geräte-ID ändert, muss die Regeln in
`firebase/dev/` **und** `firebase/prod/` mitziehen — sonst lehnt der Server
jedes Schreiben ab. Die bloße uid bleibt bewusst erlaubt: Clients der
Vorgängerversion schreiben noch dorthin und müssen ihr Altdokument löschen
können.

Aus demselben Grund räumen Web und Android beim **ersten** Schreiben einer
Sitzung das Altdokument unter der bloßen uid weg.

## Der Heartbeat kommt nicht von der Geolocation

`navigator.geolocation.watchPosition` ist kein Taktgeber. Auf dem Desktop
(Standort aus dem Netz) liefert es genau einen Fix und danach nur bei echter
Bewegung, und in einem Hintergrund-Tab drosselt der Browser die Callbacks ganz
weg. Wer die Freigabe an die Positions-Updates hängt, lässt `updatedAt` stehen —
und wer stillsteht, fällt nach `STALE_HARD_CUTOFF_MS` (5 min) aus den Karten
aller anderen heraus, obwohl die Freigabe noch läuft und der Knopf weiter
pulsiert.

`LiveLocationProvider` hat deshalb einen **eigenen** Takt. Er liest die letzte
Position aus einem Ref, damit er nicht bei jedem Fix neu anläuft, und die
Drosselung bleibt allein in `useLiveLocationShare`: geschrieben wird höchstens
einmal je `heartbeatMs`. Der Tick öffnet nur das Zeitfenster.

Auf Android bleibt der Takt beim Foreground-Service
([`LiveLocationPusher`](../capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/livelocation/LiveLocationPusher.kt)) —
ein zweiter Takt aus dem WebView wäre nur eine Verdoppelung der
Schreibvorgänge. Der Web-Takt hält sich per `isNativeGpsTrackingAvailable()`
heraus.

## Zwei Zeitgrenzen, zwei Aufgaben

- `STALE_HARD_CUTOFF_MS` (5 min) blendet einen Standort **in der Oberfläche**
  aus. Sie ist eine Sicherheitsgrenze: eine 20 Minuten alte Position ist im
  Einsatz schlimmer als keine.
- `TTL_EXPIRY_MS` (1 h) ist das `expiresAt`-Feld für die **Firestore-TTL**. Sie
  räumt Dokumente weg, die niemand mehr löscht — abgestürzter Tab, Akku leer.

Beim regulären Beenden löscht der Client sein Dokument selbst, damit der Marker
sofort verschwindet und nicht erst nach der TTL.

## Das Gerät am Namen

Zwei Marker derselben Person müssen unterscheidbar sein, sonst stehen zwei
gleiche Namen auf der Karte. Das Label kommt grob aus dem User-Agent
(`deviceLabelFromUserAgent`: „Android", „Windows", …) — es dient allein der
Unterscheidung, nicht der Inventarisierung, und ist bei drei gleichen Tablets
entsprechend stumpf.

Angezeigt wird es **nur**, wenn dieselbe Person mehrfach auf der Karte steht
(`showDeviceLabel` aus `useLiveLocations`). Sonst hinge an jedem Marker ein
„(Android)", das nichts unterscheidet. Im Popup steht das Gerät immer, wenn es
bekannt ist.

## Berechtigungen

`read` auf `livelocation` hat jeder im Einsatz berechtigte Benutzer —
ausdrücklich `callAuthorized()` und nicht `callWriteAuthorized()`. Die eigene
Standortfreigabe ist keine Bearbeitung des Einsatzes, sondern eine Information
an die Einsatzleitung, und genau dafür sind Nur-Lese-Gäste (externe Kräfte,
Nachbarwehr) da. Geschrieben und gelöscht wird nur das eigene Dokument.

Der Lesepfad hängt **nicht** an der eigenen Freigabe: die Einsatzleitung teilt
selbst nichts und muss die Kräfte trotzdem sehen. `useLiveLocations` bekommt den
Sharing-Status nirgends herein, und der Layer ist in `Map.tsx` fest eingehängt.
