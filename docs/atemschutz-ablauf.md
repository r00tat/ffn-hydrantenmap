# Atemschutz: der Ablauf mit und ohne Sammelplatz

Wer macht was, in welcher Reihenfolge, und wo genau die Uhr zu laufen beginnt.
Die beiden Nachbardokumente beschreiben je eine Seite —
[docs/atemschutzsammelplatz.md](atemschutzsammelplatz.md) die Logistik,
[docs/atemschutzueberwachung.md](atemschutzueberwachung.md) die Zeitkontrolle.
Dieses hier beschreibt, wie sie ineinandergreifen, und ist damit die Antwort
auf die Frage, die aus keinem der beiden allein hervorgeht: *Wann geht ein
Trupp unter Atemschutz?*

## Die drei Rollen

**Der Atemschutzsammelplatz (ASSP)** stellt Trupps bereit, rüstet sie aus,
füllt Flaschen und führt Buch darüber, wie viele Trupps verfügbar sind. Er ist
Bereitstellungsraum und Logistikstelle. „Diese übergeordnete
Atemschutzüberwachung hat ausschließlich logistische Aufgaben; sie führt KEINE
ZEITKONTROLLE durch." (FH-06 5.3.4)

**Die taktische Einheit** — Fahrzeug oder Gruppenkommandant — gibt den
Einsatzauftrag und führt ab diesem Moment die Einsatzzeitkontrolle.

**Der Trupp** meldet über Funk: Ankunft am Einsatzziel, Flaschendrücke,
Rückzug.

Der Satz, an dem das ganze Modell hängt:

> **Der Sammelplatz weiß nicht, wann der Trupp unter Atemschutz geht — das
> entscheidet die taktische Einheit.**

Deshalb gibt es zwischen `bereit` und `imEinsatz` den Zustand `zugeteilt`: Der
Trupp gehört einer Einheit, ist aber noch nicht angeschlossen.

## Ablauf mit Sammelplatz

| # | Wer | Handlung | Status | Gesetzt | Wirkung |
| --- | --- | --- | --- | --- | --- |
| 1 | ASSP | Trupp erfassen | `bereit` | `bereitSeit` | Steht in der Bereitschaft |
| 2 | ASSP | Ausrüstung zuordnen | `bereit` | `truppGeraete` | Flaschen, Masken, PA am Trupp |
| 3 | ASSP | „Entsenden" → an eine Einheit übergeben | `zugeteilt` | `entsendetAn`, `uebergabeZeit`, `druckUebergabe` | Ressource ist gebucht. **Keine** Uhr, **kein** Tagebucheintrag |
| 4 | Einheit | „In den Einsatz schicken" (Einsatzauftrag) | `imEinsatz` | `abmarschZeit`, `druckAbmarsch`, `auftrag`, `einsatzziel`, `ueberwachtVon`, `ueberwachungSeit`, `ueberwachungUids` | **Uhr startet** · **Tagebucheintrag** |
| 5 | Einheit | Ankunft am Einsatzziel melden | `imEinsatz` | `abfragen[]` mit `amZiel` | Rückmarschdruck wird berechenbar · **Tagebucheintrag** |
| 6 | Einheit | Zwischenabfragen | `imEinsatz` | `abfragen[]` | Gemessener Verbrauch, Drittelmarken erledigt |
| 7 | Einheit | Rückzug melden | `imEinsatz` | `abfragen[]` mit `rueckzug` | Warnungen enden · **Tagebucheintrag** |
| 8 | Einheit | „Rückkehr" | `zurueck` | `rueckkehrZeit`, `druckRueckkehr` | Einsatzdauer steht fest · **Tagebucheintrag** |
| 9 | Einheit | „An den Sammelplatz übergeben" | `zurueck` | `ueberwachungBis` | Zeitkontrolle beendet, Trupp ist Sache des ASSP |
| 10 | ASSP | „Wieder bereitstellen" | neue Zeile `bereit` | neuer `truppKey`-Eintrag mit `laufendeNummer + 1` | Flaschen getauscht, Masken bleiben am Träger |

