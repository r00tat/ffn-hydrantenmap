import { describe, expect, it } from 'vitest';
import type { FahrtenbuchEntry, FahrtenbuchVehicle } from '../../common/fahrtenbuch';
import { SHARE_ACTOR_PREFIX } from '../../common/fahrtenbuchShare';
import { buildMangelEmail, type MangelEmailArgs } from './buildMangelEmail';

const vehicle: Pick<FahrtenbuchVehicle, 'name' | 'kennzeichen' | 'counters'> = {
  name: 'MTF',
  kennzeichen: 'ND-123AB',
  counters: [
    {
      id: 'km',
      label: 'Kilometerstand',
      unit: 'km',
      mode: 'startEnd',
      changeWarning: 'decrease',
      required: true,
    },
  ],
};

const entry: FahrtenbuchEntry = {
  vehicleId: 'v1',
  vehicleName: 'MTF',
  driverName: 'Hans Muster',
  zweck: 'einsatz',
  firecallId: 'fc1',
  firecallName: 'Brandeinsatz Hauptstraße',
  ziel: 'Hauptstraße 1',
  // 08:30 Ortszeit Wien im Winter (UTC+1)
  abfahrt: '2026-02-01T07:30:00.000Z',
  ankunft: '2026-02-01T08:15:00.000Z',
  counters: { km: { start: 12000, end: 12045, diff: 45 } },
  hinweise: 'Tank nur halb voll.',
  defekt: true,
  mangel: 'Bremse hinten links schleift.',
  group: 'ffnd',
  deleted: false,
  createdAt: '2026-02-01T08:20:00.000Z',
  createdBy: 'uid-1',
  createdByName: 'Hans Muster',
  updatedAt: '2026-02-01T08:20:00.000Z',
  updatedBy: 'uid-1',
};

function args(overrides: Partial<MangelEmailArgs> = {}): MangelEmailArgs {
  return {
    entry,
    vehicle,
    groupId: 'ffnd',
    groupName: 'FF Neusiedl am See',
    appBaseUrl: 'https://karte.example.at',
    from: 'noreply@example.at',
    to: 'zeugwart@example.at',
    ...overrides,
  };
}

