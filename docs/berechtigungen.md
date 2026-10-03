# Berechtigungen

Wer darf was — und warum es so gebaut ist. Der Code entscheidet an wenigen
Stellen; dieses Dokument nennt sie und begründet die Bauform.

## Die Rollen

| Rolle | Feld | Umfang | Wer vergibt sie |
| --- | --- | --- | --- |
| **Globaler Admin** | `user/{uid}.isAdmin` | alles, in jeder Gruppe, plus `/admin/*` und die Benutzerverwaltung | ein globaler Admin in `/users` |
| **Gruppen-Admin** | `user/{uid}.groupAdmin: string[]` | alle administrativen Aufgaben *einer* Gruppe | ein globaler Admin in `/groups` |
| **Gerätemeister** | `user/{uid}.fahrtenbuchGeraetemeister: string[]` | Fahrtenbuch einer Gruppe: jeden Eintrag korrigieren, Fahrzeuge und Personen pflegen | ein Admin **oder Gruppen-Admin** der Gruppe, im Einstellungen-Tab der Fahrtenbuch-Verwaltung |
| **Gruppenmitglied** | `user/{uid}.groups: string[]` | Einsätze, Fahrtenbucheinträge und Mängel der Gruppe | ein globaler Admin in `/groups` oder `/users` |
| **Einsatz-Gast** | `user/{uid}.firecall` | genau ein Einsatz, lesend oder schreibend, mit Ablauf | jedes Gruppenmitglied über den Share-Link |

Der Gruppen-Admin **schließt den Gerätemeister ein**: Er darf alles, was
gruppenbezogen administrativ ist, und das Fahrtenbuch gehört dazu. Umgekehrt
gilt das nicht — ein Gerätemeister kommt nicht an Gruppeneinstellungen,
Share-Links, PDF-Import oder das Löschen von Mängeln.

## Was der Gruppen-Admin bewusst nicht darf

- **Benutzer freischalten oder Gruppen zuordnen.** Ein Benutzerdokument ist
  gruppenübergreifend: Wer `groups` schreiben darf, trägt sich selbst in jede
  Gruppe ein. Das bleibt beim globalen Admin.
- **Weitere Gruppen-Admins ernennen.** Die Rolle vermehrte sich sonst ohne
  Zutun eines globalen Admins. Für Vertretung trägt der globale Admin mehrere
  Gruppen-Admins ein.
- **`/admin/*` betreten.** Die Seiten dort — Datenpflege, Cluster, MCP,
  Bug-Reports, gelöschte Elemente — sind nicht auf eine Gruppe begrenzt.

## Warum die Gruppenrollen am Benutzerdokument stehen

`groupAdmin` und `fahrtenbuchGeraetemeister` sind Listen von Gruppen-IDs am
**Benutzerdokument**, nicht Listen von Benutzern am Gruppendokument. Grund ist
der Leseweg: Am Benutzerdokument nehmen sie denselben Weg wie `isAdmin` und
`groups` — über `getUserSessionData` in die Session und von dort in den
Client. Jede andere Ablage kostete beim Sitzungsaufbau eine zusätzliche
Abfrage und jede Seite, die die Rolle kennen muss (Drawer, Seitenschutz,
Bearbeiten-Knöpfe), einen Server-Action-Roundtrip.

Manipulationssicher ist das, weil `/user/{uid}` in den Firestore-Regeln nur
`read` erlaubt und der Catch-all am Dateiende Schreibrechte an `adminUser()`
bindet — dasselbe Dokument trägt schon `isAdmin`.

## Kein Custom Claim

Die Gruppenrollen stehen **nicht** in den Firebase-Custom-Claims. Die
Firestore-Regeln brauchen sie nicht: Alles, was ein Gruppen-Admin oder
Gerätemeister schreibt, läuft über Server Actions mit dem Admin SDK. Ein Claim
erzwänge dagegen bei jeder Rollenänderung einen Token-Refresh.

