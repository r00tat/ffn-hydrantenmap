// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import ObjektArtChip from './ObjektArtChip';

describe('ObjektArtChip', () => {
  it('zeigt ein Risikoobjekt rot', () => {
    renderWithIntl(<ObjektArtChip art="risikoobjekt" />);
    const chip = screen.getByText('Risikoobjekt').closest('.MuiChip-root');
    expect(chip).toHaveClass('MuiChip-colorError');
  });

  it('zeigt ein gefährdetes Objekt orange', () => {
    renderWithIntl(<ObjektArtChip art="gefahrobjekt" />);
    const chip = screen.getByText('Gefährdetes Objekt').closest('.MuiChip-root');
    expect(chip).toHaveClass('MuiChip-colorWarning');
  });
});