**Sonderfall:** Ein zugeteilter Trupp, der doch nicht gebraucht wurde, geht
über „Rückkehr" auf `zurueck` — **ohne** Tagebucheintrag. Er war nie unter
Atemschutz, und ein Eintrag über einen Einsatz, den es nicht gab, machte das
Tagebuch falsch.

## Ablauf ohne Sammelplatz

Der häufigere Fall bei kleinen Lagen: Eine Einheit arbeitet allein, es gibt
niemanden, der Trupps bereitstellt. Dann erfasst die Einheit den Trupp selbst
auf der Seite der Atemschutzüberwachung.

| # | Wer | Handlung | Status | Wirkung |
| --- | --- | --- | --- | --- |
| 1 | Einheit | „Trupp erfassen" auf der Überwachungsseite | `bereit` | Mit taktischer Einheit, weil sie in derselben Sekunde feststeht |
| 2 | Einheit | „In den Einsatz schicken" (Einsatzauftrag) | `imEinsatz` | Uhr startet · Tagebucheintrag |
| 3 | Einheit | Meldungen, Rückzug, „Rückkehr" | `zurueck` | Wie oben, Zeilen 5–8 |
| 4a | Einheit | „Erneut in den Einsatz schicken" | neue Zeile `imEinsatz` | Regeneriert und sofort wieder hinein — in einem Schritt |
| 4b | Einheit | „Bereit zum Abmarsch" | neue Zeile `zugeteilt` | Trupp bleibt bei der Einheit und wartet auf den nächsten Auftrag |

Der Unterschied zwischen 4a und 4b ist genau der fehlende Abmarsch. 4b ist das
Gegenstück zu „wieder bereitstellen" am Sammelplatz, nur bleibt der Trupp hier
bei der Einheit — `ueberwachungBis` wird nicht gesetzt.

## Wo die Uhr startet

| Feld | Wer setzt es | Wofür es gilt |
| --- | --- | --- |
| `uebergabeZeit` | ASSP beim Zuteilen | Nachweis, wann die Ressource gebucht wurde. Rechnet **nichts** |
| `abmarschZeit` | Einheit mit dem Einsatzauftrag | „Uhrzeit beim Anschließen des Luftversorgungssystems" (FH-06). Ankerpunkt **jeder** Rechnung: Drittelmarken, gemessener Verbrauch, Rückzugszeitpunkt |
| `ueberwachungSeit` | Einheit mit dem Einsatzauftrag oder mit „Trupp übernehmen" | Wechsel der Verantwortung für die Zeitkontrolle (FH-06 5.3.4). Wird **nur beim ersten Mal** gesetzt |
| `ueberwachungBis` | Einheit mit „An den Sammelplatz übergeben" | Ende der Verantwortung. `ueberwachungSeit` bleibt dabei stehen — sonst wäre das Ende unlesbar |

**Warum das nicht ein Zeitpunkt ist.** Vorher setzte der Sammelplatz beim
Entsenden `abmarschZeit`, und der Zustand sprang gleich auf `imEinsatz`. Ein um
10:00 übergebener Trupp, der um 10:20 tatsächlich anschließt, bekam damit alle
seine Fristen zwanzig Minuten zu früh: Bei einem Standardgerät mit rund
40 Minuten rechnerischer Einsatzdauer ist ein Drittel schon verbraucht, bevor
der Trupp losgeht. Die Rückzugswarnung — die sicherheitsrelevante — kam
entsprechend früh, und eine Warnung, die regelmäßig zu früh kommt, wird
ignoriert. Genau deshalb ist `zugeteilt` ein eigener Zustand und keine
Beschriftung.

## Was ins Einsatztagebuch geht

Vier Ereignisse, jedes genau einmal je Bereitstellung:

| Ereignis | Ausgelöst durch | Merker |
| --- | --- | --- |
| Einsatzauftrag | Zustandswechsel → `imEinsatz` | `tagebuch.auftrag` |
| Ankunft am Einsatzziel | erste Meldung mit `amZiel` | `tagebuch.amZiel` |
| Rückzug angetreten | erste Meldung mit `rueckzug` | `tagebuch.rueckzug` |
| Rückkehr | Zustandswechsel `imEinsatz` → `zurueck` | `tagebuch.rueckkehr` |

