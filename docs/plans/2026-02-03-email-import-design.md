# Email Import for Einsatzorte - Design Document

**Date:** 2026-02-03
**Status:** Draft
**Feature:** Automatic extraction of firecall locations from Unwetter emails

## Overview

Server-side action that reads starred emails from Gmail, uses Gemini AI to extract structured firecall location data, and adds new locations to the current firecall's Einsatzorte.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────┐
│ Einsatzorte     │────▶│ Server Action    │────▶│ Gmail   │
│ Page (client)   │     │ (emailImport)    │     │ API     │
└─────────────────┘     └────────┬─────────┘     └─────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
              ┌──────────┐ ┌──────────┐ ┌──────────┐
              │ Vertex AI│ │ Firestore│ │ Firestore│
              │ (Gemini) │ │ (read)   │ │ (write)  │
              └──────────┘ └──────────┘ └──────────┘
```

### Trigger Mechanism

- **On page load**: Auto-trigger import when user opens Einsatzorte page
- **Manual refresh**: Button to check for new emails on demand
- **Feedback**: Silent badge showing count of added locations (auto-hides after 5s)

### Gmail Access

- Uses existing `createWorkspaceAuth()` pattern from `src/server/auth/workspace.ts`
- Service account impersonates `EINSATZMAPPE_IMPERSONATION_ACCOUNT`
- Gmail query: `label:einsatz-unwetter is:starred`
- Gmail rule handles labeling; users star emails to process
- Processed emails are unstarred after successful import

### AI Extraction

- Server-side Vertex AI via `@google-cloud/vertexai` package
- Model: `gemini-2.5-flash`
- Structured JSON output with schema enforcement
- Same extraction prompt as existing AppScript implementation

## Data Model

### FirecallLocation Schema Extension

Add one field to existing `FirecallLocation` interface:

```typescript
interface FirecallLocation {
  // ... existing fields ...

