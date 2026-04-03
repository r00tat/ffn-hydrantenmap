# Einsatz-Attachments Design

## Zusammenfassung

Dateien (Fotos, Dokumente) sollen direkt einem Einsatz zugeordnet werden können - sowohl über den "+" Button auf der Karte als auch im EinsatzDialog.

## Datenmodell

`Firecall`-Interface bekommt `attachments?: string[]` (gs:// URIs).
Speicherpfad: `/firecall/{firecallId}/files/{uuid}-{filename}` (identisch mit Marker-Attachments).

## Komponenten

### 1. Upload über "+" Button (Karte)

Neuer Pseudo-Typ "Foto / Datei" im `FirecallItemDialog` Typ-Dropdown:
- Zeigt nur `FileUploader` (kein Name, Position, Ebene)
- Titel: "Datei zum Einsatz hochladen"
- Schreibt URIs direkt auf das Firecall-Dokument (`attachments`-Array)
- Dialog-Close gibt `undefined` zurück (kein Marker wird platziert)

### 2. Upload/Anzeige im EinsatzDialog

Unterhalb der bestehenden Felder:
- `FileUploader` + `FileDisplay` pro Anhang
- Nur sichtbar wenn Einsatz bereits gespeichert (`einsatz.id`)

### 3. Anzeige in EinsatzCard

Thumbnails/Links unter der Beschreibung (read-only via `FileDisplay`).
