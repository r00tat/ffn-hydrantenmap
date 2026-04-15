# SYBOS Content-Script Refactoring

## Problem

`chrome-extension/src/content/sybos.ts` ist auf 849 Zeilen angewachsen. Die Datei
vermischt Widget-Infrastruktur, Firecall-Anzeige, vier feature-spezifische
Aktions-Sektionen (UI + Logik) sowie den Einstiegspunkt. Sie soll nur noch der
Haupteinsprungspunkt sein.

## Ziel

Aufteilen in logisch zusammengehörige Module. Keine Verhaltensänderung, kein
Refactoring/Deduplizieren über das reine Aufteilen hinaus.

## Aufteilung (Option A)

```
sybos.ts                          Einstiegspunkt: load-Handler, Polling-Fallbacks,
                                  ruft init() aus sybos-widget.ts
sybos-widget.ts                   el(), Widget-State, buildWidget, injectStyles,
                                  setOpen, showStatus, init (Lifecycle/Polling)
sybos-firecall.ts                 loadFirecall, showFirecall-Grundgerüst
                                  (Name/Beschreibung/Datum/Link), ruft alle
                                  Sektions-Renderer auf
sybos-section-personnel.ts        renderPersonnelSection + matchAndCheckPersonnel
sybos-section-vehicle-table.ts    renderVehicleTableSection + matchAndAssignVehicles
sybos-section-mannschaft-edit.ts  renderMannschaftEditSection + matchAndAssignMannschaftEdit
sybos-section-vehicle-list.ts     renderVehicleListSection + matchAndCheckVehicleList
```

## Design-Entscheidungen

- **`el()` bleibt in `sybos-widget.ts`** und wird exportiert. Alle Sektionen
  importieren es von dort. Keine separate `dom.ts` (nur eine Helper-Funktion).
- **Widget-State (`content`-Element) wird als Parameter übergeben.** Jeder
  Sektions-Renderer bekommt das `content`-HTMLElement als Argument, keine
  Modul-globalen Closures zwischen Dateien.
- **Typen bleiben lokal** bei den Sektionen, die sie verwenden. `MatchResult`
  und `VehicleAssignResult` tauchen nur in Sektionen auf — keine gemeinsame
  `types.ts`.
- **Kein geteilter Section-Helper.** Das würde das Muster deduplizieren, war
  aber nicht Teil der Aufgabe (YAGNI).

## Test-Strategie

Keine neuen Tests. Das Content-Script wird nicht direkt getestet (die Parser
und Matcher haben bereits Unit-Tests). Nach dem Refactoring:

- `npm run check` in `chrome-extension/` muss grün bleiben
- Build muss durchlaufen
- TSC darf keine neuen Fehler melden