Sichtbare Folge in den Regeln: `groups/{groupId}/person` und `/vehicle` tragen
weiterhin `allow write: if adminUser()`. Das ist kein Widerspruch — ein
Gruppen-Admin schreibt dort nie direkt aus dem Client.

## Die Entscheidungsstellen

| Ort | Frage |
| --- | --- |
| [`isGroupAdmin(groupId, user)`](../src/common/groupPermissions.ts) | Darf der Benutzer diese Gruppe administrieren? |
| `hasAnyGroupAdminRole(user)` (dito) | Soll eine Verwaltungsseite überhaupt erreichbar sein? |
| [`isFahrtenbuchManager(groupId, user)`](../src/components/Fahrtenbuch/managerPermissions.ts) | Darf er das Fahrtenbuch dieser Gruppe verwalten? |
| [`assertTenantGroup(groupId)`](../src/app/groups/groupTypes.ts) | Ist die Gruppen-ID überhaupt ein Mandant? |

Die Guards für Server Actions kommen alle aus [`src/app/auth.ts`](../src/app/auth.ts):

| Guard | Verlangt |
| --- | --- |
| `actionUserRequired()` | angemeldet und freigeschaltet |
| `actionAdminRequired()` | globaler Admin |
| `actionGroupAdminRequired(groupId)` | globaler Admin **oder** Gruppen-Admin *mit Mitgliedschaft* |
| `actionGroupMemberRequired(groupId)` | Mitglied der Gruppe (Fahrtenbuch) |
| `actionFahrtenbuchManagerRequired(groupId)` | Admin, Gruppen-Admin oder Gerätemeister der Gruppe |
| `actionUserAuthorizedForFirecall(id)` | Zugriff auf diesen Einsatz (Mitglied oder Gast) |

`actionGroupAdminRequired` liegt als Implementierung in
[`groupAdminGuard.ts`](../src/app/groups/groupAdminGuard.ts) und wird von
`auth.ts` nur weitergereicht: Dort hängen NextAuth und das Firebase Admin SDK
am Import, und diese Entscheidung ist eine Sicherheitsgrenze, die für sich
testbar sein soll.

### Die Asymmetrie ist Absicht

Der globale Admin braucht **keine** Mitgliedschaft in der Gruppe, der
Gruppen-Admin und der Gerätemeister schon. Verlangte man sie auch vom Admin,
nähme man ihm ein Recht, das er unter `actionAdminRequired()` immer hatte.

### `allUsers` ist keine Gruppe

`assertTenantGroup` lehnt jede ID aus `NON_TENANT_GROUP_IDS` ab. `allUsers`
steht in den Claims **jedes** Benutzers und in denen jedes Einsatz-Gasttokens
— ein „Admin von allUsers" wäre Admin für jeden. `kostenersatz` ist eine
Berechtigungsgruppe und keine Feuerwehr. Dieselbe Sperre steht als
`fahrtenbuchMember()` in den Firestore-Regeln.

## Drei Fallen beim Ändern einer Gruppenrolle

- **`arrayUnion`/`arrayRemove` statt die Liste neu zu schreiben.** Zwei
  Admins, die gleichzeitig zwei *verschiedene* Gruppen pflegen, fassen dasselbe
  Benutzerdokument an und überschrieben sich sonst gegenseitig.
- **`userSessionCache.invalidate(uid)` nicht vergessen.** Die Session liest
  über einen Cache mit 60 s Lebensdauer; ohne Invalidierung bliebe eine
  Rollenänderung bis zum Ablauf wirkungslos — dieselbe Falle wie in
  `updateUser.ts`.
- **Die Mitgliedschaft ist Voraussetzung.** Wer die Gruppe verlässt, verliert
  in [`updateGroupAction`](../src/app/groups/GroupAction.ts) auch `groupAdmin`
  und `fahrtenbuchGeraetemeister` für diese Gruppe. Ohne das bliebe eine
  schlafende Rolle stehen, die beim Wiedereintritt unbemerkt wieder wirksam
  würde.

## Zwischenspeicher der Anmeldung für den Kaltstart ohne Netz

