import { describe, expect, it } from 'vitest';
import { showDefectHint } from './defectHint';

describe('showDefectHint', () => {
  it('zeigt den Hinweis für eine Defektfahrt ohne Mangeldatensatz', () => {
    // Der eigentliche Zweck des Hinweises: Fahrten aus der Zeit vor der
    // Mängelverwaltung. Dort gibt es keinen Vorgang mit Status.
    expect(
      showDefectHint({
        hasDefect: true,
        openMangelCount: 0,
        lastEntryMangelId: null,
      }),
    ).toBe(true);
  });

  it('schweigt, sobald die letzte Fahrt einen Mangeldatensatz hat', () => {
    // #706: Der behobene Mangel nahm den Mängelzähler weg und legte damit den
    // Defekt-Hinweis frei — das Beheben machte den Hinweis erst sichtbar.
    expect(
      showDefectHint({
        hasDefect: true,
        openMangelCount: 0,
        lastEntryMangelId: 'm1',
      }),
    ).toBe(false);
  });

  it('tritt hinter offene Mängel zurück', () => {
    expect(
      showDefectHint({
        hasDefect: true,
        openMangelCount: 2,
        lastEntryMangelId: null,
      }),
    ).toBe(false);
  });

  it('schweigt ohne gemeldeten Defekt', () => {
    expect(showDefectHint({ hasDefect: false, openMangelCount: 0 })).toBe(false);
    expect(showDefectHint({ openMangelCount: 0 })).toBe(false);
  });

  it('nimmt den Rückfall, solange der Cache das Feld nicht kennt', () => {
    // `undefined` heißt „nie geschrieben", nicht „kein Mangeldatensatz" — sonst
    // bliebe ein Fahrzeug bis zur nächsten Mutation auf dem alten Stand.
    expect(
      showDefectHint({
        hasDefect: true,
        openMangelCount: 0,
        lastEntryHasMangel: true,
      }),
    ).toBe(false);
    expect(
      showDefectHint({
        hasDefect: true,
        openMangelCount: 0,
        lastEntryHasMangel: false,
      }),
    ).toBe(true);
  });

  it('lässt ein gecachtes null nicht auf den Rückfall zurückfallen', () => {
    // Der Server hat nachgesehen und keinen Mangel gefunden. Das geladene
    // Fenster der Fahrten kennt die letzte Fahrt womöglich gar nicht.
    expect(
      showDefectHint({
        hasDefect: true,
        openMangelCount: 0,
        lastEntryMangelId: null,
        lastEntryHasMangel: true,
      }),
    ).toBe(true);
  });

  it('zeigt den Hinweis ohne jede Angabe zum Mangeldatensatz', () => {
    // Weder Cache noch Ableitung: Ein sicherheitsrelevanter Hinweis wird im
    // Zweifel gezeigt, nicht verschwiegen.
    expect(showDefectHint({ hasDefect: true, openMangelCount: 0 })).toBe(true);
  });
});
