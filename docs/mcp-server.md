# MCP-Server und OAuth 2.1

Die Einsatzkarte ist ihr eigener **Authorization Server** und stellt unter
`/api/mcp` einen **MCP-Server** bereit. Externe Clients — claude.ai als Custom
Connector, Claude Code, Claude Desktop, eigene Skripte — greifen darüber unter
der Identität und mit den Rechten eines angemeldeten Benutzers auf Einsatzdaten
zu.

Die Benutzeranleitung steht in `content/docs/{de,en}/mcp.md` und unter
`/docs/mcp`. Dieses Dokument beschreibt, **warum** die Teile so gebaut sind.

## Warum ein eigener Authorization Server

Firebase Auth und Google OAuth scheiden aus: Sie unterstützen weder dynamische
Client-Registrierung noch das Ausstellen von Access Tokens, deren Audience ein
fremder Resource Server ist. claude.ai braucht beides, um sich ohne manuelle
Client-Anlage zu verbinden.

**Die Benutzer-Authentisierung wird trotzdem nicht nachgebaut.**
`/api/oauth/authorize` prüft die bestehende NextAuth-Session; ist niemand
angemeldet, geht es über `/login?callbackUrl=…` und von dort zurück. Es bleibt
bei **einer** Benutzerverwaltung, und alle bestehenden Guards gelten
unverändert weiter.

Der Ausweichpfad, falls sich der eigene AS als zu aufwendig erweist, wäre ein
externer Anbieter (Auth0, WorkOS, Stytch, Descope) — er bringt eine
kostenpflichtige Abhängigkeit und einen zweiten Identitätsspeicher neben
Firebase mit. Er wurde bewusst nicht genommen.

## Endpunkte

| Pfad | Zweck | Norm |
| --- | --- | --- |
| `/.well-known/oauth-protected-resource` und `…/api/mcp` | Resource-Metadaten, verweisen auf den AS | RFC 9728 |
| `/.well-known/oauth-authorization-server` | AS-Metadaten | RFC 8414 |
| `/.well-known/jwks.json` | öffentlicher Signaturschlüssel | RFC 7517 |
| `/api/oauth/register` | Dynamic Client Registration | RFC 7591 |
| `/api/oauth/authorize` | Login-Delegation, Consent, Code | RFC 6749 / 9207 |
| `/api/oauth/token` | Code-Einlösung und Refresh | RFC 6749 |
| `/api/oauth/revoke` | Widerruf | RFC 7009 |
| `/api/mcp` | der MCP-Endpunkt | MCP 2026-07-28 |

Die Discovery beginnt am 401: Ein unauthentifizierter Aufruf von `/api/mcp`
antwortet mit `WWW-Authenticate: Bearer resource_metadata="…"`. Ohne diesen
Header findet ein Client den Authorization Server nicht, und der gesamte
Verbindungsaufbau bricht ab.

## DCR *und* CIMD

**Dynamic Client Registration ist seit der Spec-Revision 2026-07-28 formal
deprecated.** Nachfolger sind **Client ID Metadata Documents (CIMD)**: Die
`client_id` ist die HTTPS-URL eines Metadaten-Dokuments, das der Client selbst
hostet und das der Authorization Server abruft.

Implementiert ist beides, und das ist kein Zaudern:

- **DCR** ist das, was claude.ai heute nutzt, und was der Mobile-Client
  braucht.
- **CIMD** ist das, was bleibt — es verhindert eine Neuimplementierung in einem
  Jahr.

Welcher Weg vorliegt, steht an der `client_id` selbst: Eine HTTPS-URL ist immer
CIMD (`isCimdClientId`). CIMD-Clients liegen **nicht** in `oauthClients` — eine
URL ist keine gültige Firestore-Dokument-ID —, sie werden bei Bedarf geholt und
15 Minuten zwischengespeichert.

### Der CIMD-Abruf ist der gefährlichste Teil des Servers

Die abgerufene URL bestimmt der Aufrufer vollständig. Ohne Schutz wäre das ein
Werkzeug, um aus dem Cloud-Run-Container heraus interne Adressen abzufragen —
allen voran den Metadaten-Server unter `169.254.169.254`, der Tokens des
Dienst-Kontos ausgibt.

