// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { saveMock } = vi.hoisted(() => ({ saveMock: vi.fn() }));

vi.mock('./rechnungActions', () => ({
  saveAtemschutzEmpfaenger: saveMock,
}));

import { renderWithIntl } from '../../test-utils/intlRender';
import EmpfaengerDialog from './EmpfaengerDialog';

function render(
  over: Partial<React.ComponentProps<typeof EmpfaengerDialog>> = {},
) {
  return renderWithIntl(
    <EmpfaengerDialog
      open
      groupId="ffnd"
      feuerwehren={['Podersdorf', 'Winden am See']}
      onClose={vi.fn()}
      onSaved={vi.fn()}
      {...over}
    />,
  );
}

describe('EmpfaengerDialog', () => {
  it('warnt, wenn die Schreibweise an keiner Flasche steht', () => {
    render();

    fireEvent.change(screen.getByLabelText(/Feuerwehr/), {
      target: { value: 'FF Podersdorf' },
    });

    // Genau der Fall aus der Praxis: An der Flasche steht „Podersdorf", im
    // Empfänger „FF Podersdorf" — der Abgleich über `normalizeCode` greift
    // dann nicht, und ohne Hinweis fiele das erst bei der Rechnung auf.
    expect(
      screen.getByText(/steht an keiner Flasche/),
    ).toBeInTheDocument();
  });

  it('schweigt, wenn die Schreibweise passt', () => {
    render();

    fireEvent.change(screen.getByLabelText(/Feuerwehr/), {
      target: { value: 'Podersdorf' },
    });

    expect(
      screen.queryByText(/steht an keiner Flasche/),
    ).not.toBeInTheDocument();
  });

  it('übernimmt einen vorhandenen Eintrag zum Ändern', () => {
    render({
      empfaenger: {
        id: 'e1',
        feuerwehr: 'Podersdorf',
        name: 'FF Podersdorf',
        adresse: 'Hauptstraße 1',
        email: 'kdo@ff-podersdorf.at',
        active: true,
        createdAt: '',
        createdBy: '',
        updatedAt: '',
        updatedBy: '',
      },
    });

    expect(screen.getByDisplayValue('FF Podersdorf')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Podersdorf')).toBeInTheDocument();
    expect(
      screen.getByDisplayValue('kdo@ff-podersdorf.at'),
    ).toBeInTheDocument();
  });
});