Die Rechte der Oberfläche (`isAuthorized`, `isAdmin`, `groups`, `groupAdmin`,
`fahrtenbuchGeraetemeister`, `firecall`) kommen aus der NextAuth-Sitzung und
aus `getMyGroupsFromServer` — beides braucht den Server. Ohne Netz zeigte die
App nach einem Neustart deshalb den Login-Bildschirm, obwohl Firebase Auth den
Benutzer aus IndexedDB kennt und Firestore die Daten im Cache hat.
[`offlineAuthCache.ts`](../src/hooks/auth/offlineAuthCache.ts) hält die
zuletzt **am Server bestätigten** Rechte deshalb in localStorage, und
`useFirebaseLoginObserver` nimmt sie, wenn der Server nicht antwortet.

**Warum das vertretbar ist:** Der Zwischenspeicher öffnet nur die Oberfläche.
Keine Entscheidungsstelle oben liest ihn: Die Server-Guards prüfen die Sitzung,
die Firestore-Regeln das ID-Token. Offline erfasste Schreibvorgänge prüft der
Server beim Synchronisieren nach den Regeln, die dann gelten; was abgelehnt
wird, erscheint in der Fehlerliste (siehe [offline-modus.md](offline-modus.md)).
Wer am Gerät localStorage von Hand ändert, sieht also Menüs, aber keine Daten,
die ihm Firestore nicht ohnehin aus dem Cache dieses Geräts gibt — und die
liegen dort nur, weil er sie vorher lesen durfte.

Die Grenzen, und warum sie so gezogen sind:

- **Nur am Server bestätigte Rechte werden gespeichert:** geschrieben wird erst,
  wenn die NextAuth-Sitzung zu genau diesem Firebase-Benutzer
  (`session.user.id === uid`) geantwortet hat. Aus dem Zwischenspeicher selbst
  wird nie zurückgeschrieben, sonst verlängerte sich die Frist offline von
  selbst.
- **Gelesen nur ohne Server:** wenn die App schon weiß, dass sie offline ist,
  sonst erst nach acht Sekunden ohne Antwort oder beim Fehlschlag der Anmeldung.
  Antwortet der Server später doch noch oder kommt die Verbindung zurück
  (`onReconnect`), gilt wieder seine Prüfung.
- **72 Stunden ab der letzten Bestätigung.** Das trägt einen Einsatz über ein
  Wochenende, ohne dass ein Gerät, dem die Freigabe entzogen wurde, wochenlang
  die Oberfläche zeigt. Ein Zeitstempel aus der Zukunft gilt als ungültig, eine
  verstellte Uhr verlängert also nichts. Ein **Einsatz-Gast** behält höchstens
  bis zum Ende seines Gastzugangs (`firecallExpiresAt`).
- **An die Firebase-UID gebunden.** Meldet sich am selben Gerät jemand anderer
  an, erbt er nichts. Die vorläufige Anzeige beim Kaltstart (Browser meldet
  `navigator.onLine === false`, Firebase Auth hat den Benutzer noch nicht
  geladen) verschwindet wieder, wenn danach kein oder ein anderer Benutzer
  kommt; `hasFirebaseUser` bleibt bis dahin false, Listener laufen also nicht.
- **Eine nicht freigegebene Anmeldung löscht den Eintrag** — entzieht ein Admin
  die Freigabe und war das Gerät seither einmal online, hilft auch der
  Kaltstart ohne Netz nicht mehr.
- **Beim Abmelden gelöscht.**

Ein abgelaufenes ID-Token blockiert offline nichts: Firestore reiht
Schreibvorgänge lokal ein und holt sich das Token erst zum Übertragen; die
lokalen Schreibhelfer gehen bewusst nicht über `withFreshAuth`
([offline-modus.md](offline-modus.md)). Die Anmeldeschritte, die den Server
brauchen (`getIdToken` bei abgelaufenem Token, `firebaseTokenLogin`,
`getMyGroupsFromServer`), sind mit einer Zeitgrenze versehen oder werden vom
Rückfall überholt, damit die App nicht im Ladezustand hängt.