`src/server/oauth/cimd.ts`, `cimdRequest.ts` und `ssrf.ts` setzen deshalb:

- nur HTTPS, kein Standard-abweichender Port, keine Zugangsdaten in der URL,
  kein Fragment;
- **die Verbindung ist an die geprüfte Adresse gebunden.** Das ist der Kern,
  und eine Prüfung vor dem Abruf allein reicht dafür nicht: Ein HTTP-Client
  löst den Namen selbst noch einmal auf, und zwischen Prüfung und
  Verbindungsaufbau liegt ein Zeitfenster. Ein Angreifer mit eigenem
  DNS-Server und kurzer TTL antwortet beim ersten Mal öffentlich und beim
  zweiten Mal intern — **DNS Rebinding**; die Prüfung hätte genau die Adresse
  gesehen, die nicht verwendet wird. Deshalb läuft der Abruf über
  `https.request` mit eigener `lookup`-Funktion: Die Prüfung sitzt *in* der
  Auflösung, die die Verbindung benutzt. Die TLS-Prüfung bleibt vollständig,
  weil der `servername` weiterhin aus dem Host der URL kommt und nicht aus der
  Adresse;
- Prüfung **aller** aufgelösten Adressen, nicht nur der ersten: Ein Angreifer
  kann mehrere A-Records setzen und darauf spekulieren, dass der
  Verbindungsaufbau eine andere wählt. Ist eine gesperrt, wird der ganze Satz
  verworfen;
- **keine Weiterleitungen** — `https.request` folgt ihnen von sich aus nicht,
  und ohne 200 bricht der Aufrufer ab. Eine 302 auf eine interne Adresse führte
  sonst am Filter vorbei, weil der nur die erste URL sieht;
- eine **absolute Frist** (5 s) über Auflösung, Verbindung und Körper zusammen.
  Ein Leerlauf-Timeout am Socket täte das nicht: Es wird von jedem
  eintreffenden Byte zurückgesetzt, ein Server mit einem Byte alle vier
  Sekunden hielte die Verbindung unbegrenzt offen — und solange die
  Namensauflösung läuft, gibt es noch gar keinen Socket, an dem es greifen
  könnte;
- ein Größenlimit (64 KiB) **beim Lesen** und nicht erst am fertigen Körper —
  ein `content-length`-Header ist eine Behauptung des Gegenübers;
- `client_id` im Dokument **muss exakt** der Abruf-URL entsprechen. Ohne diese
  Bindung könnte jeder ein fremdes Dokument als seine `client_id` ausgeben.

Zusätzlich prüft `fetchClientIdMetadata` die Adressen schon vor dem
Verbindungsaufbau. Das ist keine zweite Verteidigungslinie, sondern Bequemlichkeit:
Der offensichtliche Fall wird früh und mit verständlicher Meldung abgewiesen.
Verlassen wird sich darauf nicht.

### Wer den Abruf überhaupt auslösen kann

Der wirksamste Teil ist nicht der Filter, sondern die Reihenfolge:
`resolveAuthorizeRequest` prüft **zuerst die Anmeldung** und löst die
`client_id` erst danach auf. Ohne diese Reihenfolge könnte jeder ohne Anmeldung
den Server dazu bringen, eine beliebige Adresse abzurufen — und mit einem
langsam antwortenden Gegenüber einen Request-Handler binden.

Für die Anmelde-Weiterleitung wird der Client nicht gebraucht: Sie trägt nur
die unveränderte Anfrage zurück. Ein fehlerhafter Aufruf bekommt seine
Fehlermeldung dadurch erst nach der Anmeldung — angemeldet sein muss man für
eine Autorisierung ohnehin.

Für den angemeldeten Fall greift zusätzlich ein Rate Limit auf
`/api/oauth/authorize` (30 je Adresse und Minute).

## Sicherheits-Muss-Kriterien und wo sie stehen

