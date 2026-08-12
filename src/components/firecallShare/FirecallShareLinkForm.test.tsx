// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import FirecallShareLinkForm, {
  type FirecallShareLinkFormValues,
} from './FirecallShareLinkForm';

const DAY_MS = 24 * 60 * 60 * 1000;

function lastValues(onChange: ReturnType<typeof vi.fn>) {
  return onChange.mock.lastCall?.[0] as
    | FirecallShareLinkFormValues
    | undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FirecallShareLinkForm', () => {
  it('reports no values while the name is empty', () => {
    const onChange = vi.fn();
    renderWithIntl(<FirecallShareLinkForm onChange={onChange} />);

    expect(lastValues(onChange)).toBeUndefined();
  });

  it('defaults to one week of validity', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(<FirecallShareLinkForm onChange={onChange} />);

    await user.type(screen.getByLabelText(/Name des Gasts/), 'ORF');

    await waitFor(() => expect(lastValues(onChange)?.name).toBe('ORF'));
    const values = lastValues(onChange)!;
    expect(values.canWrite).toBe(false);
    expect(values.expiresAt - Date.now()).toBeGreaterThan(7 * DAY_MS - 10_000);
    expect(values.expiresAt - Date.now()).toBeLessThanOrEqual(7 * DAY_MS);
  });

  it('offers the other presets', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(<FirecallShareLinkForm onChange={onChange} />);

    await user.type(screen.getByLabelText(/Name des Gasts/), 'ORF');
    await user.click(screen.getByLabelText('Gültigkeit'));
    await user.click(await screen.findByRole('option', { name: '30 Tage' }));

    await waitFor(() =>
      expect(lastValues(onChange)!.expiresAt - Date.now()).toBeGreaterThan(
        30 * DAY_MS - 10_000
      )
    );
  });

  it('switches to write access', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(<FirecallShareLinkForm onChange={onChange} />);

    await user.type(screen.getByLabelText(/Name des Gasts/), 'ORF');
    await user.click(screen.getByRole('radio', { name: /Lesen und Schreiben/ }));

    await waitFor(() => expect(lastValues(onChange)?.canWrite).toBe(true));
  });

  it('starts on the existing values when editing', () => {
    const expiresAt = Date.now() + 3 * DAY_MS;
    const onChange = vi.fn();
    renderWithIntl(
      <FirecallShareLinkForm
        link={{
          uid: 'g1',
          name: 'ORF',
          canWrite: true,
          disabled: false,
          expiresAt,
        }}
        onChange={onChange}
      />
    );

    expect(screen.getByLabelText(/Name des Gasts/)).toHaveValue('ORF');
    // Beim Bearbeiten steht die Auswahl auf dem freien Datum, damit der
    // gespeicherte Ablaufzeitpunkt sichtbar und änderbar ist.
    expect(screen.getByRole('combobox', { name: 'Gültigkeit' })).toHaveTextContent(
      'eigenes Datum'
    );
    expect(lastValues(onChange)).toMatchObject({
      name: 'ORF',
      canWrite: true,
      expiresAt,
    });
  });

  it('rejects an expiry in the past', () => {
    const onChange = vi.fn();
    renderWithIntl(
      <FirecallShareLinkForm
        link={{
          uid: 'g1',
          name: 'ORF',
          canWrite: false,
          disabled: false,
          expiresAt: Date.now() - 1000,
        }}
        onChange={onChange}
      />
    );

    expect(
      screen.getByText('Bitte ein Datum in der Zukunft wählen.')
    ).toBeVisible();
    expect(lastValues(onChange)).toBeUndefined();
  });
});
