# Gruppen-Stammdaten: Absender, Bankverbindung und Logo

Jede Gruppe hat ein Dokument `groups/{groupId}/groupConfig/stammdaten` mit
Absender, Anschrift, Kontakt, Kontoinhaber, IBAN, BIC und dem Storage-Pfad
ihres Logos. Gepflegt wird es im Reiter „Stammdaten" — erreichbar sowohl unter
`/admin/atemschutz` als auch unter `/admin/kostenersatz`, weil man an genau
einer dieser beiden Stellen steht, wenn ein Beleg nicht stimmt.

## Warum ein gemeinsames Dokument

Vorher stand die Bankverbindung an zwei Orten: fest im Quelltext des
Kostenersatz-PDFs (`AT40 3300 …`, `RLBBAT2E`, „Freiwillige Feuerwehr Neusiedl
am See") und noch einmal gepflegt in `atemschutzConfig/rechnung`. Beides ist
falsch — das eine, weil jede andere Feuerwehr damit unter fremdem Namen
Rechnungen stellte, das andere, weil dieselbe IBAN an zwei Orten
auseinanderläuft, sobald sich das Konto ändert.

Ein eigenes Dokument und **nicht** das Gruppen-Dokument selbst: Dessen Felder
liest jedes Gruppenmitglied auf jedem Einsatz-Screen mit, und die
Bankverbindung gehört dort nicht hin. Die Leseregel ist deshalb
`fahrtenbuchMember()` — ohne `kostenersatzUser()`, anders als bei
`atemschutzConfig`, weil die Kostenersatz-Oberfläche die Lücken auch dem
zeigen muss, der nur rechnet. Geschrieben wird ausschließlich über
`saveGroupStammdaten`; die eigentliche Grenze ist dort
`actionGroupAdminRequired`.

## Ohne Stammdaten entsteht kein Beleg

`requireStammdatenForFirecall` löst die Gruppe über `Firecall.group` auf und
wirft `StammdatenUnvollstaendigError`, wenn Absender, Anschrift oder IBAN
fehlen. Das ist ein harter Stopp, kein Hinweis:

- Kostenersatz-PDF: `409` statt eines Blattes, das aussieht wie ein Beleg.
- Füllungsrechnung: `createFuellungRechnung` weist ab, und auf der
  Verrechnungsseite ist der Knopf gesperrt.
- Mailversand: keine Mail ohne den Anhang, den es nicht gibt.
- SumUp-Zahlungseingang: die Berechnung bleibt Entwurf und lässt sich
  nachschicken, sobald die Stammdaten stehen. Der Zahlungseingang selbst ist
  davon unberührt.

Der Grund ist immer derselbe: Ein Beleg ohne Absender und Konto sagt dem
Empfänger weder, von wem die Forderung kommt, noch wohin er überweisen soll.
Der Fehler fiele erst bei ihm auf.

**BIC und Kontoinhaber sind bewusst keine Pflichtfelder.** Innerhalb des EWR
ist der BIC entbehrlich, und der Kontoinhaber fällt auf den Absender zurück.

`absenderName` fällt seinerseits auf den `feuerwehrName` aus dem
Gruppendokument zurück. Ein eigenes Feld ist es trotzdem: Auf einem Beleg soll
der volle Name stehen („Freiwillige Feuerwehr …"), während `feuerwehrName` die
Schreibweise trägt, mit der die Atemschutz-Stammdaten ihre Geräte zuordnen.

## Das Logo

Hochgeladen wird nach `groups/{groupId}/stammdaten/{uuid}-{name}`, gespeichert
wird im Dokument nur der **Pfad**, nicht die Download-URL: Der Pfad ist stabil
und wird zur Anzeige serverseitig zu einer kurzlebigen Signed URL — dieselbe
Bauweise wie bei den Mangel-Bildern des Fahrtenbuchs.

**Kein SVG.** `@react-pdf/renderer` rendert SVG als `<Image>` nicht; ein
angenommenes SVG ergäbe ein Logo, das in der Browser-Vorschau steht und auf
jedem PDF fehlt. Erlaubt sind PNG und JPEG bis 2 MB. Dieselben beiden
Bedingungen stehen in `storage.rules` **und** in
`src/common/groupStammdaten.ts`; ein Test dort liest die Regeldatei und
vergleicht die Werte. Die Regel ist die Schranke, die Prüfung im Browser die
Auskunft: Ohne sie antwortet der Storage nur mit `storage/unauthorized`, und
niemand erfährt, dass die Datei zu groß war.

Die Storage-Regel erlaubt nur `create` und verbietet `read` für alle. Lesen
kann sie nicht freigeben, weil die Entscheidung an der Gruppenmitgliedschaft
hängt und die in Firestore steht — ein `firestore.get` aus einer
Storage-Regel trifft immer die Default-Datenbank und gäbe in der
Dev-Datenbank `ffndev` die falsche Antwort. Deshalb geht die Vorschau über die
Server Action `signStammdatenLogo`, die die Mitgliedschaft prüft und erst
danach signiert. Serverseitig lädt `loadStammdatenLogo` die Bytes für das PDF;
sie wirft nie — ein PDF ohne Kopfbild ist brauchbar, ein fehlendes PDF nicht.

Ein neues Logo löst das alte ab und löscht es; ohne das sammelte jeder
Austausch eine weitere verwaiste Datei an. Der vom Browser geschickte Pfad
wird vorher gegen die eigene Gruppe geprüft
(`sanitizeStammdatenLogoPath`) — sonst ließe sich ein fremdes Storage-Objekt
ins eigene Dokument schreiben, und die Anzeige signierte es anschließend brav.

## Mailvorlagen

Die Vorlagen des Kostenersatzes liegen seit dieser Umstellung ebenfalls je
Gruppe (`groups/{groupId}/kostenersatzConfig/email`, vorher ein einzelnes
Dokument auf Wurzelebene). Sie nennen die Bankverbindung über Platzhalter —
`{{ absender.name }}`, `{{ absender.kontoinhaber }}`, `{{ absender.iban }}`,
`{{ absender.bic }}` — statt sie einzutippen. Eine app-weite Vorlage trüge
sonst die IBAN einer fremden Feuerwehr in jede Mail.

`DEFAULT_EMAIL_CONFIG.fromEmail` ist bewusst leer: Eine dort eingetragene
Absenderadresse ginge im Namen einer fremden Feuerwehr hinaus. Ohne sie
entfällt schlicht der `Reply-To`-Header.

## Betrieb

`storage.rules` wird über Terraform ausgerollt
(`terraform/modules/project-base/firebase.tf`), nicht mit `firebase deploy` —
die Logo-Regel wird also erst mit dem Rollout wirksam.

Es gibt **keine Migration**: Die Felder starten leer und werden von Hand
eingetragen. Zwischen Rollout und Pflege beantwortet die PDF-Route `409` und
Füllungsrechnungen lassen sich nicht erstellen. Ein Gruppen-Admin sollte die
Stammdaten daher unmittelbar nach dem Rollout eintragen.
