# Berechtigungen

Wer darf was — und warum es so gebaut ist. Der Code entscheidet an wenigen
Stellen; dieses Dokument nennt sie und begründet die Bauform.

| Teil | Ort |
| --- | --- |
| Rechte, Rollen, Entscheidung (rein, Server und Client) | [`src/common/permissions.ts`](../src/common/permissions.ts) |
| Nicht-Mandanten (`allUsers`, `kostenersatz`) | [`src/common/tenantGroups.ts`](../src/common/tenantGroups.ts) |
| Einziger Schreibweg für Rollen | [`src/server/auth/userRoles.ts`](../src/server/auth/userRoles.ts) |
| Guards je Recht | [`src/app/groups/permissionGuard.ts`](../src/app/groups/permissionGuard.ts), weitergereicht aus [`src/app/auth.ts`](../src/app/auth.ts) |
| Hooks der Oberfläche | [`src/hooks/usePermissions.ts`](../src/hooks/usePermissions.ts) |
| Firestore-Regeln | `firebase/{dev,prod}/firestore.rules` (`member()`, `hasPerm()`, `hasPermAny()`) |
| Migration und „Rechte neu ableiten" | `/admin/berechtigungen` |

## Das Modell

> Ein Benutzer ist Mitglied einer Gruppe und hat **in dieser Gruppe** Rollen.
> Eine Rolle ist ein im Code definiertes Bündel von **Rechten**. Geprüft wird
> immer ein Recht, nie eine Rolle.

Vorher liefen Mitgliedschaft, Gruppen-Admin, Gerätemeister, Bekleidungswart
und Kostenersatz über vier verschiedene Mechanismen: je ein Feld am
Benutzerdokument, ein Prüfer, ein Guard, ein Session-Feld, ein Eintrag im
Offline-Cache, das Aufräumen beim Austritt und eine eigene
Einstellungsoberfläche. Jede neue Rolle wiederholte das Zeile für Zeile. Jetzt
ist eine neue Rolle ein Eintrag im Katalog.

**Warum Rechte und nicht Rollen prüfen:** Der Gerätemeister ist für
Fahrtenbuch, Geräte und Personal zuständig. Prüft jede Stelle das Recht ihrer
Aufgabe (`geraete.manage`), wird ein späteres Aufteilen der Rolle zu einer
Katalogänderung — statt zu einer Suche nach Aufrufstellen, die „Gerätemeister"
meinen, aber nur eine der drei Aufgaben.

### Die Rechte

Fest im Code (`PERMISSIONS`). Die Werte sind persistiert — am
Benutzerdokument und wörtlich in den Firestore-Regeln — und deshalb stabil zu
halten. Umbenennen ist eine Datenmigration.

