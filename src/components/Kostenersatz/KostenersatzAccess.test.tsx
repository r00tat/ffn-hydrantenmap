// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';

const login = vi.hoisted(() => vi.fn());
vi.mock('../../hooks/useFirebaseLogin', () => ({ default: () => login() }));

import KostenersatzAccess from './KostenersatzAccess';

const firecall = { id: 'fc1', name: 'Brand', group: 'ffnd' };

function renderGate(fc: { id?: string; name: string; group?: string } = firecall) {
  return renderWithIntl(
    <KostenersatzAccess firecall={fc} firecallId={fc.id ?? 'unknown'} title="Kostenersatz">
      <div>Inhalt</div>
    </KostenersatzAccess>,
  );
}

beforeEach(() => {
  login.mockReset();
});

describe('KostenersatzAccess', () => {
  it('zeigt den Inhalt mit der Rolle Kostenersatz in der Gruppe des Einsatzes', () => {
    login.mockReturnValue({ isAuthorized: true, groupRoles: { ffnd: ['kostenersatz'] } });
    renderGate();
    expect(screen.getByText('Inhalt')).toBeInTheDocument();
  });

  it('weist ab, wer die Rolle nur in einer anderen Gruppe hat', () => {
    login.mockReturnValue({
      isAuthorized: true,
      groupRoles: { ffxy: ['kostenersatz'], ffnd: [] },
    });
    renderGate();
    expect(screen.queryByText('Inhalt')).not.toBeInTheDocument();
    expect(screen.getByText(/keine Berechtigung für den Kostenersatz/)).toBeInTheDocument();
  });

  it('weist einen Gruppen-Admin ohne die Rolle ab', () => {
    login.mockReturnValue({ isAuthorized: true, groupRoles: { ffnd: ['gruppenadmin'] } });
    renderGate();
    expect(screen.queryByText('Inhalt')).not.toBeInTheDocument();
  });

  it('lässt den globalen Admin durch', () => {
    login.mockReturnValue({ isAuthorized: true, isAdmin: true, groupRoles: {} });
    renderGate();
    expect(screen.getByText('Inhalt')).toBeInTheDocument();
  });

  it('verlangt eine Anmeldung', () => {
    login.mockReturnValue({ isAuthorized: false, isAdmin: true });
    renderGate();
    expect(screen.getByText('Bitte melden Sie sich an.')).toBeInTheDocument();
  });

  it('meldet einen fehlenden Einsatz vor der Berechtigung', () => {
    login.mockReturnValue({ isAuthorized: true, groupRoles: { ffnd: ['kostenersatz'] } });
    renderGate({ name: '' });
    expect(screen.getByText('Kein Einsatz ausgewählt.')).toBeInTheDocument();
    expect(screen.queryByText('Inhalt')).not.toBeInTheDocument();
  });
});
