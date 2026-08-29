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
