// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import type { AtemschutzTrupp } from '../../common/atemschutz';
import TruppCard from './TruppCard';

function trupp(over: Partial<AtemschutzTrupp> = {}): AtemschutzTrupp {
  return {
    id: 't1',
    truppKey: 'k1',
    laufendeNummer: 1,
    feuerwehr: 'Neusiedl am See',
    mitglieder: ['Anna Beispiel', 'Bernd Beispiel', 'Clara Beispiel'],
    status: 'bereit',
    bereitSeit: '2026-08-29T10:00:00.000Z',
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...over,
  };
}

function render(t: AtemschutzTrupp, canWrite = true) {
  renderWithIntl(
    <TruppCard
      trupp={t}
      canWrite={canWrite}
      onEntsenden={vi.fn()}
      onRueckkehr={vi.fn()}
      onWiederBereit={vi.fn()}
      onAbmelden={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
}

describe('TruppCard', () => {
  it('zeigt in Bereitschaft Entsenden und Abmelden', () => {
    render(trupp({ status: 'bereit' }));
    expect(screen.getByRole('button', { name: 'Entsenden' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abmelden' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rückkehr' })).toBeNull();
  });

  it('zeigt im Einsatz nur Rückkehr — nicht Abmelden', () => {
    // Ein Trupp, der draußen ist, muss erst zurückkommen.
    render(trupp({ status: 'imEinsatz', entsendetAn: 'GRKDT Huber' }));
    expect(screen.getByRole('button', { name: 'Rückkehr' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abmelden' })).toBeNull();
  });

  it('zeigt nach der Rückkehr „Wieder bereitstellen“', () => {
    render(trupp({ status: 'zurueck' }));
    expect(
      screen.getByRole('button', { name: 'Wieder bereitstellen' }),
    ).toBeInTheDocument();
  });

  it('zeigt bei einem abgemeldeten Trupp keine Aktion', () => {
    render(trupp({ status: 'abgemeldet' }));
    expect(screen.queryByRole('button', { name: 'Entsenden' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rückkehr' })).toBeNull();
  });

  it('blendet ohne Schreibrecht alle Aktionen aus', () => {
    render(trupp({ status: 'bereit' }), false);
    expect(screen.queryByRole('button', { name: 'Entsenden' })).toBeNull();
  });

  it('weist die zweite Bereitstellung aus', () => {
    render(trupp({ laufendeNummer: 3 }));
    expect(screen.getByText('3. Einsatz')).toBeInTheDocument();
  });

  it('nennt bei der ersten Bereitstellung keine laufende Nummer', () => {
    render(trupp({ laufendeNummer: 1 }));
    expect(screen.queryByText('1. Einsatz')).toBeNull();
  });

  it('zeigt die Truppmitglieder', () => {
    render(trupp());
    expect(
      screen.getByText('Anna Beispiel · Bernd Beispiel · Clara Beispiel'),
    ).toBeInTheDocument();
  });
});
