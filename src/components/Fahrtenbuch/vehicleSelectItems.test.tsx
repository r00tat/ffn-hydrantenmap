// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { describe, expect, it } from 'vitest';
import {
  vehicleSelectItems,
  type VehicleSelectOption,
} from './vehicleSelectItems';

const LABEL: Record<string, string> = {
  fahrzeug: 'Fahrzeug',
  boot: 'Boot',
  anhaenger: 'Anhänger',
};

function Auswahl({
  vehicles,
  mitLeer,
}: {
  vehicles: VehicleSelectOption[];
  mitLeer?: boolean;
}) {
  return (
    <TextField select label="Fahrzeug" value="" onChange={() => {}}>
      {mitLeer ? <MenuItem value="">Alle</MenuItem> : null}
      {vehicleSelectItems(vehicles, (k) => LABEL[k])}
    </TextField>
  );
}

/** Reihenfolge der sichtbaren Zeilen im geöffneten Auswahlfeld. */
async function oeffneUndLies(): Promise<string[]> {
  const user = userEvent.setup();
  await user.click(screen.getByLabelText('Fahrzeug'));
  const liste = await screen.findByRole('listbox');
  return [...liste.children].map((el) => el.textContent ?? '');
}

describe('vehicleSelectItems', () => {
  it('gruppiert nach Kategorie in fester Reihenfolge', async () => {
    render(
      <Auswahl
        vehicles={[
          { id: 'v1', name: 'ATS-Anhänger', kategorie: 'anhaenger' },
          { id: 'v2', name: 'TLFA 4000', kategorie: 'fahrzeug' },
          { id: 'v3', name: 'Mehrzweckboot', kategorie: 'boot' },
        ]}
      />,
    );

    expect(await oeffneUndLies()).toEqual([
      'Fahrzeug',
      'TLFA 4000',
      'Boot',
      'Mehrzweckboot',
      'Anhänger',
      'ATS-Anhänger',
    ]);
  });

  it('lässt die Überschrift weg, wenn es nur eine Kategorie gibt', async () => {
    // Eine einzelne Überschrift über der vollständigen Liste trennt nichts.
    render(
      <Auswahl
        vehicles={[
          { id: 'v1', name: 'KRF-S', kategorie: 'fahrzeug' },
          { id: 'v2', name: 'TLFA 4000', kategorie: 'fahrzeug' },
        ]}
      />,
    );

    expect(await oeffneUndLies()).toEqual(['KRF-S', 'TLFA 4000']);
  });

  it('ordnet Fahrzeuge ohne gepflegte Kategorie nach ihrem Namen ein', async () => {
    render(
      <Auswahl
        vehicles={[
          { id: 'v1', name: 'TLFA 4000' },
          { id: 'v2', name: 'Mehrzweckboot' },
        ]}
      />,
    );

    expect(await oeffneUndLies()).toEqual([
      'Fahrzeug',
      'TLFA 4000',
      'Boot',
      'Mehrzweckboot',
    ]);
  });

  it('lässt einen vorangestellten Eintrag wie „Alle" stehen', async () => {
    // Die Filterfelder setzen ihren eigenen Eintrag vor die Gruppen.
    render(
      <Auswahl
        mitLeer
        vehicles={[
          { id: 'v1', name: 'TLFA 4000', kategorie: 'fahrzeug' },
          { id: 'v2', name: 'ATS-Anhänger', kategorie: 'anhaenger' },
        ]}
      />,
    );

    expect(await oeffneUndLies()).toEqual([
      'Alle',
      'Fahrzeug',
      'TLFA 4000',
      'Anhänger',
      'ATS-Anhänger',
    ]);
  });
});
