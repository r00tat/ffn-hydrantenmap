// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Der Mangel-Dialog zieht die Server-Action und den Storage-Upload nach sich —
// beide sind im Test nicht ladbar. Dieselben Attrappen wie im FuellungDialog.
vi.mock('./atemschutzActions', () => ({
  createAtemschutzMangel: vi.fn(),
}));

vi.mock('../Fahrtenbuch/uploadMangelImage', () => ({
  uploadMangelImage: vi.fn(),
}));

import { renderWithIntl } from '../../test-utils/intlRender';
import type { AtemschutzGeraet } from '../../common/atemschutz';
import AusruestungTab from './AusruestungTab';

function geraet(over: Partial<AtemschutzGeraet> = {}): AtemschutzGeraet {
  return {
    id: 'f1',
    typ: 'flasche',
    bezeichnung: 'Atemluftflasche CFK 6,8 l',
    feuerwehr: 'Neusiedl am See',
    nummer: '2.16.19',
    active: true,
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...over,
  };
}

describe('AusruestungTab', () => {
  it('zeigt Füllstationen nicht in der Ausgabeliste', () => {
    renderWithIntl(
      <AusruestungTab
        groupId="ffnd"
        geraete={[
          geraet(),
          geraet({
            id: 'k1',
            typ: 'fuellstation',
            bezeichnung: 'Mobiler Kompressor',
            nummer: undefined,
          }),
        ]}
        ausgabeByGeraet={new Map()}
        empfaengerVorschlaege={[]}
        openMangelByGeraet={new Map()}
        canWrite
        onPatch={vi.fn()}
        onMangelGemeldet={vi.fn()}
      />,
    );

    expect(screen.getByText(/2\.16\.19/)).toBeInTheDocument();
    expect(screen.queryByText(/Mobiler Kompressor/)).not.toBeInTheDocument();
  });
});
