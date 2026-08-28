// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl } from '../../test-utils/intlRender';
import RescueSheetMatches from './RescueSheetMatches';
import { RescueSheetView } from '../../common/rescue/types';

function sheet(id: string, variantName: string): RescueSheetView {
  return {
    id,
    makeName: 'Tesla',
    modelName: 'Model 3',
    variantName,
    buildYearFrom: 2019,
    sheetUrl: `https://example.test/${id}.pdf`,
    sheetLanguage: 'DE',
  };
}

describe('RescueSheetMatches', () => {
  it('shows the best match right away', () => {
    renderWithIntl(<RescueSheetMatches sheets={[sheet('1', 'Model 3')]} />);

    expect(screen.getByText('Rettungskarte')).toBeInTheDocument();
    expect(screen.getByText('Tesla Model 3')).toBeInTheDocument();
  });

  it('hides further variants behind an accordion', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <RescueSheetMatches
        sheets={[sheet('1', 'Model 3'), sheet('2', 'Model 3 Performance')]}
      />,
    );

    const summary = screen.getByText('1 weitere Variante');
    expect(
      screen.queryByText('Tesla Model 3 Performance'),
    ).not.toBeVisible();

    await user.click(summary);
    expect(screen.getByText('Tesla Model 3 Performance')).toBeVisible();
  });

  it('points to the manual search when nothing matched', () => {
    renderWithIntl(<RescueSheetMatches sheets={[]} />);

    expect(screen.getByText(/keine Rettungskarte/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manuell suchen' })).toHaveAttribute(
      'href',
      '/rettungskarten',
    );
  });
});
