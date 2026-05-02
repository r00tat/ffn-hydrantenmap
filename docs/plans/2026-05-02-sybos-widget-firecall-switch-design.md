# Sybos-Widget: Einsatz-Wechsel — Design

## Ziel

Im Chrome-Extension-Sybos-Widget (Overlay auf `sybos.lfv-bgld.at`) soll der aktive Einsatz direkt umgeschaltet werden können — ohne den Umweg über das Extension-Popup.

## Kontext

- **Bestehender Stand:** Das Sybos-Content-Script ([chrome-extension/entrypoints/sybos.content/sybos-firecall.ts](../../chrome-extension/entrypoints/sybos.content/sybos-firecall.ts)) zeigt aktuell den schreibgeschützten Namen, Beschreibung, Datum und Link zum aktiven Einsatz an. Quelle der Wahrheit ist `chrome.storage.local.selectedFirecallId`.
- **Im Popup** existiert bereits `FirecallSelect` ([chrome-extension/entrypoints/popup/components/FirecallSelect.tsx](../../chrome-extension/entrypoints/popup/components/FirecallSelect.tsx)) mit Live-Subscription via `useFirecalls` ([chrome-extension/entrypoints/popup/hooks/useFirecalls.ts](../../chrome-extension/entrypoints/popup/hooks/useFirecalls.ts)).
- **Background-Script** ([chrome-extension/entrypoints/background.ts](../../chrome-extension/entrypoints/background.ts)) kennt nur `GET_CURRENT_FIRECALL` / `GET_FIRECALL` (per ID). Eine Liste aller zugänglichen Einsätze fehlt.
- **Widget-Stack:** Vanilla TypeScript / DOM (kein React/MUI), CSS in `sybos.css`. Sybos schreibt das DOM teils neu — Widget rebuildet sich alle 200 ms.

## Architektur

```
[Sybos-Tab Content-Script]                       [Background-Script]
sybos-firecall.ts                                 background.ts
  loadFirecall()                                    handleMessage()
    ├─ GET_FIRECALL_LIST  ──────────────────►       ▶ getFirecallList()
    │                                                 (group/claim-Filter,
    │                                                  orderBy date desc,
    │                                                  limit 20,
    │                                                  + aktiver Einsatz
    │                                                  falls nicht in Top-20)
    │  ◄────────────  { firecalls: [{id,name,date}] }
    ├─ GET_CURRENT_FIRECALL  ────────────────►      ▶ liest selectedFirecallId
    │  ◄────────────  { firecall: {...} }
    └─ rendert Dropdown + Inhalt

  onChange dropdown:
    ├─ chrome.storage.local.set({selectedFirecallId})
    └─ loadFirecall() neu  ──► alles re-rendern
```

Source of truth bleibt `chrome.storage.local.selectedFirecallId` — das Popup spiegelt die Auswahl automatisch.

## Komponenten & Änderungen

### Neu: `chrome-extension/entrypoints/sybos.content/sybos-firecall-select.ts`

Vanilla-DOM-Komponente, die das `<select>` mit Label baut. Signatur:

```ts
renderFirecallSelect(
  container: HTMLElement,
  firecalls: FirecallListEntry[],
  selectedId: string | null,
  onChange: (id: string) => void,
): void
```

- Rendert MUI-ähnlichen `ek-field`-Block (Label "Einsatz" + `<select>`).
- Disabled, wenn Liste leer.
- Anzeige pro Option: `${name} — ${dateString}` (analog zu `FirecallSelect.tsx:37`).
- Markiert aktuell selektierten Eintrag.

### Geändert: `chrome-extension/entrypoints/sybos.content/sybos-firecall.ts`

- `loadFirecall()` ruft `GET_FIRECALL_LIST` und `GET_CURRENT_FIRECALL` parallel via `Promise.all`.
- `showFirecall()` ersetzt den read-only Namens-Block durch `renderFirecallSelect`.
- onChange-Handler: `await chrome.storage.local.set({selectedFirecallId})` → `loadFirecall()` erneut.
- Wenn `GET_FIRECALL_LIST` fehlschlägt, Fallback: Dropdown weglassen, read-only-Name wie bisher anzeigen — das Panel bleibt funktional.

