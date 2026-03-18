# Fahrzeuge-Seite: Taktische Einheiten & Übersichtstabelle

## Ziel

Die Fahrzeuge-Seite um taktische Einheiten (Gruppe, Zug, Bereitschaft, etc.) erweitern und eine Übersichtstabelle mit Stärkemeldung (Mann, ATS) anzeigen.

## Neuer FirecallItem-Typ: `tacticalUnit`

### Interface

```typescript
interface TacticalUnit extends FirecallItem {
  type: 'tacticalUnit';
  unitType: 'einheit' | 'trupp' | 'gruppe' | 'zug' |
            'bereitschaft' | 'abschnitt' | 'bezirk' | 'lfv' | 'oebfv';
  fw?: string;           // Feuerwehr / übergeordnete Einheitsbezeichnung
  mann?: number;          // Mannschaftsstärke
  fuehrung?: string;      // Einheitsführer (Name)
  ats?: number;           // ATS-Träger
  alarmierung?: string;   // Alarmierungszeitpunkt
  eintreffen?: string;    // Eintreffzeitpunkt
  abruecken?: string;     // Abrückzeitpunkt
}
```

### Implementierung

- Neue Klasse `FirecallTacticalUnit extends FirecallItemBase` (analog zu `FirecallVehicle`)
- Registrierung in `fcItemClasses` als `tacticalUnit`
- Icon: Wiederverwendung der bestehenden Icons aus `/icons/taktische_zeichen/Formation_von_Kraeften/` basierend auf `unitType`
- Auf der Karte platzierbar (lat/lng) wie andere FirecallItems

### unitType-zu-Icon Mapping

| unitType | Icon |
|---|---|
| einheit | Formation_von_Kraeften/Einheit.png |
| trupp | Formation_von_Kraeften/Trupp.png |
| gruppe | Formation_von_Kraeften/Gruppe.png |
| zug | Formation_von_Kraeften/Zug.png |
| bereitschaft | Formation_von_Kraeften/Bereitschaft.png |
| abschnitt | Formation_von_Kraeften/Abschnitt.png |
| bezirk | Formation_von_Kraeften/Bezirk.png |
| lfv | Formation_von_Kraeften/LFV.png |
| oebfv | Formation_von_Kraeften/OEBFV.png |

## Fahrzeuge-Seite Layout

### Oben: Flache Übersichtstabelle

MUI-Table mit allen Fahrzeugen und taktischen Einheiten (aus allen Layern):

| Bezeichnung | FW | Typ | Stärke | ATS | Alarmierung | Eintreffen | Abrücken |
|---|---|---|---|---|---|---|---|
| TLF-A 2000 | FF NaS | Fzg | 1:5 | 2 | 14:30 | 14:45 | - |
| KLF | FF NaS | Fzg | 1:3 | 0 | 14:32 | 14:48 | - |
| 1. Gruppe | FF NaS | Gruppe | 8 | 4 | 14:30 | 14:50 | - |
| **Gesamt** | | **3 Einheiten** | **22 Mann** | **8 ATS** | | | |

- Fahrzeuge: Stärke = `1:besatzung` (Gesamt = besatzung + 1)
- Taktische Einheiten: Stärke = `mann` (direkte Angabe)
- Summenzeile: Gesamtanzahl Einheiten, Gesamtmannschaft, Gesamt-ATS

### Darunter: Layer-Gruppierung (bestehend)

Bestehende Darstellung mit aufklappbaren LayerGroups und CompactItemCards bleibt erhalten. Taktische Einheiten erscheinen dort ebenfalls als Cards innerhalb ihres zugeordneten Layers.

## Stärke-Berechnung

```
Fahrzeug-Mann = besatzung + 1  (1:X Format, +1 für Fahrer)
Einheit-Mann  = mann            (direkte Angabe)
Gesamt-Mann   = Σ(Fahrzeug-Mann) + Σ(Einheit-Mann)
Gesamt-ATS    = Σ(Fahrzeug-ATS) + Σ(Einheit-ATS)
```

## Langfristige Perspektive

Der neue `tacticalUnit`-Typ soll in Zukunft die Marker mit taktischen Zeichen (Formation_von_Kraeften) ersetzen, da er strukturierte Felder (Stärke, Führung, Zeiten) bietet.