| Anforderung | Ort |
| --- | --- |
| PKCE `S256` Pflicht, `plain` und fehlendes PKCE abgewiesen | `authorizeRequest.ts`, `pkce.ts` |
| Redirect-URIs exakt, nur HTTPS (Ausnahmen: Loopback und Private-Use nach RFC 8252) | `redirectUri.ts` |
| `resource` (RFC 8707) auf beiden Beinen, `aud` gegen die eigene MCP-URL | `authorizeRequest.ts`, `token/route.ts`, `accessToken.ts` |
| `iss` in der Authorization Response (RFC 9207) | `buildAuthorizeRedirect` |
| Authorization Codes: einmalig, ≤ 60 s, gebunden an Client, Redirect, PKCE, Resource | `authCodes.ts` |
| Refresh-Rotation mit Reuse-Detection, Kettenwiderruf | `refreshTokens.ts` |
| Alle Geheimnisse nur gehasht (SHA-256) gespeichert | `secrets.ts` |
| Rate Limit auf `register`, `token`, `revoke`, `mcp` | `rateLimit.ts` |
| Kein Token-Passthrough | Firestore läuft über das Admin SDK unter der Dienst-Identität |

**Loopback-Ports werden beim Redirect-Vergleich ignoriert** (RFC 8252
Abschnitt 7.3): Claude Code öffnet einen lokalen Listener auf einem frei
gewählten Port und kennt ihn bei der Registrierung noch nicht. Schema, Host,
Pfad und Query müssen trotzdem exakt stimmen.

**`application_type` entscheidet über den Redirect nichts.** Anfangs waren
Loopback und Private-Use an `application_type: 'native'` gebunden. Das ging
schief, sobald der erste echte Client kam: Claude Codes Metadaten-Dokument
(`https://claude.ai/oauth/claude-code-client-metadata`) setzt das Feld gar
nicht — RFC 7591 verlangt es nicht — und registriert
`http://localhost/callback`. Der Vorgabewert `web` hat den Client damit
ausgesperrt.

Der Denkfehler dahinter wog schwerer als der Ausfall: `application_type` ist
eine **Selbstauskunft des Clients**. Wer Loopback missbrauchen wollte, hätte
schlicht `native` hineingeschrieben. Die Schranke hielt also genau die auf,
die ehrlich waren, und niemanden sonst. Was Loopback tatsächlich absichert,
ist PKCE: Ein Code, den ein anderer lokaler Prozess abfängt, ist ohne den
`code_verifier` wertlos — und der ist hier ausnahmslos Pflicht.

**Ein Access Token ist ein signiertes JWT** und wird ohne Firestore-Read
geprüft — das zählt bei jedem einzelnen Tool-Call. Der Preis: Ein Widerruf
greift erst mit dem Ablauf. Daher die kurze Lebensdauer (eine Stunde) und der
Widerruf über das Refresh Token, das den Zugang am Leben hält. Dieser
Zusammenhang steht auch in der Benutzeranleitung, weil er dort erklärt werden
muss.

**Bei jedem Token-Tausch und jedem Tool-Call** wird der Benutzer erneut gegen
das Benutzerdokument geprüft (`loadMcpUser`), nicht gegen den Token-Inhalt. Wer
in der Stunde die Berechtigung verliert, arbeitet nicht bis zum Ablauf weiter.

## Wer darf verbinden

Alle autorisierten Benutzer. **Einsatz-Gäste sind ausgenommen**: Ihr Zugang ist
ein zeitlich begrenzter Share-Link auf genau einen Einsatz; ihn über einen
externen Client dauerhaft verlängerbar zu machen wäre das Gegenteil dessen,
wofür er gedacht ist. Geprüft wird das an zwei Stellen — beim `authorize` und
in `loadMcpUser`.

**Fahrtenbuch und Kostenersatz sind nicht über MCP erreichbar.** Dort stehen
personenbezogene Daten (Namen, Fahrten, Rechnungsempfänger), deren Übertragung
an einen externen KI-Anbieter gesondert zu klären wäre. Auch für Einsatzdaten
gilt: Crew-Namen und Meldende-Daten fließen zu einem US-Anbieter — der
Consent-Screen benennt das ausdrücklich.

## Scopes

| Scope | Bedeutung |
| --- | --- |
| `einsatz:read` | Einsätze, Items, Ebenen, Tagebuch, Geschäftsbuch lesen |
| `einsatz:write` | Items anlegen/ändern/löschen, Tagebuch- und GB-Einträge schreiben |
| `hydranten:read` | Hydranten, Wasserversorgung |
| `berechnung` | reine Rechner-Tools, kein Datenzugriff |

