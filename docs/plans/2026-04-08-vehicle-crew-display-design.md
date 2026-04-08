# Vehicle Crew Display Design

## Zusammenfassung

Besatzungszuordnungen (CrewAssignments) sollen am Fahrzeug sichtbar und bearbeitbar sein:
1. Im **Map-Popup** als Liste unter den Fahrzeug-Infos
2. Im **FirecallItemDialog** als editierbarer Abschnitt mit Funktion- und Fahrzeug-Dropdowns

## Architektur

### FirecallProvider erweitern

Der `FirecallContextType` wird um Crew-Daten erweitert:

```typescript
export interface FirecallContextType {
  firecall: Firecall | undefined;
  setFirecallId?: Dispatch<SetStateAction<string | undefined>>;
  crewAssignments: CrewAssignment[];
  assignVehicle: (id: string, vehicleId: string | null, vehicleName: string) => Promise<void>;
  updateFunktion: (id: string, funktion: CrewFunktion) => Promise<void>;
}
```

- Crew wird einmal per `onSnapshot` auf `call/{firecallId}/crew` geladen
- Zentral gecached, alle Komponenten greifen auf den Context zu

### Neuer Hook: `useCrewForVehicle(vehicleId)`

```typescript
export const useCrewForVehicle = (vehicleId: string): CrewAssignment[] => {
  const { crewAssignments } = useContext(FirecallContext);
  return useMemo(
    () => crewAssignments.filter((c) => c.vehicleId === vehicleId),
    [crewAssignments, vehicleId]
  );
};
```

### Map-Popup

`FirecallVehicle.popupFn()` gibt eine React-Komponente zurück die den Context nutzt:

```
TLF 4000 FF Neusiedl
Besatzung: 1:5
Alarmierung: 14:32
---
Mustermann (GK)
Meier (MA)
Huber
Schmidt
Weber (ATS)
```

Format: `Name (Abkürzung)` — Funktion wird nur angezeigt wenn != Feuerwehrmann.

### FirecallItemDialog — Besatzung-Abschnitt

Neuer Abschnitt im Dialog, nur bei `type === 'vehicle'`:

- Tabelle mit Spalten: Name | Funktion | Fahrzeug
- Funktion: Dropdown mit den 6 CrewFunktion-Werten
- Fahrzeug: Dropdown mit allen Fahrzeugen + "Verfügbar" (null)
- Änderungen werden sofort in die Crew-Collection geschrieben

## Dateien

| Datei | Änderung |
|-------|----------|
| `src/hooks/useFirecall.ts` | Context-Type um Crew-Felder erweitern |
| `src/components/providers/FirecallProvider.tsx` | Crew per onSnapshot laden und bereitstellen |
| `src/hooks/useCrewAssignments.ts` | Bestehende Mutations-Logik für Provider nutzbar machen |
| `src/components/FirecallItems/elements/FirecallVehicle.tsx` | popupFn mit VehicleCrewPopup-Komponente |
| `src/components/FirecallItems/FirecallItemDialog.tsx` | Besatzung-Abschnitt einbauen |
| `src/components/FirecallItems/VehicleCrewSection.tsx` | Neue Komponente für Crew-Anzeige/Edit |
