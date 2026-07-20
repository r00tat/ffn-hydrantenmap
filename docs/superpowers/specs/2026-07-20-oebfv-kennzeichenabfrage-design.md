# ÖBFV Kennzeichenabfrage — Design

Datum: 2026-07-20
Status: Entwurf zur Freigabe

## Ziel

Eine neue Seite `/kennzeichen`, über die autorisierte Feuerwehr-Benutzer die
technische Fahrzeugdaten-Abfrage der ÖBFV (feuerwehrapp.at) per Kennzeichen
durchführen können. Der Zugang erfolgt über einen pro Gruppe hinterlegten,
verschlüsselten Token. Jede Abfrage wird serverseitig protokolliert.

## Analyse der Quelle (feuerwehrapp.at/int)

Es handelt sich **nicht** um eine JSON-API, sondern um ein session-basiertes
PHP-Webformular:

1. `GET /int/index.php?token=<TOKEN>` — der Token authentifiziert als der
   zugehörige `@feuerwehr.or.at`-Benutzer ("via Link"). Setzt ein
   `PHPSESSID`-Cookie. Landet auf einer App-Übersicht mit zwei Subsystemen:
   - **EINSATZSYSTEM** → `int/kennzeichen/index.php` (echte
     KFZ-Zulassungsdatenbank, laut Betreiber **nur im Einsatzfall** zulässig)
   - **ÜBUNGSSYSTEM** → `int/kennzeichenuebung/index.php` (5 fixe
     Testkennzeichen: `FW-KFZ1`..`FW-KFZ5`)
2. `GET /int/kennzeichen/index.php` (mit Session-Cookie) — liefert das Formular.
   Das **Einsatzsystem** enthält ein verstecktes CSRF-Feld `fx` (pro Session
   erneuert). Das Übungssystem hat **kein** `fx`-Feld.
   ```html
   <form action="index.php" method="post">
     <input name="plate_pref"   maxlength="2"  placeholder="FW">   <!-- Behörde/Bezirkscode -->
     <input name="plate_number" maxlength="10" placeholder="104W"> <!-- Vormerkzeichen -->
     <input type="hidden" name="fx" value="...">                   <!-- nur Einsatzsystem -->
   </form>
   ```
3. `POST /int/{kennzeichen|kennzeichenuebung}/index.php` mit `plate_pref`,
   `plate_number` (+ `fx` im Einsatzsystem) + Cookie → Antwort ist dieselbe
   HTML-Seite mit einer Ergebnistabelle:
   ```text
   Daten aus Zulassung:
   Antrieb          Elektro (+ Icon-PNG)
   Marke            TESLA
   Name             Model 3
   Type             003
   Höchstzul. Masse 2305
   Erstzulassung    2019-06-27
   FIN              5YJ3E7EB3KF312345
   Variante / Version …
   ```
   Bei **Wechselkennzeichen** (zwei aufrechte Zulassungen) werden zwei Blöcke
   (Fahrzeug 1 / Fahrzeug 2) untereinander gelistet.

Konsequenz: Die Abfrage muss **serverseitig als Proxy** laufen (CORS,
Session-Cookie, Token-Geheimhaltung).

## Architektur

Spiegelt das bestehende `blaulicht-sms`-Muster (pro Gruppe verschlüsselte
Credentials in eigener Firestore-Collection, admin-verwaltet, Server Actions
mit Auth-Guards).

### 1. Token-Ablage — `src/app/kennzeichen/configActions.ts`

- Firestore-Collection `oebfvKennzeichenConfig`, Dokument-ID = `groupId`
- Felder: `tokenEncrypted` (AES-256-GCM), `updatedAt`, `updatedBy`
- Verschlüsselung: **Wiederverwendung** von `encryptPassword`/`decryptPassword`
  aus `src/server/blaulichtsms/encryption.ts` (bestehender
  `BLAULICHTSMS_ENCRYPTION_KEY`, kein neues Secret).
- Actions:
  - `getConfig(groupId)` — `actionAdminRequired`, liefert `{ groupId, hasToken, updatedAt, updatedBy }` (nie Token-Klartext/Ciphertext)
  - `saveConfig(groupId, { token? })` — `actionAdminRequired`; leerer Token behält bestehenden
  - `deleteConfig(groupId)` — `actionAdminRequired`
  - `hasConfig(groupId)` — `actionUserRequired`, bool
  - `getGroupsWithConfig()` — `actionUserRequired`, gefiltert auf Mitgliedschaft (wie `groupFilter`/`legacyGroup` bei blaulicht-sms; Admins sehen alle)

### 2. Config-UI im GroupDialog — `src/app/groups/GroupDialog.tsx`

Neuer Abschnitt analog zu den BlaulichtSMS-Feldern: ein Passwort-Feld
"ÖBFV Kennzeichenabfrage-Token" (mit Anzeigen/Verbergen), Anzeige
"zuletzt geändert am … von …". Speichern/Löschen beim Dialog-Submit.

### 3. Abfrage-Action — `src/app/kennzeichen/queryActions.ts`

- Guard: `actionUserRequired()` + Prüfung, dass der Benutzer Mitglied der
  angefragten Gruppe ist (bzw. Admin).
- Ablauf mit manueller Cookie-Weitergabe (Node-`fetch`, kein Cookie-Store):
  1. `GET /int/index.php?token=<decrypted>` → `PHPSESSID` aus `Set-Cookie`
  2. `GET /int/{kennzeichen|kennzeichenuebung}/index.php` mit Cookie → `fx` parsen
  3. `POST` mit `plate_pref`, `plate_number`, `fx` + Cookie
  4. Antwort-HTML an Parser übergeben