**Scopes schneiden nur ein, sie erweitern nie.** Die effektiven Rechte eines
Tool-Calls sind die Schnittmenge aus Scope und den Rechten des Benutzers aus
`user`/`groups`; jeder Zugriff auf einen Einsatz läuft zusätzlich über
`verifyUserAuthorizedForFirecall`.

**Registriert wird nur, was der Scope deckt.** Ein Token ohne `einsatz:write`
sieht die schreibenden Tools gar nicht erst in `tools/list` — ehrlicher als ein
Tool, das bei jedem Aufruf „nicht erlaubt" sagt, und es hält den Werkzeugkasten
des Modells klein.

## Ein Tool-Set, zwei Aufrufer

Die schreibenden MCP-Tools führen **dieselben Handler** aus wie der
Browser-Assistent: `create_item` bildet auf denselben
`createMarker`/`createVehicle`/…-Aufruf ab, den Gemini im Browser auslöst
(`executeToolCall` in `src/hooks/aiAssistant/toolHandlers.ts`). Der Unterschied
steckt ausschließlich in den Abhängigkeiten
(`src/server/mcp/serverToolDeps.ts`).

Drei Dinge gibt es serverseitig nicht und sind bewusst abgebildet statt
weggelassen:

- **Keine Karte.** Rückfall für Positionsangaben ist der Einsatzort und, wenn
  der fehlt, die Ortsmitte — und die zurückgegebene Bezeichnung sagt das.
- **Keine Benutzerposition.** Ein `userPosition`-Wunsch fällt auf den
  Einsatzort zurück.
- **Kein Gedächtnis zwischen Aufrufen.** Der Transport ist zustandslos,
  `lastCreatedItem` bleibt leer; ein Tool-Call muss sein Ziel benennen.

Damit dasselbe für die Positionsauflösung und die Projektion der Elemente gilt,
sind beide aus dem Browser-Code herausgezogen:
`src/hooks/aiAssistant/resolveOrigin.ts` und `src/common/mcp/itemDto.ts`.

### Leaflet gehört nicht in den Server

Die Rechner-Fassaden (`foerderung.ts`, `pendelverkehr.ts`, `sandsack.ts`) sind
`'use client'` und ziehen über `connectionDisplayPositions` Leaflet mit — im
Node-Prozess bricht das beim Laden ab, weil es dort kein `window` gibt. Der
rechnende Teil liegt deshalb in eigenen Dateien ohne Karte
(`foerderung/defaults.ts`, `pendel/defaults.ts`, `damm/sandsackBedarf.ts`,
dazu die schon vorher reinen `hydraulics.ts`, `frictionLoss.ts`, `shuttle.ts`).
Die Fassaden re-exportieren sie — es gibt weiterhin genau eine Quelle je Wert.

## Zustandslos, und warum

Die Spec-Revision **2026-07-28 hat `Mcp-Session-Id` abgeschafft**; das Protokoll
ist ohne Session-Identifier definiert. Dazu passt der Betrieb auf Cloud Run mit
mehreren Instanzen ohne Sticky Sessions — ein Session-Store (Redis) wäre neue
Infrastruktur ohne Gegenwert. `createMcpHandler` bedient daneben die
2025er-Revision über seinen zustandslosen Rückfall, damit ältere Clients nicht
ausgesperrt sind.

## Betrieb

**Der Issuer muss die Custom Domain sein, nicht die `run.app`-URL.** Cloud Run
kennt die öffentliche Adresse nicht als Umgebungsvariable; `getOauthIssuer()`
geht über `getBaseUrl()`, das sie aus dem Request ableitet und gegen die
Allowlist prüft. Ein falscher Issuer bricht den gesamten Flow: Der Client
vergleicht ihn gegen den `iss` der Authorization Response und gegen den
`iss`-Claim des Tokens. Hintergrund: [docs/auth-und-origins.md](auth-und-origins.md).