Dazu die **freie Statusmeldung**: Sie entsteht nur, wenn im Dialog
„Druckabfrage / Status" der Haken *Eintrag ins Einsatztagebuch* gesetzt ist.
Sie bekommt keinen Merker — ein zweiter Haken ist eine zweite Meldung.

**Was bewusst nicht hineingeht:** die Zuteilung durch den Sammelplatz, die
Übergabe zurück an den Sammelplatz und die Wiederbereitstellung. Das sind
Ressourcenbuchungen, keine Einsatzereignisse. Stünden sie darin, ginge die
Einsatzlage zwischen der Logistik unter — und das Einsatztagebuch ist das
Dokument der Einsatzleitung, nicht das des Sammelplatzes.

Aufbau eines Eintrags: der Satz im Feld *Information*, der Kontext als
*Anmerkung*. Die taktische Einheit steht doppelt — in der Spalte „Meldung an"
und als erste Zeile der Anmerkung —, weil im Ausdruck des Tagebuchs die
Anmerkung das ist, was gelesen wird. Das Einsatzziel steht in der Anmerkung
nur dann, wenn es nicht schon im Satz steht.

```text
Information:  AS-Trupp Neusiedl 1 zur Menschenrettung in Keller Stiegenhaus links
Anmerkung:    LFA
              Huber, Sepp, Maier
              Abmarschdruck: 300 bar
```

Gebaut wird der Text in [truppDiaryEntry.ts](../src/components/Atemschutz/truppDiaryEntry.ts) —
rein und ohne React, die Wörter kommen vom Aufrufer. Geschrieben und gegen
Doppeleinträge gesichert wird er in
[useTruppTagebuch.ts](../src/components/Atemschutz/useTruppTagebuch.ts).

Der Merker ist ein **Punktpfad** (`tagebuch.amZiel`) und kein ganzes Objekt:
Zwei Geräte sehen denselben Trupp, und ein vollständig geschriebenes
`tagebuch` löschte den Schlüssel, den das andere Gerät eine Sekunde vorher
gesetzt hat. Dieselbe Überlegung wie bei `warnungen`.

Schlägt der Eintrag fehl, wird er verschluckt und nur in der Konsole vermerkt:
Der Zustandswechsel oder die Druckabfrage sind zu diesem Zeitpunkt schon
geschrieben, und ein fehlender Tagebucheintrag darf die Druckabfrage nicht
mitreißen.

## Überwachung ohne Übernahme

„Meine Einheit" ist eine Angabe über das **Gerät** und steht im
`localStorage`, nicht am Benutzer und nicht am Einsatz — auf einem Fahrzeug
teilen sich mehrere Leute ein Konto, und dieselbe Einheit gilt auch im nächsten
Einsatz.

Wer sie gesetzt hat, ist für die Trupps dieser Einheit zuständig, ohne dass
jemand „Trupp übernehmen" drückt: Die Seite trägt das eigene Konto still in
`ueberwachungUids` ein. Beschränkt ist das auf die jüngsten Zeilen
(`trupps.aktuell`), die nicht abgemeldeten und auf Benutzer mit Schreibrecht —
ein Seitenaufruf soll nicht in jede historische Zeile des Einsatzes schreiben.

Nötig ist der Eintrag für den **Push**. Warnungen entstehen auf zwei Wegen:

| Weg | Wer | Wann |
| --- | --- | --- |
| [useUeberwachungHinweise.ts](../src/components/Atemschutz/useUeberwachungHinweise.ts) | die geöffnete Seite | solange sie offen ist — Snackbar plus Systembenachrichtigung |
| [sendUeberwachungWarnungen.ts](../src/components/Atemschutz/sendUeberwachungWarnungen.ts) | Cloud Scheduler und Cloud Tasks | auch bei geschlossener Seite — aber nur an `ueberwachungUids` |

Ohne den stillen Eintrag bliebe das Telefon stumm, sobald die Seite zu ist —
und genau dann soll es läuten. „Trupp übernehmen" bleibt trotzdem: Es ist der
protokollierte **Wechsel** der überwachenden Stelle und trägt zusätzlich
Gerätesatz, Einsatzziel und den Namen der überwachenden Person nach.
