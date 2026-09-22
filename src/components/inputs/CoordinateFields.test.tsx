// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import CoordinateFields from './CoordinateFields';

const NEUSIEDL = { lat: 47.94829, lng: 16.84822 };

function setup(
  props: Partial<React.ComponentProps<typeof CoordinateFields>> = {}
) {
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

/** Die Felder liegen hinter dem Stift — erst aufklappen, dann tippen. */
async function edit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Koordinaten bearbeiten' }));
}

describe('CoordinateFields', () => {
  it('zeigt die Position und kein einziges Eingabefeld', () => {
    // Die Position gehört zu einem Element wie sein Name: meistens will man
    // sie lesen. Vier Felder, in die man versehentlich tippt, sind für den
    // Regelfall die falsche Voreinstellung.
    setup();
    expect(screen.getByText('47.94829, 16.84822')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Latitude/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Grad\/Minuten\/Sekunden/)).not.toBeInTheDocument();
  });

  it('zeigt nach dem Klick auf Bearbeiten dieselbe Position in allen drei Schreibweisen', async () => {
    const user = userEvent.setup();
    setup();
    await edit(user);

    expect(screen.getByLabelText(/Latitude/)).toHaveValue('47.94829');
    expect(screen.getByLabelText(/Longitude/)).toHaveValue('16.84822');
    expect(screen.getByLabelText(/Grad\/Minuten\/Sekunden/)).toHaveValue(
      '47°56\'53.8"N 16°50\'53.6"E'
    );
    expect(screen.getByLabelText(/Grad\/Dezimalminuten/)).toHaveValue(
      "N 47°56.897' E 16°50.893'"
    );
    expect(screen.getByLabelText(/UTM/)).toHaveValue('33T 638004 5312206');
    expect(screen.getByLabelText(/Bundesmeldenetz/)).toHaveValue(
      'M34 788550 312316'
    );
  });

  it('übernimmt eine eingefügte UTM-Angabe', async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    await edit(user);
    const field = screen.getByLabelText(/UTM/);
    await user.clear(field);
    await user.paste('33U 602065 5340387'); // Stephansdom

    expect(onChange).toHaveBeenLastCalledWith(
      expect.closeTo(48.2085, 3),
      expect.closeTo(16.3738, 3)
    );
  });

  it('übernimmt eine eingefügte BMN-Angabe aus dem Burgenland-GIS', async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    await edit(user);
    const field = screen.getByLabelText(/Bundesmeldenetz/);
    await user.clear(field);
    await user.paste('787648 310270');

    expect(onChange).toHaveBeenLastCalledWith(
      expect.closeTo(47.92995, 3),
      expect.closeTo(16.83597, 3)
    );
  });

  it('nimmt einen Kartenlink in jedem Feld an', async () => {
    // Der geteilte Standort aus WhatsApp landet dort, wo der Finger hintrifft.
    const user = userEvent.setup();
    const { onChange } = setup();
    await edit(user);
    const field = screen.getByLabelText(/Grad\/Minuten\/Sekunden/);
    await user.clear(field);
    await user.paste('https://maps.google.com/?q=48.2083,16.3708');

    expect(onChange).toHaveBeenLastCalledWith(
      expect.closeTo(48.2083, 4),
      expect.closeTo(16.3708, 4)
    );
  });

  it('klappt die Felder wieder zu', async () => {
    const user = userEvent.setup();
    setup();
    await edit(user);
    await user.click(
      screen.getByRole('button', { name: 'Bearbeitung beenden' })
    );

    expect(screen.queryByLabelText(/Latitude/)).not.toBeInTheDocument();
    expect(screen.getByText('47.94829, 16.84822')).toBeInTheDocument();
  });

  it('übernimmt eine eingefügte DMS-Angabe', async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    await edit(user);
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
    await edit(user);
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
    await edit(user);
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
    await edit(user);
    const field = screen.getByLabelText(/Grad\/Dezimalminuten/);
    await user.clear(field);
    await user.paste('keine Koordinate');

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Keine gültige Koordinate')).toBeInTheDocument();
  });

  it('zeigt nach dem Verlassen wieder die gespeicherte Position', async () => {
    const user = userEvent.setup();
    setup();
    await edit(user);
    const field = screen.getByLabelText(/Grad\/Minuten\/Sekunden/);
    await user.clear(field);
    await user.paste('Unsinn');
    await user.tab();

    expect(field).toHaveValue('47°56\'53.8"N 16°50\'53.6"E');
  });

  it('lässt sich auch ohne Position bearbeiten', async () => {
    // Der Anlass des ganzen Feldes: Von der Polizei kommt eine Koordinate für
    // eine Markierung, die es noch nirgends gibt.
    const user = userEvent.setup();
    setup({ lat: undefined, lng: undefined });
    expect(screen.getByText('keine Position')).toBeInTheDocument();

    await edit(user);
    expect(screen.getByLabelText(/Latitude/)).toHaveValue('');
    expect(screen.getByLabelText(/Grad\/Minuten\/Sekunden/)).toHaveValue('');
    expect(screen.getByLabelText(/UTM/)).toHaveValue('');
  });
});