### Geändert: `chrome-extension/entrypoints/background.ts`

Neuer Message-Typ `GET_FIRECALL_LIST`:

```ts
async function getFirecallList(): Promise<{ firecalls: FirecallListEntry[] }>
```

- Holt Claims via `currentUser.getIdTokenResult()` → `claims.groups`, `claims.firecall`.
- Sonderfall `firecall`-Claim: `getDoc(call/{firecallId})` → einelementige Liste.
- Sonst: Query
  ```ts
  query(
    collection(firestore, 'call'),
    where('deleted', '==', false),
    where('group', 'in', groups.slice(0, 30)),
    orderBy('date', 'desc'),
    limit(20),
  )
  ```
- Aktuell ausgewählten Einsatz separat fetchen (`selectedFirecallId` aus `chrome.storage.local`); falls nicht in Liste vorhanden, einfügen und nach Datum desc neu sortieren.
- Rückgabe minimal — nur `{id, name, date}` pro Eintrag. Beschreibung/restliche Felder lädt weiterhin `GET_CURRENT_FIRECALL`.

`MessageRequest`-Union erweitern.

## Edge Cases

| Fall | Verhalten |
|------|-----------|
| User hat keine Groups und keinen Claim | `firecalls: []` → Dropdown leer/disabled, falls aktiver Einsatz vorhanden bleibt nur dieser sichtbar. |
| `groups.length > 30` | `slice(0, 30)` (wie Popup). |
| Aktiver Einsatz wurde gelöscht / Zugriff entzogen | Merge-Lookup gibt `null` zurück → wird nicht ergänzt; Dropdown zeigt nur Top-20. |
| `GET_FIRECALL_LIST` schlägt fehl | Dropdown ausgeblendet, Fallback auf bisherige read-only-Namensanzeige. Kein Blocker. |
| Sybos-DOM-Rewrite während des Wechsels | Widget rebuildet sich (sybos-widget.ts:129); `loadFirecall()` läuft im neuen `onOpen`-Callback erneut → Liste & Auswahl frisch. Kein Konflikt. |
| User klickt Dropdown während Reload | Während `await loadFirecall()` zeigt das Panel kurz "Lade…" via `showStatus()`. |

## Tests

TDD-first (Vitest + Testing-Library, neben Quelldateien — siehe CLAUDE.md):

1. **`sybos-firecall-select.test.ts`** (neu)
   - Rendert `<select>` mit allen Firecalls in korrekter Reihenfolge.
   - Selektierter Eintrag matcht `selectedId`.
   - `onChange` wird mit neuer ID aufgerufen.
   - Leere Liste → disabled.

2. **`sybos-firecall.test.ts`** (neu oder erweitert)
   - Mock `chrome.runtime.sendMessage` für beide Message-Typen.
   - Auswahl im Dropdown → `chrome.storage.local.set` + erneutes `loadFirecall`.
   - Aktiver Einsatz nicht in Top-20 → wird trotzdem gerendert.

Background-Handler **nicht** unit-testen (kein bestehendes Test-Setup für `background.ts`) — manuell verifizieren.

## Build-Sequenz

1. Test für `sybos-firecall-select` → Komponente implementieren.
2. `GET_FIRECALL_LIST`-Handler im Background.
3. `sybos-firecall.ts` umbauen (parallele Messages, Dropdown statt read-only-Name).
4. Test für Auswahl-Flow.
5. Manuelle Verifikation:
   - `npm run build` im `chrome-extension`-Verzeichnis.
   - Extension lokal nachladen, auf Sybos einloggen.
   - Auswahl wechseln → Panel aktualisiert.
   - Popup öffnen → spiegelt neue Auswahl.
6. Final-Checks (in Reihenfolge, **nicht** `npm run check`):
   - `npx tsc --noEmit`
   - `npx eslint`
   - `npx vitest run`