- Signatur:
  `queryKennzeichen(groupId, { platePrefix, plateNumber, system }): Promise<KennzeichenResult>`
  mit `system: 'einsatz' | 'uebung'` (Default `'einsatz'`).
- **Protokollierung (Pflicht):** Vor Rückgabe wird ein Audit-Eintrag
  geschrieben (siehe unten) — für **beide** Systeme.

### 4. Parser — `src/app/kennzeichen/parseVehicleData.ts` (rein, testbar)

- Extrahiert je `<table class="table">`-Block die Felder: `antrieb`, `marke`,
  `name`, `type`, `hoechstMasse`, `erstzulassung`, `fin`, `variante`, `version`.
- Rückgabe `Vehicle[]` (mehrere Einträge = Wechselkennzeichen);
  leeres Array = kein Treffer.

### 5. Protokollierung — `src/app/kennzeichen/queryLog.ts`

Dediziertes, **serverseitiges** Log (nicht das firecall-gebundene `auditlog`,
da die Seite auch außerhalb eines Einsatzes läuft). Serverseitig geschrieben,
damit es nicht umgangen werden kann und garantiert den authentifizierten
Benutzer erfasst.

- Firestore-Collection `oebfvKennzeichenLog`
- Felder pro Abfrage: `user` (Session-E-Mail), `timestamp` (ISO),
  `groupId`, `system` (`einsatz`/`uebung`), `plate` (`prefix + number`),
  `resultCount`, `success` (bool), optional `firecallId` falls Kontext vorhanden.
- Wird von `queryKennzeichen` bei **jeder** Abfrage geschrieben (Erfolg wie
  Fehler).
- Kein UI-Zugriff in diesem Scope (reine Protokollierung); Auswertung über
  Firestore/Admin möglich. (Optionale Admin-Ansicht später.)

### 6. UI — `src/app/kennzeichen/page.tsx` (Client Component)

- Zwei Felder: **Behörde** (`maxLength 2`, uppercase) + **Vormerkzeichen**
  (`maxLength 10`, uppercase), SUCHEN-Button.
- **Einsatz/Übung-Toggle**, Default **Einsatz**.
- Bei Einsatz: roter Warnhinweis "Abfragen nur im Einsatzfall — jede Abfrage
  wird protokolliert". Bei Übung: Info-Hinweis + Liste der 5 Testkennzeichen.
- Ergebnis als MUI-Tabelle/Cards; Antriebsart mit Icon/Chip. Mehrere Fahrzeuge
  (Wechselkennzeichen) untereinander.
- "Kein Token konfiguriert"-Hinweis wenn `hasConfig` false (analog blaulicht-sms).
- Gruppe wird wie bei blaulicht-sms aus dem Firecall-Kontext (`firecall.group`)
  bzw. der Gruppenmitgliedschaft des Benutzers bestimmt.

### 7. Navigation — `src/components/site/AppDrawer.tsx`

Neuer Eintrag `{ text: t('kennzeichen'), icon: <…>, href: '/kennzeichen' }`,
sichtbar für Mitglieder einer Gruppe mit konfiguriertem Token.

## Datenfluss

```text
Browser (page.tsx)
  └─ queryKennzeichen(groupId, {prefix, number, system})   [Server Action]
       ├─ actionUserRequired() + Mitgliedschaftsprüfung
       ├─ configActions: Token laden + entschlüsseln
       ├─ fetch GET  index.php?token=…      → PHPSESSID
       ├─ fetch GET  {system}/index.php     → fx (nur Einsatz)
       ├─ fetch POST {system}/index.php     → Ergebnis-HTML
       ├─ parseVehicleData(html)            → Vehicle[]
       ├─ queryLog: Audit-Eintrag schreiben (immer)
       └─ return { vehicles, system }
```

## Fehlerbehandlung

- Kein Token / keine Gruppe → Hinweis-UI, keine Abfrage.
- Abgelaufene Session oder ungültiges `fx` → einmaliger Retry (Session neu
  aufbauen), dann Fehlermeldung.
- Ungültiges/unbekanntes Kennzeichen → leeres Ergebnis → "Keine Zulassung
  gefunden" (trotzdem protokolliert).
- Netzwerk-/Upstream-Fehler → Fehlermeldung; Log mit `success: false`.

## Tests (TDD)

- `parseVehicleData.test.ts` — gegen echte HTML-Fixtures (Einsatz-Formular,
  Übungs-Antwort, Wechselkennzeichen-Fall, Leer-Fall). Fixtures wurden aus dem
  echten Übungssystem gezogen und werden unter dem Feature-Ordner abgelegt.
- `configActions.test.ts` — Guards, Verschlüsselung/Entschlüsselung, Filterung
  nach Mitgliedschaft (analog `credentialsActions.test.ts`).
- `queryLog.test.ts` — Log-Eintrag wird mit korrektem Benutzer/Feldern erzeugt.
- Page-Component-Test mit `renderWithIntl` — Grundzustände (kein Token,
  Ergebnis, Warnhinweis).

## i18n

Neuer Namespace `kennzeichen` in `messages/de.json` **und** `messages/en.json`
(gleicher Schlüsselbaum). Drawer-Label `kennzeichen` ergänzen. Keine
hartkodierten deutschen Strings im JSX.

## Bewusst nicht im Scope (YAGNI)

- Admin-UI zur Auswertung des Abfrage-Logs (Firestore reicht vorerst).
- Verlauf/History der eigenen Abfragen in der UI.
- Autocomplete/Validierung von Bezirkscodes.