| Recht | Bedeutung |
| --- | --- |
| `fahrtenbuch.manage` | jeden Fahrtenbucheintrag der Gruppe korrigieren, Fahrzeuge pflegen |
| `geraete.manage` | Geräte & Material: Artikel, Bestand, Sets, Chargen, Import |
| `personal.manage` | Personalstand der Gruppe auf `/personal` pflegen: Personen, Qualifikationen, Benutzerkonten (siehe [personal.md](personal.md)) |
| `bekleidung.read` | Bekleidung sehen |
| `bekleidung.manage` | Bekleidung pflegen, Import |
| `kostenersatz.use` | Kostenersatz an Einsätzen der Gruppe (Berechnung, PDF, Mail, SumUp), Füllungen verrechnen, Mailvorlagen |
| `gruppe.manage` | Stammdaten, Share-Links, Atemschutz-Admin, Wochenbericht, Mängel löschen, PDF-Import, fremde Füllungen korrigieren |
| `rollen.assign` | Rollen in dieser Gruppe vergeben (siehe [Wer vergibt was](#wer-vergibt-was)) |

**Was jedes Mitglied darf, ist kein Recht im Katalog**, sondern folgt aus der
Mitgliedschaft: Einsätze, eigene Fahrtenbucheinträge, Mängel melden, Geräte
lesen und im Einsatz verbrauchen, Füllprotokoll führen, Personen lesen
(Fahrerauswahl). Die Firestore-Regeln prüfen das über den Claim `groups`
(siehe [Claim gegen `get()`](#claim-gegen-get)), und ein Recht dafür hätte
nichts, woran es hängt. Ein eingeschränktes „Nur-lesen"-Mitglied ließe sich
später als eigene Grundrolle ergänzen; das Modell steht dem nicht im Weg.

### Die Rollen

Ebenfalls fest im Code (`ROLES`):

| Rolle | Rechte | typische Aufgabe |
| --- | --- | --- |
| `gruppenadmin` | `gruppe.manage`, `rollen.assign`, `fahrtenbuch.manage`, `geraete.manage`, `personal.manage`, `bekleidung.read`, `bekleidung.manage` | Kommandant, Verwalter der Feuerwehr |
| `geraetemeister` | `fahrtenbuch.manage`, `geraete.manage`, `personal.manage` | Fahrzeuge, Beladung, Lager |
| `bekleidungswart` | `bekleidung.read`, `bekleidung.manage` | Einsatz- und Dienstbekleidung |
| `kostenersatz` | `kostenersatz.use` | Abrechnung nach Tarifordnung, Füllungsrechnungen |

Mitglied ohne Zusatzrolle ist, wer die Gruppe mit leerer Rollenliste hat.

**Der Gruppen-Admin schließt Gerätemeister und Bekleidungswart ein**, aber
**nicht den Kostenersatz**. Das entspricht dem Stand vor der Umstellung: Ein
Gruppen-Admin ohne Freischaltung sah keinen Kostenersatz, und wer Rechnungen
an Dritte stellt, soll das ausdrücklich zugeteilt bekommen. Umgekehrt kommt
ein Gerätemeister nicht an Gruppeneinstellungen, Share-Links, PDF-Import oder
das Löschen von Mängeln.

Der Gerätemeister pflegt auch **Geräte & Material** (`/geraete`). Die Beladung
der Fahrzeuge gehört zur selben Aufgabe wie die Fahrzeuge selbst; eine eigene
Rolle „Lagerverwalter" trüge in der Praxis dieselben Personen. Sollte sich das
ändern, ist es eine neue Rolle mit `geraete.manage` — keine Aufrufstelle muss
angefasst werden. Den Verbrauch im Einsatz bucht dagegen jeder mit Zugriff auf
den Einsatz ab (`actionUserAuthorizedForFirecall`, plus Prüfung, dass der
Artikel zur Gruppe des Einsatzes gehört). Hintergrund:
[geraete-lager.md](geraete-lager.md).

Von der **Bekleidung** sieht ein einfaches Mitglied — anders als bei Geräten &
Material — **nichts**: Größen und wer was hat sind keine
Gruppenöffentlichkeit. Deshalb gibt es `bekleidung.read` als eigenes Recht
(Hintergrund: [bekleidung.md](bekleidung.md)).

### Außerhalb der Gruppenrollen

| Rolle | Feld | Umfang |
| --- | --- | --- |
| **Globaler Admin** | `user/{uid}.isAdmin` (auch Claim) | alles, in jeder Gruppe, plus `/admin/*` und die Benutzerverwaltung |
| **Einsatz-Gast** | `user/{uid}.firecall` (auch Claim) | genau ein Einsatz, lesend oder schreibend, mit Ablauf; vergeben von jedem Gruppenmitglied über den Share-Link |

Der globale Admin ist bewusst **keine** Gruppenrolle: Er braucht keine
Mitgliedschaft und besteht `can()` in jeder Gruppe (siehe
[Die Asymmetrie ist Absicht](#die-asymmetrie-ist-absicht)).

Der **Einsatz-Gast bleibt unverändert**. Sein Zugang ist eine Freigabe auf
eine Ressource, keine Mitgliedschaft; dasselbe gilt für die
Fahrtenbuch-Freigabelinks (QR-Code am Fahrzeug). Beide kommen durch kein
Gruppenrecht, auch nicht durch `actionFirecallPermissionRequired` — ein Gast
sieht deshalb keinen Kostenersatz, selbst wenn er den Einsatz bearbeiten darf.

## Wer vergibt was

| Änderung | globaler Admin | Gruppen-Admin der Gruppe |
| --- | --- | --- |
| Benutzer freischalten, in eine Gruppe aufnehmen oder entfernen | ja | nein |
| Rolle `gruppenadmin` | ja | nein |
| übrige Rollen in der eigenen Gruppe | ja | ja, sofern er alle Rechte der Rolle selbst hat |

Die Entscheidung ist `canAssignRole(actor, groupId, role)`: `rollen.assign`
**und** die **Teilmengenregel** — jedes Recht der Rolle muss der Vergebende in
dieser Gruppe selbst haben. Damit ist `kostenersatz` für einen Gruppen-Admin
erst vergebbar, wenn er die Rolle selbst hat. Das ist gewollt: Wer keinen
Kostenersatz macht, gibt ihn nicht weiter.

Vergeben wird in der Ansicht **„Mitglieder und Rollen"** je Gruppe (Matrix
Mitglied × Rolle), erreichbar für den globalen Admin und die Gruppen-Admins
dieser Gruppe. Sie ersetzt den Gerätemeister-Abschnitt in den Einstellungen
der Fahrtenbuch-Verwaltung und den Reiter „Einstellungen" auf `/bekleidung`;
diese Stellen verlinken dorthin.

### Was der Gruppen-Admin bewusst nicht darf

- **Benutzer freischalten oder in Gruppen aufnehmen.** Ein Benutzerdokument
  ist gruppenübergreifend: Wer die Mitgliedschaft schreiben darf, trägt sich
  selbst in jede Gruppe ein. Das bleibt beim globalen Admin. Aus demselben
  Grund lehnt `writeUserRoles` mit `setGroupRoles` einen Benutzer ab, der noch
  nicht Mitglied ist — sonst nähme ein Gruppen-Admin über die Rollenvergabe
  Benutzer in seine Gruppe auf.
- **Weitere Gruppen-Admins ernennen.** Die Rolle vermehrte sich sonst ohne
  Zutun eines globalen Admins. Für Vertretung trägt der globale Admin mehrere
  Gruppen-Admins ein.
- **`/admin/*` betreten.** Die Seiten dort — Datenpflege, Cluster, MCP,
  Bug-Reports, gelöschte Elemente, die Migration der Berechtigungen — sind
  nicht auf eine Gruppe begrenzt.

## Gruppenhierarchie

Eine Gruppe kann über `parentId` unter einer anderen stehen (etwa Bezirk →
Abschnitt → Feuerwehr). **Wer Mitglied einer Gruppe ist, ist auch Mitglied
aller Gruppen darüber** — ohne Rollen, sofern er dort noch keine hat.

**Die Hierarchie wirkt nur beim Vergeben, nicht beim Auswerten.** Die
Elterngruppen landen ganz normal in `groupRoles` am Benutzer und damit im
Claim `groups`. Firestore-Regeln, Guards und `can()` bleiben unverändert und
kennen die Hierarchie nicht. Das hält die Regeln ohne zusätzliches `get()` und
macht jede Mitgliedschaft am Benutzerdokument ablesbar. Der Preis: Die
Hierarchie muss an jedem Schreibweg nachgezogen werden.

| Schreibweg | was passiert |
| --- | --- |
| Benutzerdialog (`updateUser`) | die gewählten Gruppen werden um ihre Elterngruppen ergänzt; Elterngruppen gewählter Gruppen sind im Dialog angehakt und gesperrt |
| Gruppendialog (`updateGroupAction`) | neue Mitglieder bekommen die Elterngruppen dazu; Mitglieder einer Untergruppe bleiben Mitglied und sind gesperrt. Wird eine Gruppe unter eine andere gehängt, bekommen alle ihre Mitglieder die neuen Elterngruppen |
| „Mitglieder und Rollen" (`addMemberAction`, `removeMemberAction`) | Aufnehmen ergänzt die Elterngruppen; Entfernen lehnt ab (`memberOfSubgroup`), solange der Benutzer in einer Untergruppe ist |

**Entfernen kaskadiert bewusst nicht.** Wer aus einer Elterngruppe genommen
werden soll, aber noch in einer Untergruppe ist, wird zuerst dort entfernt —
ein stilles Mitlöschen nähme ihm die Rollen der Untergruppe. Umgekehrt bleibt
nach dem Entfernen aus einer Untergruppe die Mitgliedschaft in der
Elterngruppe stehen; sie ist dann eine eigene.

Die reinen Funktionen stehen in
[`src/common/groupHierarchy.ts`](../src/common/groupHierarchy.ts). Sie sind
gegen Zyklen und fehlende Elterngruppen abgesichert, obwohl
`updateGroupAction` eine Untergruppe oder die Gruppe selbst als Elterngruppe
ablehnt (`isValidParent`). `allUsers` und `kostenersatz` stehen außerhalb der
Hierarchie. Beim Löschen einer Gruppe rücken ihre Untergruppen eine Ebene nach
oben. Angezeigt werden Gruppen in Baumreihenfolge (`orderGroupsAsTree`):
Untergruppen eingerückt direkt unter ihrer Elterngruppe.

## Ablage am Benutzerdokument

```ts
user/{uid}.groupRoles:          { [groupId]: RoleId[] }      // Quelle, gepflegt in der Oberfläche
user/{uid}.groupPerms:          { [groupId]: Permission[] }  // abgeleitet, nur für Firestore-Regeln
user/{uid}.permsAny:            Permission[]                 // Vereinigung über alle Gruppen
user/{uid}.rolesCatalogVersion: number                       // Katalogstand bei der Ableitung
```

- **Mitglied ist, wer einen Schlüssel in `groupRoles` hat.** Ein leeres Array
  heißt „Mitglied ohne Zusatzrolle". Es gibt kein zweites Feld für die
  Mitgliedschaft, das auseinanderlaufen könnte.
- **Server und Client lesen `groupRoles` und den Katalog, nie `groupPerms`.**
  Damit sind Guards und Oberfläche nach einem Deploy sofort auf dem neuen
  Katalogstand, ohne dass ein Benutzerdokument angefasst wurde. Nur die Regeln
  lesen die abgeleiteten Felder, weil sie den Katalog nicht kennen.
- `permsAny` gibt es für die **globalen** Kostenersatz-Sammlungen (Tarife,
  Vorlagen): Dort steht keine Gruppe im Pfad, also kann die Regel nicht
  `groupPerms[g]` fragen.

### Warum am Benutzerdokument

Am Benutzerdokument und nicht als Liste von Benutzern am Gruppendokument,
weil das der Leseweg ist: Die Rollen nehmen denselben Weg wie `isAdmin` —
über `getUserSessionData` in die Session und von dort in den Client. Jede
andere Ablage kostete beim Sitzungsaufbau eine zusätzliche Abfrage und jede
Seite, die ein Recht kennen muss (Drawer, Seitenschutz, Bearbeiten-Knöpfe),
einen Server-Action-Roundtrip.

Manipulationssicher ist das, weil `/user/{uid}` in den Firestore-Regeln nur
`read` erlaubt und der Catch-all am Dateiende Schreibrechte an `adminUser()`
bindet — dasselbe Dokument trägt schon `isAdmin`. Auch `groupPerms`, das die
Regeln für Fachrechte lesen, kann ein Benutzer deshalb nicht selbst setzen.

## Claim gegen `get()`

Der Claim `groups` bleibt und trägt die **Mitgliedschaft**: die Schlüssel von
`groupRoles` plus vorerst `allUsers`. Fachrechte kommen **nicht** in den
Claim, die Regeln lesen sie per `get()` vom Benutzerdokument.

| Prüfung | Quelle | Grund |
| --- | --- | --- |
| Mitgliedschaft (Einsatz und alles darunter, Gruppendaten lesen) | Claim `groups` → `member(g)` | sehr viele Auswertungen, jeder Listener, offline; ändert sich selten |
| Fachrechte (Bekleidung, Kostenersatz, Verrechnung) | `get()` auf `user/{uid}` → `hasPerm(g, p)`, `hasPermAny(p)` | selten gelesen, sensibel; ein Entzug wirkt sofort ohne Token-Refresh; keine 1000-Byte-Grenze der Claims |

Ein Claim für jedes Recht erzwänge bei jeder Rollenänderung einen
Token-Refresh — und einen Mechanismus dafür gibt es nicht; der Client erfährt
von neuen Claims erst beim nächsten Token-Tausch. Die Mitgliedschaft ändert
sich dagegen nur beim Ein- oder Austritt, wie vorher auch. Ein `get()` kostet
je Auswertung einen Dokument-Read, aber nur in den Fachsammlungen; die
Einsatzdaten bleiben claim-basiert. Innerhalb einer Auswertung zählt dasselbe
Dokument nur einmal, mit `get(call)` aus `callAuthorized()` sind es zwei
`get()`, weit unter dem Limit.

```text
function member(g)       — authorizedUser() && g != 'allUsers' && g in token.groups
function hasPerm(g, p)   — adminUser() || (member(g) && p in userDoc().groupPerms[g])
function hasPermAny(p)   — adminUser() || (authorizedUser() && p in userDoc().permsAny)
```

`hasPerm` prüft **zuerst** die Mitgliedschaft aus dem Claim. Das spart das
`get()` für Nichtmitglieder und stellt sicher, dass ein liegengebliebener
Eintrag in `groupPerms` ohne Mitgliedschaft nichts öffnet.

Sichtbare Folge in den Regeln: `groups/{groupId}/person`, `/vehicle` und die
Geräte-Sammlungen tragen weiterhin keine Schreibrechte für Gruppenrollen. Das
ist kein Widerspruch — alles, was ein Gruppen-Admin oder Gerätemeister
schreibt, läuft über Server Actions mit dem Admin SDK, und dort entscheidet
`actionPermissionRequired`.

## Ein Schreibweg — `writeUserRoles()`

[`writeUserRoles(uid, change)`](../src/server/auth/userRoles.ts) ist die
**einzige** Stelle, die `groupRoles`, `groupPerms`, `permsAny`,
`rolesCatalogVersion` und — beim Ein- oder Austritt — die Claims schreibt.
Aufrufer sind die Benutzerverwaltung (`updateUser.ts`), die Gruppenverwaltung
(`GroupAction.ts`), die Ansicht „Mitglieder und Rollen", die automatische
Anlage interner Benutzer (`autoProvisionUser.ts`) und die Migration.

| Änderung | Wirkung |
| --- | --- |
| `setGroupRoles` | Rollen einer Gruppe ersetzen; die Mitgliedschaft muss bestehen |
| `toggleRole` | eine einzelne Rolle einer Gruppe setzen oder entfernen; die Mitgliedschaft muss bestehen |
| `addMember` | in eine Gruppe aufnehmen, optional mit Rollen |
| `removeMember` | Austritt: löscht den Schlüssel und damit alle Rollen der Gruppe |
| `replaceAll` | alles ersetzen — Benutzerverwaltung und Migration |

**Ein Schalter ist `toggleRole`, nicht `setGroupRoles`.** Der Schalter einer
Rolle in „Mitglieder und Rollen" und der Gruppen-Admin-Schalter der
Gruppenverwaltung ändern genau eine Rolle. Rechneten sie die neue Rollenliste
im Browser aus und schickten sie als `setGroupRoles`, verwürfe der zweite von
zwei gleichzeitigen Klicks (zwei Admins, oder zwei Schalter kurz
hintereinander) die Rolle des ersten. `toggleRole` wendet die Änderung auf den
Stand an, den die Transaktion liest.

Was die Funktion tut, und warum:

- **Quelle und Ableitung in einer Transaktion.** `groupPerms` und `permsAny`
  stehen nie in einem anderen Stand als `groupRoles`.
- **Per Feldpfad je Gruppe** (`groupRoles.<g>`, `groupPerms.<g>`), nicht das
  ganze Feld. Zwei Admins, die gleichzeitig verschiedene Gruppen pflegen,
  fassen dasselbe Benutzerdokument an und überschrieben sich sonst
  gegenseitig. `FieldPath` statt Punktnotation, weil eine Gruppen-ID einen
  Punkt enthalten darf.
- **Claims nur bei Aufnahme, Austritt oder geänderter Mitgliedschaft.** Rollen
  stehen nicht im Claim, ein Neusetzen wäre umsonst. Aufnahme und Austritt
  setzen die Claims aber **immer**, auch wenn das Dokument schon stimmt: Der
  Aufruf liegt nach dem Commit und kann scheitern. Dann meldet die Server Action
  den Fehler, und ein erneuter Versuch bringt den Claim nach. Ein bereits
  ausgestelltes ID-Token trägt die alte Mitgliedschaft bis zu seinem Ablauf
  (höchstens 1 h). Gleichzeitige Änderungen desselben Benutzers durch zwei
  Admins sind kein realistischer Fall und werden für die Claims nicht
  abgefangen.
- **`userSessionCache.invalidate(uid)` danach.** Die Session liest über einen
  Cache mit 60 s Lebensdauer; ohne Invalidierung bliebe eine Rollenänderung
  bis zum Ablauf wirkungslos.
- **Keine schlafenden Rollen.** Der Austritt löscht den Schlüssel samt Rollen.
  Vorher blieben `groupAdmin` & Co. stehen, wenn das Aufräumen in
  `updateGroupAction` vergessen wurde, und wurden beim Wiedereintritt
  unbemerkt wieder wirksam.
- **Prüft nicht, ob der Aufrufer das darf.** Das macht die aufrufende Server
  Action mit `canAssignRole` bzw. `actionAdminRequired`. So bleibt die
  Funktion für Migration und Benutzerverwaltung verwendbar, und die
  Berechtigungsentscheidung steht dort, wo man den Aufrufer kennt.

**Nie an `writeUserRoles` vorbei schreiben** — auch nicht als Admin über die
Firebase-Konsole oder ein Skript. Ein `groupRoles` ohne passendes
`groupPerms` lässt Server und Regeln verschieden entscheiden: Die Oberfläche
zeigt die Bekleidung, die Regel verweigert sie. „Rechte neu ableiten" auf der
Migrationsseite gleicht solche Abweichungen ab und meldet sie.

### Katalogänderung

Ändert ein Deploy `ROLES`, erhöht er `ROLES_CATALOG_VERSION`. Server und
Client sind sofort auf dem neuen Stand, weil sie aus `groupRoles` rechnen. Nur
die Regeln hängen nach, bis `groupPerms` neu abgeleitet ist. Zwei Wege holen
das nach:

- `getUserSessionData` ruft für jeden Benutzer mit älterer
  `rolesCatalogVersion` `recomputeUserPermissions(uid)` auf — best effort und
  nicht blockierend, die Anmeldung wartet nicht darauf.
- **„Rechte neu ableiten"** auf `/admin/berechtigungen` macht dasselbe für alle
  Benutzer auf einmal, auch für die, die sich länger nicht anmelden.

### Ein neues Recht oder eine neue Rolle

1. Recht in `PERMISSIONS` bzw. Rolle in `ROLES` eintragen,
   `ROLES_CATALOG_VERSION` erhöhen, Tests in `permissions.test.ts`.
2. Server Actions mit `actionPermissionRequired(groupId, '<recht>')`
   schützen, die Oberfläche mit `useCan`/`useCanAny`.
3. Liest der Client die Daten direkt aus Firestore: Regel mit
   `hasPerm(groupId, '<recht>')` in **beiden** Dateien
   `firebase/{dev,prod}/firestore.rules`, Regeltest dazu.
4. Rollenname in `messages/{de,en}.json` für die Ansicht „Mitglieder und
   Rollen".
5. Nach dem Deploy „Rechte neu ableiten".

## Die Entscheidungsstellen

Die Logik steht rein, ohne NextAuth- oder Firebase-Import, in
[`permissions.ts`](../src/common/permissions.ts). Server, Client und Migration
benutzen dieselben Funktionen; das beseitigt auch den Importzyklus, wegen dem
der Bekleidungs-Guard früher neben `auth.ts` liegen musste.

| Funktion | Frage |
| --- | --- |
| `isMember(user, groupId)` | Ist der Benutzer Mitglied? (Admin: ja; Nicht-Mandanten: nie) |
| `can(user, groupId, perm)` | Hat er das Recht in dieser Gruppe? (Admin: ja) |
| `canAny(user, perm)` | Hat er es in irgendeiner Gruppe? Für Menüeinträge und globale Seiten |
| `memberGroupIds(user)` | In welchen Gruppen ist er Mitglied? (ohne Nicht-Mandanten) |
| `canAssignRole(actor, groupId, role)` | Darf er diese Rolle hier vergeben? |
| `permissionsFor(roles)`, `derivePermissionFields(groupRoles)` | Ableitung für `writeUserRoles` |
| [`assertTenantGroup(groupId)`](../src/app/groups/groupTypes.ts) | Ist die Gruppen-ID überhaupt ein Mandant? |

Die Guards für Server Actions kommen alle aus [`src/app/auth.ts`](../src/app/auth.ts):

| Guard | Verlangt |
| --- | --- |
| `actionUserRequired()` | angemeldet und freigeschaltet |
| `actionAdminRequired()` | globaler Admin |
| `actionGroupMemberRequired(groupId)` | Mitglied der Gruppe (oder globaler Admin) |
| `actionPermissionRequired(groupId, perm)` | das Recht in dieser Gruppe — globaler Admin oder eine Rolle der Gruppe, die es enthält |
| `actionUserAuthorizedForFirecall(id)` | Zugriff auf diesen Einsatz (Mitglied oder Gast) |
| `actionFirecallPermissionRequired(id, perm)` | das Recht in der **Gruppe des Einsatzes**; Gäste nie. Gibt Sitzung und Einsatz zurück |

`actionPermissionRequired` und `actionFirecallPermissionRequired` liegen als
Implementierung in [`permissionGuard.ts`](../src/app/groups/permissionGuard.ts)
und werden von `auth.ts` nur weitergereicht: Dort hängen NextAuth und das
Firebase Admin SDK am Import, und diese Entscheidung ist eine
Sicherheitsgrenze, die für sich testbar sein soll.

Welche Aufgabe welches Recht verlangt, steht an der Aufrufstelle, nicht im
Guard: Die Fahrtenbuch-Stammdaten verlangen `fahrtenbuch.manage` bzw. für
Personen `personal.manage`, Geräte & Material `geraete.manage`, Bekleidung
zum Pflegen `bekleidung.manage` und zum reinen Lesen `bekleidung.read`, die
Füllungsverrechnung und SumUp `kostenersatz.use`, Gruppeneinstellungen
`gruppe.manage`.

Wege ohne NextAuth-Sitzung lesen die Mitgliedschaft ebenfalls aus
`groupRoles` des Benutzerdokuments, nie aus dem alten Feld `groups`, das
`writeUserRoles` nicht mehr pflegt: `verifyUserAuthorizedForFirecall` (API-Routen
und MCP), `authorizeTokenForGroup` (API-Tokens) und die Anmeldewege, die ein
Custom Token prägen (Passkey, `mintFirebaseCustomToken`, Einsatz-Gastlinks).
Letztere nehmen `claimGroupsForUser` — denselben Claim, den
`writeUserRoles` setzt; sonst prägte jeder Anmeldeweg einen anderen.

In der Oberfläche: `useCan(groupId, perm)` und `useCanAny(perm)` aus
[`usePermissions.ts`](../src/hooks/usePermissions.ts), auf Basis der Sitzung
bzw. des Offline-Zwischenspeichers. Sie öffnen nur die Oberfläche — die
Entscheidung treffen Server Actions und Regeln selbst.

### Die Asymmetrie ist Absicht

Der globale Admin braucht **keine** Mitgliedschaft in der Gruppe, alle
Gruppenrollen schon. Verlangte man sie auch vom Admin, nähme man ihm ein
Recht, das er unter `actionAdminRequired()` immer hatte. `can()` und
`canAny()` geben für ihn deshalb `true` zurück; `memberGroupIds()` dagegen
nennt nur seine echten Mitgliedschaften — er ist nicht Mitglied jeder Gruppe,
und Gruppenauswahl oder Einsatzliste sollen ihn nicht mit allen Feuerwehren
überschütten.

### `allUsers` ist keine Gruppe

`assertTenantGroup` und `isTenantGroupId` lehnen jede ID aus
`NON_TENANT_GROUP_IDS` ab — auch für den globalen Admin. `allUsers` steht in
den Claims **jedes** Benutzers und in denen jedes Einsatz-Gasttokens; ein Recht
„in allUsers" gälte für jeden. Dieselbe Sperre steht als `member()` in den
Firestore-Regeln.

`kostenersatz` war bisher eine Schein-Gruppe in `groups` — die globale
Freischaltung für den Kostenersatz. Sie bleibt bis zum Schritt „Alte Felder
entfernen" der Migration im Claim stehen und steht deshalb noch in
`NON_TENANT_GROUP_IDS`; mit dem Aufräum-PR nach dem Release fällt sie weg.

Folge für Einsätze mit `group == 'allUsers'`: Für sie gibt es kein
Gruppenrecht, also lehnt `actionFirecallPermissionRequired` sie für jeden
außer dem globalen Admin ab. Der Admin darf, weil die Regeln es ihm ebenfalls
erlauben (`hasPerm()` beginnt mit `adminUser()`); `assertTenantGroup` greift
dort deshalb nur für Nicht-Admins, ebenso in der PDF-Route
(`kostenersatzPdfAccess.ts`). Sonst sähe der Admin die Berechnungen am Einsatz,
könnte aber weder PDF noch Mail erzeugen. Ob solche Einsätze überhaupt
existieren, ist vor dem Aufräum-PR zu klären (siehe
[Nach dem Release](#nach-dem-release)).

## Kostenersatz je Gruppe

Die Freischaltung galt bisher **gruppenübergreifend**, und die Berechnungen am
Einsatz waren in den Regeln gar nicht geschützt. Jetzt gilt: Kostenersatz am
Einsatz sieht und bearbeitet nur, wer `kostenersatz.use` in der **Gruppe des
Einsatzes** hat.

Damit sind zwei Lücken geschlossen:

- **Gruppendaten der Verrechnung.** `atemschutzRechnung`,
  `atemschutzEmpfaenger`, `atemschutzConfig` und `kostenersatzConfig` prüften
  `fahrtenbuchMember() && kostenersatzUser()`. Wer die Freischaltung hatte und
  in zwei Gruppen Mitglied war, las die Daten beider. Jetzt:
  `hasPerm(groupId, 'kostenersatz.use')`.
- **Berechnungen am Einsatz.** `call/{id}/kostenersatz` fiel unter den Wildcard
  `{subitem=**}`: Jedes schreibberechtigte Einsatzmitglied und jeder
  schreibende Gast konnte sie lesen und ändern; nur die Oberfläche prüfte die
  Freischaltung. Jetzt: `hasPerm(get(call).group, 'kostenersatz.use')`, keine
  Gäste.

**Den Wildcard ausnehmen, nicht überlagern.** Firestore verknüpft passende
`match`-Blöcke mit ODER. Ein eigener Block `match /kostenersatz/{calc}` allein
änderte nichts, solange `{subitem=**}` den Zugriff erlaubt. Der Wildcard
schließt den Pfad deshalb selbst aus (`subitem[0] != 'kostenersatz'`); die
Regeltests sichern das ab.

| Was | Regel bzw. Guard |
| --- | --- |
| Berechnungen `call/{id}/kostenersatz` | `hasPerm(Gruppe des Einsatzes, 'kostenersatz.use')` |
| Server Actions und PDF-Route am Einsatz (Empfänger, Mail, SumUp, Zahlungsstatus, `/api/kostenersatz/pdf`) | `actionFirecallPermissionRequired(firecallId, 'kostenersatz.use')` |
| Zahlungsbestätigung nach SumUp (`verifyPaymentAndComplete`) | **bewusst ohne Guard** — s. unten |
| Verrechnung der Füllungen, Mailvorlagen (`groups/{g}/…`) | `hasPerm(g, 'kostenersatz.use')` bzw. `actionPermissionRequired` |
| Tarif `kostenersatzVersions`, `kostenersatzRates` (global) | `hasPermAny('kostenersatz.use')` |
| Vorlagen `kostenersatzTemplates` (global, `isShared` wie bisher) | `hasPermAny('kostenersatz.use')`; ändern und löschen nur Ersteller oder Admin |
| Seiten `/einsatz/[id]/kostenersatz`, `/kostenersatz`, Drawer | `useCan(firecall.group, 'kostenersatz.use')` |

**Die Zahlungsbestätigung bleibt ohne Sitzung.** `verifyPaymentAndComplete`
([verifyPaymentAction.ts](../src/components/Kostenersatz/verifyPaymentAction.ts))
ruft die Seite auf, auf die SumUp den Zahlungspflichtigen zurückleitet. Der hat
kein Konto und keine Sitzung; ein Rollen-Guard sperrte genau ihn aus. Geschützt
ist sie über das `sumupRedirectToken` je Checkout (zufällig, zeitkonstant
verglichen), und sie tut nur eines: eine Zahlung, die SumUp als bezahlt meldet,
an der Berechnung als bezahlt vermerken. Das ist keine Lücke der Rollen,
sondern ein eigener Zugang mit eigenem Nachweis.

Tarif und Vorlagen bleiben global: Das Landesgesetzblatt gilt landesweit
gleich, und eine Vorlage für „Fahrzeugbergung mit KRF" ist nicht an eine
Feuerwehr gebunden. Darum reicht dort das Recht in irgendeiner Gruppe.

**Nebenwege lassen den Kostenersatz weg, statt zu scheitern.** Der
Sybos-Übertrag, der Einsatz-Export und das Backup (`useExport`) sowie der
Einsatz-Import lesen `call/{id}/kostenersatz` mit. Ohne das Recht scheiterte
die Regel und mit ihr der ganze Vorgang. Sie prüfen deshalb dasselbe Recht und
lassen die Berechnungen sonst aus. Dass ein Mitglied ohne Kostenersatz damit
im Backup keine Berechnungen hat, ist gewollt.

**Offline:** Eine offline angelegte Berechnung von jemandem ohne das Recht
scheitert beim Synchronisieren und erscheint in der Fehlerliste. In der Praxis
kommt das nicht vor, weil die Oberfläche den Eintrag ohne Recht nicht anbietet.

Warum die Füllungsverrechnung am Kostenersatz hängt und nicht am
Gerätemeister: [atemschutzsammelplatz.md](atemschutzsammelplatz.md#warum-kostenersatz-und-nicht-gerätemeister).

## Migration

**Ein Release, kein doppeltes Schreiben.** Der neue Code liest und schreibt nur
noch `groupRoles` samt Ableitung; die alten Felder `groupAdmin`,
`fahrtenbuchGeraetemeister`, `bekleidungswart` und die Schein-Gruppe
`'kostenersatz'` in `groups` pflegt er nicht mehr. Code und Regeln gehen mit
demselben `tofu apply` live. Danach startet der globale Admin die Migration
auf `/admin/berechtigungen` (`actionAdminRequired`).

Parallel weiterzuschreiben wäre die Alternative gewesen. Sie hätte jeden
Schreibweg doppelt gebraucht, und das Auseinanderlaufen der beiden Stände wäre
genau die Fehlerklasse, die die Umstellung beseitigen soll.

### Die Schritte

Jeder Schritt ist einzeln auslösbar und idempotent.

1. **Vorschau (Trockenlauf).** Je Benutzer die alten Felder und die daraus
   berechneten `groupRoles` (`legacyToGroupRoles`), dazu Hinweise:
   - Rollen in Gruppen ohne Mitgliedschaft (schlafende Rollen) entfallen.
   - Benutzer mit `'kostenersatz'`: **je Gruppe ein Häkchen**, ob sie dort die
     Rolle `kostenersatz` bekommen. Vorbelegt sind alle Gruppen, in denen der
     Benutzer Mitglied ist — verhaltensgleich zur bisherigen globalen
     Freischaltung. Hier legt der Admin fest, in welcher Gruppe jemand
     Kostenersatz macht.
   - Benutzer, die nur `allUsers`/`kostenersatz` und keine echte Gruppe haben.
   - Bereits migrierte Benutzer (mit `groupRoles`) sind gekennzeichnet und
     werden übersprungen.
2. **Migrieren.** Schreibt für jeden noch nicht migrierten Benutzer über
   `writeUserRoles()` (`replaceAll`) die neuen Felder und invalidiert den
   Session-Cache. **Die alten Felder und die Claims bleiben unverändert** —
   damit ist ein Rollback auf das vorige Release ohne Datenreparatur möglich.
   `writeUserRoles` vergleicht die Mitgliedschaft dafür mit dem alten Feld
   `groups`, solange `groupRoles` fehlt, und setzt deshalb keine Claims neu.
   Zeitpunkt, Anzahl und Fehler stehen in `appConfig/permissionsMigration` und
   auf der Seite.
3. **Alte Felder entfernen.** Erst freigegeben, wenn alle Benutzer migriert
   sind. Löscht die alten Felder und `'kostenersatz'` aus `groups` und setzt
   die Claims neu, ohne `'kostenersatz'`. Danach ist ein Rollback nicht mehr
   ohne Weiteres möglich; dieser Schritt kommt deshalb erst, wenn das Release
   sich bewährt hat.

Auf derselben Seite: **Rechte neu ableiten** — `groupPerms` und `permsAny`
aller Benutzer aus `groupRoles` und dem aktuellen Katalog neu berechnen. Das
Ergebnis meldet Abweichungen zwischen Bestand und Katalog. Es ist auch der
Weg nach jeder Katalogänderung und bleibt nach dem Aufräumen bestehen.

### Zeitfenster zwischen Deploy und Migration

Bis Schritt 2 gelaufen ist, hat kein Benutzer `groupRoles`. Die Session fällt
**nicht** auf die alten Felder zurück — das wäre das parallele Lesen, das die
Umstellung vermeiden soll. In diesem Fenster gilt:

- **Einsätze laufen weiter**, soweit sie die Regeln betreffen: `call/**` liest
  den unveränderten Claim `groups`. Die Oberfläche braucht für die
  Einsatzliste die Mitgliedschaft aus der Session; die fehlt.
- Gruppenfunktionen — Fahrtenbuch, Geräte, Bekleidung, Kostenersatz,
  Verrechnung — sind gesperrt.
- Der Vergleich von Claim und Session stößt deshalb **keinen** erneuten Login
  an: Ohne `groupRoles` am Benutzerdokument vergleicht der Client nur die
  Freischaltung (s. unten). Die Schein-Gruppe `kostenersatz` ist beim
  Gruppenvergleich
  ausgenommen (`claimGroupsKey`), sonst hielte der Client das Token jedes
  Kostenersatz-Benutzers auch nach der Migration für veraltet.
- Der globale Admin ist nicht betroffen (`isAdmin`), die Migrationsseite ist
  also erreichbar.

Deshalb erst auf dev proben, dann prod zu einer ruhigen Zeit ausrollen und die
Migration direkt nach dem Deploy starten. Das Fenster dauert so lange wie der
Klick plus die Laufzeit — bei wenigen hundert Benutzern Sekunden.

**Rollback nach Schritt 2:** Das vorige Release liest die alten Felder, die
noch unverändert stehen. Rollenänderungen, die nach der Migration über die
neue Oberfläche gemacht wurden, gehen dabei verloren.

### Was beim Ablauf zu beachten ist

- **Erst migrieren, dann Rollen vergeben.** „Migrieren" liest die Benutzer
  und schreibt danach je Benutzer ein `replaceAll`. Vergibt jemand in den
  Sekunden dazwischen über „Mitglieder und Rollen" eine Rolle, überschreibt
  die Migration sie.
- **Rollenänderung an einem nicht migrierten Benutzer migriert ihn.** Die
  Rollenverwaltung und die Benutzer- und Gruppenverwaltung schreiben für einen
  Benutzer ohne `groupRoles` einmal `legacyToGroupRoles(alte Felder)` samt der
  Änderung als `replaceAll` (`changeUserRoles`) — per Feldpfad allein verlöre
  er alle übrigen Mitgliedschaften. Er gilt danach als migriert und wird von
  Schritt 2 übersprungen. Nicht migrierte Benutzer zeigt die Rollenverwaltung
  mit dem Hinweis „alte Felder".
- **Ausnahme: Benutzer mit `'kostenersatz'` bleiben bis Schritt 2 gesperrt.**
  Für sie entscheiden die Häkchen der Vorschau, in welchen Gruppen sie
  Kostenersatz bekommen. Eine nebenbei geschriebene Migration nähme die
  Vorbelegung (alle Mitgliedsgruppen) und überginge diese Entscheidung still.
  Deshalb lehnen `changeUserRoles` (`UserNotMigratedError`), die Aktionen von
  „Mitglieder und Rollen" (Fehler `notMigrated`) und die Benutzerverwaltung
  eine Rollen- oder Mitgliedschaftsänderung an ihnen ab und sagen es; die
  Gruppenverwaltung speichert die übrigen Mitglieder und nennt die
  übersprungenen (`awaitsKostenersatzChoice`).
- **„Claims für alle setzen" und das Neusetzen nach einer Rollenänderung**
  bilden den Claim mit `claimsForStoredUser` — `groups` aus `groupRoles`
  (bzw. vor der Migration aus dem alten Feld), dazu `isAdmin`, `authorized`
  und die Einsatz-Claims eines Gasts. Ein Claim nur aus dem alten Feld
  `groups` verlöre jede Mitgliedschaft, die nach der Migration vergeben wurde.
- **Der Client erneuert das Token vor der Migration nicht wegen der Gruppen.**
  Die Session kennt dann nur `allUsers`, der Claim die alten Gruppen; das löst
  erst Schritt 2. Der Login-Beobachter liest bei abweichenden Gruppen das
  eigene Benutzerdokument und vergleicht ohne `groupRoles` nur die
  Freischaltung (`claimsNeedRefresh`) — sonst endete jeder Seitenaufruf
  nach fünf vergeblichen Token-Erneuerungen im Hinweis „erneut anmelden".
- **Schritt 3 kann Claims ändern.** Er setzt die Claims aus `groupRoles`. Wich
  das alte Feld `groups` von der migrierten Mitgliedschaft ab, ändert sich der
  Claim, und der Client stößt einen erneuten Login an.
- Das Protokoll steht in `appConfig/permissionsMigration`, je Schritt ein
  Feld (`migrate`, `cleanup`, `recompute`) mit Zeitpunkt, Admin, Anzahl und
  höchstens 200 Einträgen je Liste. Nur das Admin SDK schreibt es.

### Nach dem Release

Ein eigener kleiner PR, wenn das Release sich bewährt hat und Schritt 3
gelaufen ist:

- Code entfernen, der nur der Migration diente: `legacyToGroupRoles` (außer im
  Leser des Offline-Caches, bis dessen 90-Tage-Frist abgelaufen ist) und die
  Schritte 1–3 der Migrationsseite. „Rechte neu ableiten" bleibt.
- `'kostenersatz'` aus `NON_TENANT_GROUP_IDS`, `claimGroupsKey`,
  `claimGroupsForUser`, `writeUserRoles` und `member()` in den Regeln
  entfernen. `KOSTENERSATZ_GROUP`, der Eintrag `kostenersatz` in
  `KNOWN_GROUPS` und `kostenersatzUser()` in den Regeln sind schon mit der
  Umstellung entfallen — nichts las sie mehr.
- `allUsers`: **vorher prüfen**, ob Einsätze oder andere Dokumente mit
  `group == 'allUsers'` existieren (dev und prod). Nur wenn nicht, entfällt
  `allUsers` aus den Claims und aus `NON_TENANT_GROUP_IDS`. Sonst bleibt es
  als dokumentierte Sonderbedeutung „für alle Freigeschalteten sichtbar".

## Zwischenspeicher der Anmeldung für den Kaltstart ohne Netz

Die Rechte der Oberfläche (`isAuthorized`, `isAdmin`, `groupRoles` und das
daraus abgeleitete `groups`, `firecall`) kommen aus der NextAuth-Sitzung und
aus `getMyGroupsFromServer` — beides braucht den Server. Ohne Netz zeigte die
App nach einem Neustart deshalb den Login-Bildschirm, obwohl Firebase Auth den
Benutzer aus IndexedDB kennt und Firestore die Daten im Cache hat.
[`offlineAuthCache.ts`](../src/hooks/auth/offlineAuthCache.ts) hält die
zuletzt **am Server bestätigten** Rechte deshalb in localStorage, und
`useFirebaseLoginObserver` nimmt sie, wenn der Server nicht antwortet.

Der Zwischenspeicher hält `groupRoles`. **Einträge im alten Format** (mit
`groupAdmin`, `fahrtenbuchGeraetemeister`, `bekleidungswart`) rechnet der
Leser einmalig mit `legacyToGroupRoles` um. Sonst stünden Geräte, die seit
dem Release nicht online waren, beim Kaltstart ohne Netz ohne Gruppen da —
also gerade die, die die App nur im Einsatz öffnen. Das ist eine rein lokale
Umrechnung, kein paralleles Schreiben; sie bleibt, bis die 90-Tage-Frist des
letzten alten Eintrags abgelaufen sein kann.

**Warum das vertretbar ist:** Der Zwischenspeicher öffnet nur die Oberfläche.
Keine Entscheidungsstelle oben liest ihn: Die Server-Guards prüfen die Sitzung,
die Firestore-Regeln das ID-Token und das Benutzerdokument. Offline erfasste
Schreibvorgänge prüft der Server beim Synchronisieren nach den Regeln, die dann
gelten; was abgelehnt wird, erscheint in der Fehlerliste (siehe
[offline-modus.md](offline-modus.md)). Wer am Gerät localStorage von Hand
ändert, sieht also Menüs, aber keine Daten, die ihm Firestore nicht ohnehin aus
dem Cache dieses Geräts gibt — und die liegen dort nur, weil er sie vorher
lesen durfte. Dasselbe gilt für eine Rolle, die entzogen wurde, während das
Gerät offline war.

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
- **90 Tage ab der letzten Bestätigung.** Viele Mitglieder öffnen die App nur
  im Einsatz, oft wochenlang nicht. Eine kurze Frist (anfangs 72 h) hätte
  genau sie beim Kaltstart ohne Netz vor den Login-Bildschirm gestellt — dort,
  wo es am meisten stört. Die lange Frist kostet wenig: Ein Gerät, dem die
  Freigabe entzogen wurde, sieht offline nur, was ohnehin schon in seinem
  Cache liegt, seine Schreibvorgänge scheitern beim Synchronisieren an den
  Regeln, und beim ersten Start mit Netz ist der Eintrag weg. Ein Zeitstempel
  aus der Zukunft gilt als ungültig, eine verstellte Uhr verlängert also
  nichts. Ein **Einsatz-Gast** behält höchstens bis zum Ende seines
  Gastzugangs (`firecallExpiresAt`).
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