**Signaturschlüssel:** `MCP_OAUTH_SIGNING_KEY` im Secret Manager, von Terraform
erzeugt (`tls_private_key`, RSA 2048, PKCS#8). Der `kid` im JWT-Header ist der
RFC-7638-Thumbprint des öffentlichen Schlüssels und ändert sich bei einer
Rotation von selbst. Rotation = neue Secret-Version anlegen und neu deployen;
bereits ausgestellte Tokens werden dabei ungültig, und genau das ist der Zweck.
Lokal reicht die Umgebungsvariable `MCP_OAUTH_SIGNING_KEY` mit dem PEM (`\n`
darf escaped sein):

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out mcp-key.pem
```

**Schreibende Tools stehen hinter `MCP_WRITE_ENABLED`** — in dev an, in prod
zunächst aus. Ohne den Schalter registriert der Server sie nicht, unabhängig
vom Scope.

**Der Proxy (`src/proxy.ts`) lässt `/api/mcp` und `/api/oauth/` in Ruhe.** Er
setzt sonst `Access-Control-Allow-Origin` auf die eigene Adresse und beantwortet
jeden OPTIONS-Aufruf selbst — beides ist hier falsch, denn diese Endpunkte
werden von fremden Origins aufgerufen und brauchen im Preflight `authorization`
und `mcp-protocol-version` in der Header-Liste.

**Der Service Worker fängt sie nicht ab** (`src/worker/patterns.ts`,
`NetworkOnly` ganz oben): Ein zwischengespeichertes Discovery-Dokument überlebt
einen Deploy mit geänderter Adresse und bricht dann den Verbindungsaufbau, ohne
dass irgendwo ein Fehler auftaucht.

**App Check gatet den MCP-Endpunkt nicht** — externe Clients können sich nicht
attestieren.

## Firestore

Vier Sammlungen, alle rein serverseitig (`allow read, write: if false`):

| Sammlung | Inhalt |
| --- | --- |
| `oauthClients` | DCR-Registrierungen; Secret nur als Hash |
| `oauthAuthCodes` | Authorization Codes (Hash als Dokument-ID), TTL |
| `oauthRefreshTokens` | Refresh Tokens (Hash als Dokument-ID), TTL |
| `oauthConsents` | erteilte Einwilligungen |

`ttlAt` ist ein echter Timestamp und trägt die TTL-Policy; `expiresAt` bleibt
eine ISO-Zeichenkette, weil die Ablauflogik ohne Firestore testbar sein soll und
eine TTL-Policy mit einer Zeichenkette nicht arbeitet.

## Herkunft schreibender Zugriffe

Jeder Schreibvorgang ist dreifach zuordenbar:

- `creator`/`updatedBy` = UID des Benutzers, wie im Browser;
- `source: 'mcp'`, `mcpClientId`, `mcpClientName` am Element selbst;
- ein Eintrag im `auditlog` des Einsatzes, mit `<uid> (MCP: <Anwendung>)` im
  Benutzerfeld.

Die Felder stehen **am Element** und nicht nur im Auditlog: Der Auditlog ist die
Prüfspur, das Element ist das, was jemand liest. Im Einsatztagebuch und im
Geschäftsbuch zeigt `McpOriginChip` sie an — ein Eintrag kann Grundlage eines
Einsatzberichts sein, und dann zählt, ob ihn ein Mensch verfasst hat.

## Testen

```bash
npx @modelcontextprotocol/inspector
```

Gegen die dev-Instanz verbinden und Discovery, Login-Flow, Tool-Liste sowie je
einen lesenden und einen schreibenden Aufruf prüfen. Danach claude.ai als
Custom Connector und Claude Code (`claude mcp add --transport http`) — Letzteres
prüft den Loopback-Redirect.

Der Nachweis, dass ein Token mit falscher Audience abgewiesen wird, steht als
Test in `src/server/oauth/accessToken.test.ts`; die negativen
Autorisierungsfälle in `src/server/mcp/userAccess.test.ts` und
`src/server/mcp/mcpServer.test.ts`.

## Quellen

- [Die 2026-07-28-Spezifikation — MCP Blog](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
- [Client Registration — MCP Specification 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration)
- [Building custom connectors via remote MCP servers — Anthropic Help Center](https://support.anthropic.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers)
- [What is a Client ID Metadata Document (CIMD)? — Descope](https://www.descope.com/learn/post/cimd)
