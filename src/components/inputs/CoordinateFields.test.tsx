// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import CoordinateFields from './CoordinateFields';

const NEUSIEDL = { lat: 47.94829, lng: 16.84822 };

function setup(props: Partial<React.ComponentProps<typeof CoordinateFields>> = {}) {
  const onChange = vi.fn();
  renderWithIntl(
    <CoordinateFields
      lat={NEUSIEDL.lat}
      lng={NEUSIEDL.lng}
      onChange={onChange}
      {...props}
    />
  );
  return { onChange };
}

describe('CoordinateFields', () => {
  it('zeigt dieselbe Position in allen drei Schreibweisen', () => {
    setup();
    expect(screen.getByLabelText(/Latitude/)).toHaveValue('47.94829');
    expect(screen.getByLabelText(/Longitude/)).toHaveValue('16.84822');
    expect(screen.getByLabelText(/Grad\/Minuten\/Sekunden/)).toHaveValue(
      '47°56\'53.8"N 16°50\'53.6"E'
    );
    expect(screen.getByLabelText(/Grad\/Dezimalminuten/)).toHaveValue(
      "N 47°56.897' E 16°50.893'"
    );
  });

  it('übernimmt eine eingefügte DMS-Angabe', async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    const field = screen.getByLabelText(/Grad\/Minuten\/Sekunden/);
    await user.clear(field);
    await user.paste('48°12\'30.0"N 16°22\'15.0"E');

    expect(onChange).toHaveBeenLastCalledWith(
      expect.closeTo(48.2083, 3),
      expect.closeTo(16.3708, 3)
    );
  });

  it('nimmt ein ganzes Paar auch im Einzelfeld an', async () => {
    // Wer Koordinaten aus einer Meldung kopiert, trifft nicht das richtige
    // Feld — jedes nimmt das ganze Paar.
    const user = userEvent.setup();
    const { onChange } = setup();
    const field = screen.getByLabelText(/Latitude/);
    await user.clear(field);
    await user.paste('48.2083, 16.3708');

    expect(onChange).toHaveBeenLastCalledWith(
      expect.closeTo(48.2083, 4),
      expect.closeTo(16.3708, 4)
    );
  });

  it('ändert nur die eine Achse, wenn nur ein Wert eingetragen wird', async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    const field = screen.getByLabelText(/Latitude/);
    await user.clear(field);
    await user.paste('48.2083');

    expect(onChange).toHaveBeenLastCalledWith(
      expect.closeTo(48.2083, 4),
      NEUSIEDL.lng
    );
  });

  it('meldet Unlesbares, ohne die Position zu ändern', async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    const field = screen.getByLabelText(/Grad\/Dezimalminuten/);
    await user.clear(field);
    await user.paste('keine Koordinate');

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Keine gültige Koordinate')).toBeInTheDocument();
  });

  it('zeigt nach dem Verlassen wieder die gespeicherte Position', async () => {
    const user = userEvent.setup();
    setup();
    const field = screen.getByLabelText(/Grad\/Minuten\/Sekunden/);
    await user.clear(field);
    await user.paste('Unsinn');
    await user.tab();

    expect(field).toHaveValue('47°56\'53.8"N 16°50\'53.6"E');
  });

  it('bleibt ohne Position leer', () => {
    setup({ lat: undefined, lng: undefined });
    expect(screen.getByLabelText(/Latitude/)).toHaveValue('');
    expect(screen.getByLabelText(/Grad\/Minuten\/Sekunden/)).toHaveValue('');
  });
});
