# Design: Attachment Downloads & Print-Seite

## Zusammenfassung

Attachments sollen direkt heruntergeladen werden können (Einzel-Download per Button + "Alle herunterladen"). Einsatz-Attachments sollen auf der Print-Seite sichtbar sein, wobei Bilder groß dargestellt werden.

## 1. Download-Button pro Attachment (FileDisplay)

`FileDisplay.tsx` bekommt einen Download-IconButton (MUI `Download`-Icon). Download via `getBlob()` + `downloadBlob()` aus `download.tsx` für erzwungenen Download (nicht nur im neuen Tab öffnen).

## 2. "Alle herunterladen"-Button

Neuer `DownloadAllButton`-Component:
- Download-Icon-Button, der parallel `getBlob()` für alle Attachments aufruft
- Jede Datei wird einzeln via `downloadBlob()` getriggert (kein ZIP)
- Eingesetzt in:
  - **EinsatzDetails** (Einsatz-Attachments)
  - **FirecallItemFields** (Marker-Attachments im Edit-Dialog)
  - **FirecallItemMarker** (Marker-Popup/Body)

## 3. Print-Seite: Attachments anzeigen

Neuer Abschnitt "Anhänge" am Ende der PrintPage:
- **Bilder**: Groß angezeigt (`max-width: 100%`, volle Seitenbreite) für Druckausgabe
- **Andere Dateien**: Als Liste mit Dateinamen
- Bild-URLs via `getDownloadURL()` geladen

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `src/components/inputs/FileDisplay.tsx` | Download-IconButton hinzufügen |
| `src/components/inputs/DownloadAllButton.tsx` | **Neu** - "Alle herunterladen"-Button |
| `src/components/pages/EinsatzDetails.tsx` | DownloadAllButton bei Einsatz-Attachments |
| `src/components/FirecallItems/FirecallItemFields.tsx` | DownloadAllButton bei Marker-Attachments |
| `src/components/FirecallItems/elements/FirecallItemMarker.tsx` | DownloadAllButton im Popup/Body |
| `src/components/pages/PrintPage.tsx` | Neuer Abschnitt für Attachments mit großen Bildern |

## Keine neuen Dependencies

`getBlob()` aus Firebase Storage + `downloadBlob()` aus `download.tsx` reichen aus.