  auftragsNummer?: string;  // For deduplication of email-imported locations
}
```

### Field Mapping

| Source (Gemini extraction) | Target Field | Example |
|---------------------------|--------------|---------|
| `sachverhalt` | `name` | "Wasser im Keller" |
| `einsatzzielAdresse` (parsed) | `street`, `number`, `city` | "Hauptstraße", "12", "7100 Neusiedl" |
| `zeitpunkt` (time only) | `alarmTime` | "14:30" |
| `meldender` + `meldenderTelefon` + `prioritaet` + `ressourcen` + `einsatzstichwort` | `description` | "Meldender: Max Mustermann (0660/1234567)\nUnwetter (Tech55) \| Prio: Normal" |
| `auftragsNummer` | `auftragsNummer` | "2024-001234" |
| (auto) | `status` | `'offen'` |
| (auto) | `created`, `creator` | Timestamp, "email-import" |

### Gemini Extraction Schema

```typescript
const EINSATZ_SCHEMA = {
  type: 'OBJECT',
  properties: {
    einsatzstichwort: { type: 'STRING', description: 'z.B. Unwetter (Tech55)' },
    einsatzzielAdresse: { type: 'STRING', description: 'Straße, Hausnummer, PLZ, Ort' },
    meldender: { type: 'STRING', description: 'Name oder ID des Meldenden' },
    meldenderTelefon: { type: 'STRING', description: 'Telefonnummer des Meldenden' },
    prioritaet: { type: 'STRING' },
    ressourcen: { type: 'STRING', description: 'z.B. FW Neusiedl am See' },
    sachverhalt: { type: 'STRING', description: 'z.B. Wasser im Keller' },
    zeitpunkt: { type: 'STRING', description: 'Datum und Uhrzeit des Einsatzes' },
    auftragsNummer: { type: 'STRING' },
  },
  required: ['einsatzstichwort', 'einsatzzielAdresse', 'meldender', 'prioritaet',
             'ressourcen', 'sachverhalt', 'zeitpunkt', 'auftragsNummer'],
};
```

## Implementation

### New Files

| File | Purpose |
|------|---------|
| `src/server/ai/vertexai.ts` | Server-side Vertex AI initialization |
| `src/components/Einsatzorte/emailImportAction.ts` | Server action: Gmail + AI + Firestore |
| `src/hooks/useEmailImport.ts` | Client hook wrapping server action |

### Modified Files

| File | Changes |
|------|---------|
| `src/components/firebase/firestore.ts` | Add `auftragsNummer` to `FirecallLocation` |
| `src/components/pages/Einsatzorte.tsx` | Add refresh button, result badge, auto-import |
| `package.json` | Add `@google-cloud/vertexai` dependency |

### Server Action Flow

```typescript
async function processUnwetterEmails(firecallId: string): Promise<EmailImportResult> {
  // 1. Validate config
  if (!process.env.GOOGLE_SERVICE_ACCOUNT || !process.env.EINSATZMAPPE_IMPERSONATION_ACCOUNT) {
    return { added: 0, skipped: 0, errors: ['Email service not configured'] };
  }

  // 2. Fetch starred emails via Gmail API
  const auth = createWorkspaceAuth(GMAIL_SCOPES);
  const gmail = google.gmail({ version: 'v1', auth });
  const messages = await fetchStarredEmails(gmail);

  // 3. Extract data from each email using Gemini
  const extractedEinsaetze = await extractFromEmails(messages);

  // 4. Query existing auftragsNummer values for deduplication
  const existingIds = await getExistingAuftragsNummern(firecallId);

  // 5. Filter duplicates and create new locations
  const newLocations = extractedEinsaetze
    .filter(e => !existingIds.has(e.auftragsNummer))
    .map(mapEinsatzToLocation);

  // 6. Batch write to Firestore
  await writeLocations(firecallId, newLocations);

  // 7. Unstar processed emails
  await unstarMessages(gmail, messages);

  // 8. Return result
  return {
    added: newLocations.length,
    skipped: extractedEinsaetze.length - newLocations.length,
    errors: []
  };
}
```

### Client Hook

```typescript
function useEmailImport(firecallId: string) {
  const [isImporting, setIsImporting] = useState(false);
  const [lastResult, setLastResult] = useState<EmailImportResult | null>(null);

  const importFromEmail = useCallback(async () => {
    setIsImporting(true);
    try {
      const result = await processUnwetterEmails(firecallId);
      setLastResult(result);
      return result;
    } finally {
      setIsImporting(false);
    }
  }, [firecallId]);

  return { importFromEmail, isImporting, lastResult };
}
```

### UI Integration

```
┌─────────────────────────────────────────────────────┐
│ Einsatzorte                    [📧 Emails prüfen]  │
│                                 ↑                   │
│                          shows "3 neu" badge        │
├─────────────────────────────────────────────────────┤
│ Table content...                                    │
└─────────────────────────────────────────────────────┘
```

- Refresh button with email icon in toolbar
- Badge/chip showing added count (auto-hides after 5s)
- Loading spinner during import
- Brief snackbar on error

## Environment Variables

| Variable | Status | Purpose |
|----------|--------|---------|
| `GOOGLE_SERVICE_ACCOUNT` | Existing | Service account JSON credentials |
| `EINSATZMAPPE_IMPERSONATION_ACCOUNT` | Existing | Gmail account to impersonate |
| `GOOGLE_CLOUD_PROJECT` | May need | Project ID for Vertex AI |

## Dependencies

Add to `package.json`:

```json
"@google-cloud/vertexai": "^1.x.x"
```

## Security Considerations

- Server action validates user authorization for the firecall before importing
- Gmail access scoped to readonly + modify (for unstarring)
- No email content stored; only extracted structured data
- Deduplication prevents duplicate imports

## Future Considerations

- Could add filtering by date range
- Could support multiple Gmail labels
- Could add preview mode before importing
