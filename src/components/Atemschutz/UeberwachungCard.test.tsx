// @vitest-environment jsdom
import { screen } from '@testing-library/react';
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
}

function render(
  t: AtemschutzTrupp,
  { jetzt = nachAbmarsch(1), canWrite = true, istAktuell = true }: RenderOptionen = {},
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
      onAbmarsch={vi.fn()}
      onRueckkehr={vi.fn()}
    />,
  );
}

describe('UeberwachungCard', () => {
  it('zeigt im Einsatz Druck, Rückzugszeit und die Aktionen', () => {
    render(trupp());
    expect(screen.getByText('Vermuteter Druck')).toBeInTheDocument();
    expect(screen.getByText('Rückzug um')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Druckabfrage' }),
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

  it('bietet einem noch nicht übernommenen Trupp die Übernahme an', () => {
    render(trupp({ ueberwachungSeit: undefined }));
    expect(screen.getByText('Zeitkontrolle nicht übernommen')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Zeitkontrolle übernehmen' }),
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
    expect(screen.queryByRole('button', { name: 'Druckabfrage' })).toBeNull();
  });

  it('bietet an einer älteren Bereitstellung keine Aktion an', () => {
    render(trupp(), { istAktuell: false });
    expect(screen.queryByRole('button', { name: 'Druckabfrage' })).toBeNull();
  });

  it('zeigt den Druckverlauf mit Abmarsch und Abfragen', () => {
    render(trupp({ abfragen: [abfrage(5, 200, true)] }), { jetzt: nachAbmarsch(6) });
    expect(screen.getByText('Druckverlauf')).toBeInTheDocument();
    // Auf den Verlaufseintrag geprüft und nicht auf „300 bar": Denselben Wert
    // trägt auch der Chip mit dem Gerätesatz.
    expect(screen.getByText(/300 bar \(Entsenden\)/)).toBeInTheDocument();
    expect(screen.getByText(/200 bar \(Ankunft\)/)).toBeInTheDocument();
  });

  it('zeigt die Geräte am Trupp samt Träger', () => {
    render(
      trupp({
        truppGeraete: [
          {
            typ: 'flasche',
            bezeichnung: 'CFK 6,8 l',
            kennung: '2.16.19',
            person: 'Anna Beispiel',
          },
        ],
      }),
    );
    expect(
      screen.getByText('2.16.19 · CFK 6,8 l — Anna Beispiel'),
    ).toBeInTheDocument();
  });
});
