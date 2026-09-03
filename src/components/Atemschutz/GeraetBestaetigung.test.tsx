// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import type { AtemschutzGeraet } from '../../common/atemschutz';
import GeraetBestaetigung from './GeraetBestaetigung';

const geraet: AtemschutzGeraet = {
  id: 'g1',
  typ: 'maske',
  bezeichnung: 'Vollmaske',
  feuerwehr: 'Neusiedl am See',
  inventarNr: '2016-MU-046',
  active: true,
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
};

describe('GeraetBestaetigung', () => {
  it('zeigt die Rohlesung neben dem Stück — der Scanner-Dialog ist da längst zu', () => {
    renderWithIntl(
      <GeraetBestaetigung
        geraet={geraet}
        scan={{
          value: '2016-MU-046',
          results: [{ rawValue: '2016-MU-046', format: 'code_128' }],
          engine: 'zxing',
        }}
      />,
    );
    expect(screen.getByText('2016-MU-046')).toBeInTheDocument();
    expect(
      screen.getByText(/Gelesen: „2016-MU-046“ · code_128/),
    ).toBeInTheDocument();
  });

  it('bleibt ohne Scan unverändert — von Hand gewählt gibt es keine Rohlesung', () => {
    renderWithIntl(<GeraetBestaetigung geraet={geraet} />);
    expect(screen.queryByText(/Gelesen:/)).not.toBeInTheDocument();
  });
});
