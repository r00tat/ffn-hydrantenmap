import { describe, expect, it } from 'vitest';
import { buildWeeklyReportEmail } from './buildWeeklyReportEmail';
import type { WeeklyReportModel } from './weeklyReportModel';
import { resolveReportPeriod } from './weeklyReportPeriod';

const period = resolveReportPeriod({ year: 2026, week: 32 });

function model(over: Partial<WeeklyReportModel> = {}): WeeklyReportModel {
  return {
    groupId: 'ffnd',
    groupName: 'FF Neusiedl am See',
    period,
    vehicles: [
      {
        vehicleId: 'v1',
        heading: 'KDTFA (ND-1)',
        rows: [
          {
            date: '05.08.2026',
            timeRange: '19:00 - 19:34',
            driver: 'Lukas Fürst',
            zweck: 'Einsatz',
            ziel: 'B1 - Flurbrand',
            counters: [
              {
                label: 'Kilometerstand',
                unit: 'km',
                start: 17552,
                end: 17557,
                diff: 5,
                estimated: false,
              },
            ],
            fuel: [],
            defekt: false,
          },
        ],
        totals: [{ label: 'Kilometerstand', unit: 'km', value: 5 }],
        warnings: [],
      },
    ],
    openMangel: [],
    entryCount: 1,
    hasWarnings: false,
    ...over,
  };
}

function build(over: Partial<WeeklyReportModel> = {}, cc?: string[]) {
  return buildWeeklyReportEmail({
    model: model(over),
    appBaseUrl: 'https://karte.example.at',
    from: 'noreply@example.at',
    to: 'zeugwart@example.at',
    cc,
  });
}

/** Der base64-Rumpf eines Teils, noch unkodiert — für die Zeilenlängen. */
function partBody(raw: string, contentType: string): string {
  const part = raw
    .split(/--boundary_[^\r\n]+/)
    .find((chunk) => chunk.includes(contentType));
  if (!part) throw new Error(`Teil ${contentType} fehlt`);
  return part.split('\r\n\r\n').slice(1).join('\r\n\r\n').trim();
}

function decodePart(raw: string, contentType: string): string {
  return Buffer.from(partBody(raw, contentType), 'base64').toString('utf8');
}

