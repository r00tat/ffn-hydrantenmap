// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  PA_SAETZE,
  type AtemschutzTrupp,
  type Druckabfrage,
} from '../../common/atemschutz';
import { renderWithIntl } from '../../test-utils/intlRender';
import UeberwachungCard from './UeberwachungCard';

const ABMARSCH = '2026-09-02T10:00:00.000Z';

function nachAbmarsch(minuten: number): Date {
  return new Date(new Date(ABMARSCH).getTime() + minuten * 60_000);
}

function abfrage(minuten: number, druck: number, amZiel = false): Druckabfrage {
  return {
    zeitpunkt: nachAbmarsch(minuten).toISOString(),
    druck,
    ...(amZiel ? { amZiel: true } : {}),
  };
}

function trupp(over: Partial<AtemschutzTrupp> = {}): AtemschutzTrupp {
  return {
    id: 't1',
    truppKey: 'k1',
    laufendeNummer: 1,
    truppName: 'Trupp 1',
    feuerwehr: 'Neusiedl am See',
    mitglieder: ['Anna Beispiel', 'Bernd Beispiel'],
    status: 'imEinsatz',
    bereitSeit: ABMARSCH,
    abmarschZeit: ABMARSCH,
    druckAbmarsch: 300,
    paTyp: 'standard300',
    ueberwachungSeit: ABMARSCH,
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...over,
  };
}

interface RenderOptionen {
  jetzt?: Date;
  canWrite?: boolean;
  istAktuell?: boolean;
  onErneutEinsatz?: () => void;
  onAnSammelplatz?: () => void;
}

function render(
  t: AtemschutzTrupp,
  {
    jetzt = nachAbmarsch(1),
    canWrite = true,
    istAktuell = true,
    onErneutEinsatz = vi.fn(),
    onAnSammelplatz = vi.fn(),
  }: RenderOptionen = {},
) {
  renderWithIntl(
    <UeberwachungCard
      trupp={t}
      jetzt={jetzt}
      vorgabe={PA_SAETZE.standard300}
      canWrite={canWrite}
      istAktuell={istAktuell}
      onUebernehmen={vi.fn()}
      onBearbeiten={vi.fn()}
      onDruckabfrage={vi.fn()}
      onGeraete={vi.fn()}
      onEinsatzauftrag={vi.fn()}
      onBereitZumAbmarsch={vi.fn()}
      onRueckkehr={vi.fn()}
      onErneutEinsatz={onErneutEinsatz}
      onAnSammelplatz={onAnSammelplatz}
    />,
  );
}

