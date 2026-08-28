// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '../../test-utils/intlRender';
import RescueSheetCard from './RescueSheetCard';
import { RescueSheetView } from '../../common/rescue/types';

const sheet: RescueSheetView = {
  id: '1',
  makeName: 'Audi',
  modelName: 'A3',
  variantName: 'A3 Sportback',
  bodyType: 'Hatchback',
  buildYearFrom: 2012,
  buildYearUntil: 2020,
  doors: '5',
  powertrain: 'Gasoline/Diesel',
  pictureUrl: 'https://example.test/a3.png',
  sheetUrl: 'https://example.test/a3_DE.pdf',
  sheetLanguage: 'DE',
  guideUrl: 'https://example.test/audi_DE.pdf',
  guideLanguage: 'DE',
};

describe('RescueSheetCard', () => {
  it('shows make, variant and the descriptive data', () => {
    renderWithIntl(<RescueSheetCard sheet={sheet} />);

    expect(screen.getByText('Audi A3 Sportback')).toBeInTheDocument();
    expect(screen.getByText(/2012–2020/)).toBeInTheDocument();
    expect(screen.getByText(/Hatchback/)).toBeInTheDocument();
    expect(screen.getByText(/5 Türen/)).toBeInTheDocument();
  });

  it('links the rescue sheet into a new tab', () => {
    renderWithIntl(<RescueSheetCard sheet={sheet} />);

    const link = screen.getByRole('link', { name: /Rettungskarte \(DE\)/ });
    expect(link).toHaveAttribute('href', 'https://example.test/a3_DE.pdf');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('links the rescue guide as well', () => {
    renderWithIntl(<RescueSheetCard sheet={sheet} />);

    expect(screen.getByRole('link', { name: /Rescue Guide/ })).toHaveAttribute(
      'href',
      'https://example.test/audi_DE.pdf',
    );
  });

  it('loads the picture through our own origin, not from Euro NCAP', () => {
    // Euro NCAP liefert seine PNGs mit `Content-Type: application/pdf`.
    // Chrome verwirft eine solche cross-origin-Antwort per ORB
    // (`net::ERR_BLOCKED_BY_ORB`) — direkt verlinkt erschien kein Bild.
    renderWithIntl(<RescueSheetCard sheet={sheet} />);

    const image = screen.getByRole('img', { name: 'Audi A3 Sportback' });
    expect(image).toHaveAttribute('src', '/api/rettungskarten/bild/1');
  });

  it('shows no picture when the variant has none', () => {
    renderWithIntl(
      <RescueSheetCard sheet={{ ...sheet, pictureUrl: undefined }} />,
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('says so when no sheet is available', () => {
    renderWithIntl(
      <RescueSheetCard sheet={{ ...sheet, sheetUrl: undefined }} />,
    );

    expect(
      screen.getByText('Keine Rettungskarte hinterlegt'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Rettungskarte \(/ }),
    ).not.toBeInTheDocument();
  });
});