describe('buildWeeklyReportEmail', () => {
  it('setzt Betreff mit Kalenderwoche und Gruppe', () => {
    expect(build().subject).toBe(
      'Fahrtenbuch-Wochenbericht KW32 — FF Neusiedl am See',
    );
  });

  it('lässt die Gruppe im Betreff weg, wenn kein Name bekannt ist', () => {
    expect(build({ groupName: undefined }).subject).toBe(
      'Fahrtenbuch-Wochenbericht KW32',
    );
  });

  it('weist eine Woche ohne Fahrten im Betreff aus', () => {
    // Ein ausgefallener Job muss vom stillen Nichts unterscheidbar bleiben.
    expect(build({ entryCount: 0 }).subject).toContain('(keine Fahrten)');
  });

  it('kodiert den Betreff RFC-2047-base64', () => {
    const { raw, subject } = build();
    expect(raw).toContain(
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    );
  });

  it('setzt From und To in die Kopfzeilen', () => {
    const raw = build().raw;
    expect(raw).toContain('From: noreply@example.at');
    expect(raw).toContain('To: zeugwart@example.at');
  });

  it('setzt Cc nur, wenn weitere Empfänger da sind', () => {
    expect(build({}, []).raw).not.toContain('Cc:');
    expect(build({}, ['kommandant@example.at']).raw).toContain(
      'Cc: kommandant@example.at',
    );
  });

  it('baut ein multipart/alternative mit beiden Teilen', () => {
    const raw = build().raw;
    expect(raw).toContain(
      'Content-Type: multipart/alternative; boundary="boundary_',
    );
    expect(raw).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(raw).toContain('Content-Type: text/html; charset="UTF-8"');

    // Die Boundary aus der Kopfzeile lesen und prüfen, dass genau sie beide
    // Teile trennt und die Nachricht abschließt. Ein `endsWith('--')` allein
    // wäre von jeder Zeichenkette mit zwei Bindestrichen am Ende erfüllt und
    // würde eine abweichende Schluss-Boundary nicht bemerken.
    const boundary = raw.match(/boundary="([^"]+)"/)?.[1];
    expect(boundary).toMatch(/^boundary_/);
    expect(raw.split(`--${boundary}\r\n`)).toHaveLength(3);
    expect(raw.trimEnd().endsWith(`--${boundary}--`)).toBe(true);
  });

  it('bricht die base64-Teile auf höchstens 76 Zeichen um', () => {
    // RFC 2045 §6.8 verlangt es, und eine Zeile über 998 Oktetten ist keine
    // gültige SMTP-Zeile — der HTML-Teil des Berichts wird schnell fünfstellig
    // lang.
    const raw = build().raw;
    for (const contentType of ['text/plain', 'text/html']) {
      const lines = partBody(raw, contentType).split('\r\n');
      expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(
        76,
      );
      // Sonst prüfte der Test nur, dass die Nachricht kurz ist.
      expect(lines.length).toBeGreaterThan(1);
    }
  });

  it('nennt Zeitraum, Fahrzeug und Fahrt in beiden Fassungen', () => {
    const { raw } = build();
    for (const text of [
      decodePart(raw, 'text/plain'),
      decodePart(raw, 'text/html'),
    ]) {
      expect(text).toContain('03.08.2026');
      expect(text).toContain('09.08.2026');
      expect(text).toContain('KDTFA (ND-1)');
      expect(text).toContain('Lukas Fürst');
      expect(text).toContain('17552');
    }
  });

  it('nennt die Wochensumme', () => {
    expect(decodePart(build().raw, 'text/plain')).toContain('5 km');
  });

  it('weist ein Fahrzeug ohne Fahrten aus', () => {
    const over = {
      vehicles: [
        { vehicleId: 'v2', heading: 'VF-KAT', rows: [], totals: [], warnings: [] },
      ],
      entryCount: 0,
    };
    const { raw } = build(over);
    expect(decodePart(raw, 'text/plain')).toContain(
      'Keine Fahrten in diesem Zeitraum.',
    );
    expect(decodePart(raw, 'text/html')).toContain(
      'Keine Fahrten in diesem Zeitraum.',
    );
  });

  it('nennt jede Warnung in beiden Fassungen', () => {
    const over: Partial<WeeklyReportModel> = {
      hasWarnings: true,
      vehicles: [
        {
          vehicleId: 'v1',
          heading: 'KDTFA (ND-1)',
          rows: [],
          totals: [],
          warnings: [
            {
              kind: 'gap',
              counterLabel: 'Kilometerstand',
              unit: 'km',
              previousEnd: 17550,
              nextStart: 17552,
              date: '05.08.2026',
            },
            {
              kind: 'overlap',
              counterLabel: 'Kilometerstand',
              unit: 'km',
              previousEnd: 17560,
              nextStart: 17552,
              date: '06.08.2026',
            },
            {
              kind: 'decrease',
              counterLabel: 'Kilometerstand',
              unit: 'km',
              start: 17557,
              end: 17552,
              date: '07.08.2026',
            },
            { kind: 'missing', counterLabel: 'Kilometerstand', date: '08.08.2026' },
          ],
        },
      ],
    };
    const { raw } = build(over);
    for (const text of [
      decodePart(raw, 'text/plain'),
      decodePart(raw, 'text/html'),
    ]) {
      expect(text).toContain('17550');
      expect(text).toContain('17560');
      expect(text).toContain('08.08.2026');
    }
  });

  it('listet die offenen Mängel', () => {
    const { raw } = build({
      openMangel: [
        {
          vehicleName: 'KDTFA',
          status: 'open',
          statusLabel: 'Offen',
          description: 'Blinker rechts defekt',
          reportedAt: '05.08.2026',
          reportedByName: 'Lukas Fürst',
        },
      ],
    });
    for (const text of [
      decodePart(raw, 'text/plain'),
      decodePart(raw, 'text/html'),
    ]) {
      expect(text).toContain('Blinker rechts defekt');
      expect(text).toContain('Offen');
    }
  });

  it('verlinkt das Fahrtenbuch der Gruppe', () => {
    const { raw } = build();
    expect(decodePart(raw, 'text/plain')).toContain(
      'https://karte.example.at/fahrtenbuch/ffnd',
    );
    expect(decodePart(raw, 'text/html')).toContain(
      'https://karte.example.at/fahrtenbuch/ffnd',
    );
  });

  it('bringt die Styles inline und keinen style-Block', () => {
    // Gmail und Outlook verwerfen <style>-Blöcke.
    const html = decodePart(build().raw, 'text/html');
    expect(html).toContain('style="');
    expect(html).not.toContain('<style');
  });

  it('füllt leere Tabellenzellen mit einem Gedankenstrich', () => {
    // Outlook rendert die Rahmen einer leeren Zelle nicht — die Zeile bekäme
    // ein Loch. Die Beispielfahrt hat weder Betankung noch Notiz.
    const html = decodePart(build().raw, 'text/html');
    expect(html).toContain('>–</td>');
    expect(html).not.toContain('></td>');
  });

  it('maskiert HTML-Sonderzeichen in den Daten', () => {
    const html = decodePart(
      build({ groupName: 'FF <Test> & Co' }).raw,
      'text/html',
    );
    expect(html).toContain('FF &lt;Test&gt; &amp; Co');
    expect(html).not.toContain('<Test>');
  });

  it('kennzeichnet abgeleitete Endstände mit ca.', () => {
    const rows = model().vehicles[0].rows;
    rows[0].counters[0].estimated = true;
    const { raw } = build({
      vehicles: [{ ...model().vehicles[0], rows }],
    });
    expect(decodePart(raw, 'text/plain')).toContain('ca. 17557');
  });
});