describe('UeberwachungCard', () => {
  it('zeigt im Einsatz Druck, Rückzugszeit und die Aktionen', () => {
    render(trupp());
    expect(screen.getByText('Vermuteter Druck')).toBeInTheDocument();
    expect(screen.getByText('Rückzug um')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Druckabfrage / Status' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rückkehr' })).toBeInTheDocument();
  });

  it('weist eine fehlende Ankunftsmeldung aus', () => {
    render(trupp());
    expect(screen.getByText('Keine Ankunftsmeldung')).toBeInTheDocument();
  });

  it('nennt nach der Ankunftsmeldung den Rückmarschdruck als Grund', () => {
    // Abmarsch 300, am Ziel 200 bar → doppelter Vormarschdruckabfall 200 bar,
    // deutlich über der Restdruckwarnung.
    render(trupp({ abfragen: [abfrage(5, 200, true)] }), { jetzt: nachAbmarsch(6) });
    expect(
      screen.getByText('Rückmarschdruck 200 bar (doppelter Vormarschdruckabfall)'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Keine Ankunftsmeldung')).toBeNull();
  });

  it('nennt die Restdruckwarnung, wenn der Vormarsch kurz war', () => {
    // 20 bar Abfall → doppelt 40 bar, also unter der Warnschwelle.
    render(trupp({ abfragen: [abfrage(2, 280, true)] }), { jetzt: nachAbmarsch(3) });
    expect(
      screen.getByText('Restdruckwarnung 55 bar'),
    ).toBeInTheDocument();
  });

  it('weist einen nicht abgelesenen Abmarschdruck aus', () => {
    render(trupp({ druckAbmarsch: undefined }));
    expect(screen.getByText('Abmarschdruck nicht abgelesen')).toBeInTheDocument();
  });

  it('warnt nach einem Drittel ohne Meldung', () => {
    // Erwartete Dauer 25,8 min, das erste Drittel also bei 8,6 min.
    render(trupp(), { jetzt: nachAbmarsch(9) });
    expect(
      screen.getByText(/Ein Drittel der Einsatzzeit ohne Meldung/),
    ).toBeInTheDocument();
  });

  it('warnt nicht, wenn der Trupp gemeldet hat', () => {
    render(trupp({ abfragen: [abfrage(8, 250)] }), { jetzt: nachAbmarsch(9) });
    expect(
      screen.queryByText(/Ein Drittel der Einsatzzeit ohne Meldung/),
    ).toBeNull();
  });

  it('warnt vor dem Rückzugszeitpunkt als Vorwarnung', () => {
    // Ohne Ankunftsmeldung gilt die Restdruckwarnung bei 26,5 min. Bei 26 min
    // ist die Warnung fällig (Vorlauf 1 min), der Zeitpunkt aber nicht erreicht.
    render(trupp(), { jetzt: nachAbmarsch(26) });
    expect(screen.getByText(/Rückzugszeitpunkt in 1 min/)).toBeInTheDocument();
    expect(screen.queryByText(/Rückzugszeitpunkt erreicht/)).toBeNull();
  });

  it('fordert ab dem Rückzugszeitpunkt zum Rückzug auf', () => {
    render(trupp(), { jetzt: nachAbmarsch(30) });
    expect(
      screen.getByText(/Rückzugszeitpunkt erreicht \(seit 4 min\)/),
    ).toBeInTheDocument();
  });

  it('nennt einen noch nicht belastbaren Verbrauch vorläufig', () => {
    // Zwei Minuten Messfenster liegen unter dem Mindestfenster von drei:
    // 300 → 240 bar sind 30 bar/min, also 162 l/min.
    render(trupp({ abfragen: [abfrage(2, 240, true)] }), {
      jetzt: nachAbmarsch(3),
    });
    expect(screen.getByText(/vorläufig 162 l\/min/)).toBeInTheDocument();
  });

  it('bietet einem noch nicht übernommenen Trupp die Übernahme an', () => {
    render(trupp({ ueberwachungSeit: undefined }));
    expect(screen.getByText('Zeitkontrolle nicht übernommen')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Trupp übernehmen' }),
    ).toBeInTheDocument();
  });

  it('bietet in Bereitschaft an, den Trupp in den Einsatz zu schicken', () => {
    render(trupp({ status: 'bereit', abmarschZeit: undefined }));
    expect(
      screen.getByRole('button', { name: 'In den Einsatz schicken' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Vermuteter Druck')).toBeNull();
  });

  it('blendet ohne Schreibrecht alle Aktionen aus', () => {
    render(trupp(), { canWrite: false });
    expect(screen.queryByRole('button', { name: 'Druckabfrage / Status' })).toBeNull();
  });

  it('bietet an einer älteren Bereitstellung keine Aktion an', () => {
    render(trupp(), { istAktuell: false });
    expect(screen.queryByRole('button', { name: 'Druckabfrage / Status' })).toBeNull();
  });

  it('zeigt den Druckverlauf als eigene Zeile je Wert', () => {
    render(
      trupp({
        abfragen: [abfrage(5, 200, true), abfrage(12, 150)],
        status: 'zurueck',
        rueckkehrZeit: nachAbmarsch(20).toISOString(),
        druckRueckkehr: 70,
      }),
      { jetzt: nachAbmarsch(25) },
    );
    expect(screen.getByText('Druckverlauf')).toBeInTheDocument();
    // Jeder Wert steht für sich — nicht als Kette mit Pfeilen in einer Zeile.
    expect(screen.getByText('300 bar')).toBeInTheDocument();
    expect(screen.getByText('200 bar')).toBeInTheDocument();
    expect(screen.getByText('150 bar')).toBeInTheDocument();
    expect(screen.getByText('70 bar')).toBeInTheDocument();
    // „Ankunft" steht zweimal auf der Karte: als Beschriftung dieser Zeile und
    // als senkrechte Marke in der Kurve darunter. Gemeint ist hier die Zeile,
    // also der Absatz — die Marke ist ein `tspan` im SVG.
    expect(
      screen.getAllByText('Ankunft').some((n) => n.tagName === 'P'),
    ).toBe(true);
    // Die Uhrzeiten stehen in einer eigenen Spalte, also auch als eigener Text.
    expect(screen.getAllByText(/^\d{2}:\d{2}$/).length).toBeGreaterThanOrEqual(
      4,
    );
  });

  it('bietet einem zurückgekehrten Trupp den erneuten Einsatz an', () => {
    const onErneutEinsatz = vi.fn();
    render(
      trupp({
        status: 'zurueck',
        rueckkehrZeit: nachAbmarsch(30).toISOString(),
        druckRueckkehr: 70,
      }),
      { jetzt: nachAbmarsch(40), onErneutEinsatz },
    );
    const button = screen.getByRole('button', {
      name: 'Erneut in den Einsatz schicken',
    });
    fireEvent.click(button);
    expect(onErneutEinsatz).toHaveBeenCalled();
  });

  it('übergibt einen zurückgekehrten Trupp an den Sammelplatz', () => {
    const onAnSammelplatz = vi.fn();
    render(
      trupp({
        status: 'zurueck',
        rueckkehrZeit: nachAbmarsch(30).toISOString(),
        druckRueckkehr: 70,
      }),
      { jetzt: nachAbmarsch(40), onAnSammelplatz },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'An den Sammelplatz übergeben' }),
    );
    expect(onAnSammelplatz).toHaveBeenCalled();
  });

  it('bietet nach der Übergabe keine Entsendung mehr an', () => {
    render(
      trupp({
        status: 'zurueck',
        rueckkehrZeit: nachAbmarsch(30).toISOString(),
        druckRueckkehr: 70,
        ueberwachungBis: nachAbmarsch(35).toISOString(),
      }),
      { jetzt: nachAbmarsch(40) },
    );
    expect(
      screen.queryByRole('button', {
        name: 'Erneut in den Einsatz schicken',
      }),
    ).toBeNull();
    expect(
      screen.getByText(/An den Sammelplatz übergeben \(\d{2}:\d{2}\)/),
    ).toBeInTheDocument();
  });

  it('nennt den Abmarsch als Grundlage der Schätzung', () => {
    render(trupp({ abfragen: [abfrage(5, 200, true)] }), {
      jetzt: nachAbmarsch(10),
    });
    // Zweimal „Abmarsch": als Überschrift der Kennzahl und als Zeile im
    // Druckverlauf.
    expect(screen.getAllByText('Abmarsch')).toHaveLength(2);
    expect(screen.getByText('seit 10 min')).toBeInTheDocument();
    // Fortgeschrieben wird ab dem jüngsten Messwert, nicht ab dem Abmarsch.
    expect(
      screen.getByText(/fortgeschrieben ab .* · 200 bar/),
    ).toBeInTheDocument();
  });

  it('nennt die taktische Einheit in der Detailzeile', () => {
    render(trupp({ entsendetAn: 'RLFA-ND' }));
    expect(screen.getByText(/Einheit: RLFA-ND/)).toBeInTheDocument();
  });

  it('nennt den Sammelplatz, solange den Trupp niemand übernommen hat', () => {
    render(trupp({ status: 'bereit', ueberwachungSeit: undefined }));
    expect(screen.getByText(/Einheit: ASSP/)).toBeInTheDocument();
  });

  it('nennt eine fehlende Zuordnung ausdrücklich', () => {
    // Ein überwachter Trupp ohne Einheit ist eine Lücke im Protokoll — sie
    // soll auffallen und nicht als leere Stelle durchgehen.
    render(trupp());
    expect(screen.getByText(/Einheit: Nicht zugeordnet/)).toBeInTheDocument();
  });

  it('zeigt die Geräte am Trupp nach Träger gruppiert', () => {
    render(
      trupp({
        truppGeraete: [
          { typ: 'maske', bezeichnung: 'Maske FPS', person: 'Bert Beispiel' },
          {
            typ: 'flasche',
            bezeichnung: 'CFK 6,8 l',
            kennung: '2.16.19',
            person: 'Anna Beispiel',
          },
          { typ: 'flasche', bezeichnung: 'Stahl 6 l', kennung: '2.16.20' },
        ],
      }),
    );
    // Eine Zeile je Träger, alphabetisch, die nicht zugeordnete Ausrüstung
    // zuletzt.
    const zeilen = screen
      .getAllByText(/CFK 6,8 l|Maske FPS|Stahl 6 l/)
      .map((n) => n.textContent);
    expect(zeilen).toEqual([
      'Anna Beispiel: 2.16.19 · CFK 6,8 l',
      'Bert Beispiel: Maske FPS',
      'nicht zugeordnet: 2.16.20 · Stahl 6 l',
    ]);
  });
});

describe('UeberwachungCard mit zugeteilten Trupps', () => {
  it('bietet dem zugeteilten Trupp den Einsatzauftrag an', () => {
    render(trupp({ status: 'zugeteilt', entsendetAn: 'LFA' }));
    expect(
      screen.getByRole('button', { name: 'In den Einsatz schicken' }),
    ).toBeInTheDocument();
    // Er ist noch nicht unter Atemschutz — es gibt nichts abzufragen.
    expect(screen.queryByRole('button', { name: /Druckabfrage/ })).toBeNull();
  });

  it('zeigt den Auftrag neben dem Einsatzziel', () => {
    render(
      trupp({
        status: 'imEinsatz',
        auftrag: 'Menschenrettung',
        einsatzziel: 'Keller Stiegenhaus links',
      }),
    );
    expect(screen.getByText(/Menschenrettung/)).toBeInTheDocument();
    expect(screen.getByText(/Keller Stiegenhaus links/)).toBeInTheDocument();
  });

  it('bietet dem zurückgekehrten Trupp „bereit zum Abmarsch" an', () => {
    render(trupp({ status: 'zurueck' }));
    expect(
      screen.getByRole('button', { name: 'Bereit zum Abmarsch' }),
    ).toBeInTheDocument();
  });

  it('beschriftet eine Statusmeldung ohne Druck mit ihrer Bemerkung', () => {
    render(
      trupp({
        status: 'imEinsatz',
        abfragen: [
          {
            zeitpunkt: '2026-09-03T08:12:00.000Z',
            bemerkung: 'starke Verrauchung',
          },
        ],
      }),
    );
    expect(screen.getByText('starke Verrauchung')).toBeInTheDocument();
  });
});

describe('UeberwachungCard: Ankunft und Rückzug sind Ereignisse', () => {
  it('beschriftet nur die erste Ankunftsmeldung mit „Ankunft"', () => {
    // Bestandsdaten tragen `amZiel` an jeder Folgeabfrage — maßgeblich ist die
    // erste, und nur die soll im Verlauf so heißen.
    render(
      trupp({
        abfragen: [
          { zeitpunkt: nachAbmarsch(5).toISOString(), druck: 240, amZiel: true },
          { zeitpunkt: nachAbmarsch(9).toISOString(), druck: 200, amZiel: true },
        ],
      }),
      { jetzt: nachAbmarsch(10) },
    );
    // Die Marke im SVG darunter trägt denselben Text — gemeint ist die Zeile.
    expect(
      screen.getAllByText('Ankunft').filter((n) => n.tagName === 'P'),
    ).toHaveLength(1);
  });

  it('beschriftet nur die erste Rückzugsmeldung mit „Rückzug"', () => {
    render(
      trupp({
        abfragen: [
          {
            zeitpunkt: nachAbmarsch(5).toISOString(),
            druck: 200,
            rueckzug: true,
          },
          {
            zeitpunkt: nachAbmarsch(9).toISOString(),
            druck: 150,
            rueckzug: true,
          },
        ],
      }),
      { jetzt: nachAbmarsch(10) },
    );
    expect(
      screen.getAllByText('Rückzug').filter((n) => n.tagName === 'P'),
    ).toHaveLength(1);
  });

  it('meldet keine fehlende Ankunft, wenn sie ohne Druck gemeldet wurde', () => {
    // Über Funk kommt die Ankunft auch ohne Zahl. Der Hinweis fragt nach der
    // **Meldung**, nicht nach dem Druck.
    render(
      trupp({
        abfragen: [
          { zeitpunkt: nachAbmarsch(5).toISOString(), amZiel: true },
        ],
      }),
      { jetzt: nachAbmarsch(10) },
    );
    expect(screen.queryByText('Keine Ankunftsmeldung')).toBeNull();
  });

  it('meldet keine fehlende Ankunft mehr, sobald der Rückzug läuft', () => {
    // Der Hinweis zielt darauf, eine Ankunft nachzutragen, damit der
    // Rückmarschdruck rechenbar wird. Auf dem Rückweg ist das erledigt.
    render(
      trupp({
        abfragen: [
          {
            zeitpunkt: nachAbmarsch(5).toISOString(),
            druck: 200,
            rueckzug: true,
          },
        ],
      }),
      { jetzt: nachAbmarsch(10) },
    );
    expect(screen.queryByText('Keine Ankunftsmeldung')).toBeNull();
  });
});