describe('buildMangelEmail', () => {
  it('nennt Fahrzeug und Fahrer im Betreff', () => {
    expect(buildMangelEmail(args()).subject).toBe('[Mangel] MTF — Hans Muster');
  });

  it('führt Fahrzeug mit Kennzeichen, Zeiten und Fahrt-Daten auf', () => {
    const { body } = buildMangelEmail(args());
    expect(body).toContain('MTF (ND-123AB)');
    expect(body).toContain('01.02.2026, 08:30');
    expect(body).toContain('01.02.2026, 09:15');
    expect(body).toContain('Einsatz');
    expect(body).toContain('Brandeinsatz Hauptstraße');
    expect(body).toContain('Hauptstraße 1');
    expect(body).toContain('FF Neusiedl am See');
  });

  it('nennt die Zählerstände mit Bezeichnung und Einheit', () => {
    expect(buildMangelEmail(args()).body).toContain('Kilometerstand: 12045 km');
  });

  it('übernimmt das Mangelfeld als Mangelbeschreibung', () => {
    const { body } = buildMangelEmail(args());
    expect(body).toContain('Mangel:\r\nBremse hinten links schleift.');
  });

  it('führt die allgemeinen Hinweise als eigene Zeile, nicht als Mangel', () => {
    // Beides in einem Feld war die Ursache für den Umbau: Der Zeugwart soll
    // sehen, was der Mangel ist, und was nur nebenbei notiert wurde.
    const { body } = buildMangelEmail(args());
    expect(body).toContain('Hinweis:');
    expect(body).toContain('Tank nur halb voll.');
    expect(body).not.toContain('Mangel:\r\nTank nur halb voll.');
  });

  it('lässt die Hinweis-Zeile weg, wenn nichts notiert wurde', () => {
    const { body } = buildMangelEmail(
      args({ entry: { ...entry, hinweise: undefined } }),
    );
    expect(body).not.toContain('Hinweis:');
  });

  it('verlinkt das Fahrtenbuch des Fahrzeugs', () => {
    expect(buildMangelEmail(args()).body).toContain(
      'https://karte.example.at/fahrtenbuch/ffnd/v1',
    );
  });

  it('verträgt einen Basis-URL mit Schrägstrich am Ende', () => {
    const { body } = buildMangelEmail(
      args({ appBaseUrl: 'https://karte.example.at/' }),
    );
    expect(body).toContain('https://karte.example.at/fahrtenbuch/ffnd/v1');
    expect(body).not.toContain('at//fahrtenbuch');
  });

  it('meldet einen Mangel ohne Beschreibung als solchen', () => {
    // Neue Einträge kommen nicht mehr ohne Beschreibung durch die Validierung;
    // ein Altbestand aus der Zeit vor dem eigenen Feld schon.
    const { body } = buildMangelEmail(
      args({ entry: { ...entry, mangel: undefined } }),
    );
    // Ein leerer Abschnitt läse sich wie ein Fehler beim Versand — der
    // Empfänger muss erkennen, dass nichts dazu erfasst wurde.
    expect(body).toContain('ohne Beschreibung');
  });

  it('setzt keine leeren Klammern, wenn kein Kennzeichen gepflegt ist', () => {
    const { body } = buildMangelEmail(
      args({ vehicle: { ...vehicle, kennzeichen: undefined } }),
    );
    expect(body).toContain('Fahrzeug');
    expect(body).not.toContain('MTF (');
  });

  it('weist eine Erfassung über den Freigabelink als solche aus', () => {
    const { body } = buildMangelEmail(
      args({
        entry: { ...entry, createdBy: `${SHARE_ACTOR_PREFIX}link-1` },
      }),
    );
    expect(body).toContain('Freigabelink');
    // Die Link-ID ist eine interne Kennung und hat in der Mail nichts zu suchen.
    expect(body).not.toContain('link-1');
  });

  it('lässt die Einsatz-Zeile weg, wenn die Fahrt kein Einsatz war', () => {
    const { body } = buildMangelEmail(
      args({
        entry: {
          ...entry,
          zweck: 'uebung',
          firecallId: undefined,
          firecallName: undefined,
        },
      }),
    );
    expect(body).toContain('Übung');
    expect(body).not.toContain('Brandeinsatz');
  });

  it('setzt To und Cc in die Kopfzeilen', () => {
    const { raw } = buildMangelEmail(
      args({ cc: ['kommandant@example.at', 'fahrmeister@example.at'] }),
    );
    expect(raw).toContain('To: zeugwart@example.at');
    expect(raw).toContain(
      'Cc: kommandant@example.at, fahrmeister@example.at',
    );
    expect(raw).toContain('From: noreply@example.at');
  });

  it('lässt die Cc-Kopfzeile ohne Empfänger weg', () => {
    expect(buildMangelEmail(args()).raw).not.toContain('Cc:');
  });

  it('kodiert den Betreff, damit Umlaute nicht als Rohbytes gehen', () => {
    const { raw } = buildMangelEmail(
      args({ vehicle: { ...vehicle, name: 'Löschfahrzeug' } }),
    );
    expect(raw).toContain('Subject: =?UTF-8?B?');
    expect(raw).not.toContain('Subject: [Mangel] Löschfahrzeug');
  });

  it('verträgt einen Eintrag ohne Zählerstände und ohne Ziel', () => {
    const { body } = buildMangelEmail(
      args({ entry: { ...entry, counters: {}, ziel: '' } }),
    );
    expect(body).toContain('MTF');
    expect(body).not.toContain('undefined');
    expect(body).not.toContain('NaN');
  });
});
