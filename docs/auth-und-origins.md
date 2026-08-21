# Basis-URL, erlaubte Origins und Cron-Aufrufer

Cloud Run stellt die öffentliche URL **nicht** als Umgebungsvariable bereit —
Custom Domains sind dem Container unbekannt. Die Origin kommt deshalb aus dem
Request: Cloud Run reicht den Original-`Host` durch und setzt
`X-Forwarded-Proto`. Zuständig ist [src/server/auth/baseUrl.ts](../src/server/auth/baseUrl.ts):

- `requestOrigin()` — Origin aus den Forwarded-Headern, geprüft gegen die
  Allowlist. Für WebAuthn zwingend, weil RP ID und Origin sich zwischen Prod,
  Dev und localhost unterscheiden.
- `getBaseUrl()` — dasselbe, mit `NEXTAUTH_URL` als Fallback für request-lose
  Kontexte (E-Mail-Versand, Hintergrund-Jobs). Für generierte Links verwenden.

Ohne `PASSKEY_ALLOWED_ORIGINS` gilt `NEXTAUTH_URL` plus `http://localhost:3000`.
**Außerhalb von Produktion** wird zusätzlich jede Loopback-Adresse akzeptiert
(`localhost`, `127.0.0.1`, `::1`) — unabhängig von Port und Schema, damit
`next dev -p 3001` und `npm run dev:https` (dort lautet die Origin
`https://localhost:3000`) nicht an einer auf einen Port festgelegten Allowlist
scheitern. LAN-IPs und Tunnel-Domains bleiben außen vor: über http sind sie kein
Secure Context, dort verweigert schon der Browser die WebAuthn-Ceremony. Wer sie
braucht (z.B. `*.nip.io` mit TLS für Gerätetests), trägt sie explizit in
`PASSKEY_ALLOWED_ORIGINS` ein.

Wird eine Origin abgelehnt, protokolliert `requestOrigin()` sie zusammen mit der
Allowlist — der Aufrufer sieht sonst nur `passkey: request origin is not allowed`.

## CRON_INVOKER_EMAILS

`CRON_INVOKER_EMAILS` ist eine komma-separierte Allowlist der
Service-Account-Adressen, die zeitplan-gesteuerte Endpoints aufrufen dürfen
(aktuell `/api/fahrtenbuch/weekly-report`). **Pflicht für diese Endpoints:**
Ohne die Variable lehnt `cronRequired` jeden Aufruf ab (fail closed) — ein
offener Endpoint, der Mails an gepflegte Verteilerlisten verschickt, wäre ein
Mail-Relay. In Cloud Run setzt terraform den Wert als Env-Var des Dienstes
(`local.cron_invoker_emails` im jeweiligen Root), abgeleitet aus dem Projekt
und den Namen der Invoker-Service-Accounts. Die Liste enthält die Invoker
**beider** Umgebungen, weil Dev und Prod das Projekt `ffn-utils` teilen; deren
Namen unterscheidet `name_suffix` des Moduls `cloud-scheduler`. Ein
`check`-Block im Root prüft, dass der tatsächliche Invoker auf der Liste steht.

**Bewusst kein Secret-Manager-Secret:** Der Wert ist eine Kennung, kein
Geheimnis — wer die Adresse kennt, kann kein Token dafür ausstellen, dazu
braucht es IAM-Rechte auf den Service Account.
