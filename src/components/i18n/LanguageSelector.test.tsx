// @vitest-environment jsdom
import { NextIntlClientProvider } from 'next-intl';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import deMessages from '../../../messages/de.json';

const updateMyLanguageMock = vi.fn();
const updateSessionMock = vi.fn();

vi.mock('../../app/actions/userSettings', () => ({
  updateMyLanguage: (lang: string) => updateMyLanguageMock(lang),
}));

vi.mock('next-auth/react', () => ({
  useSession: () => ({ update: updateSessionMock }),
}));

// Avoid forcing the test JSDOM into a navigation by reloading the window.
const reloadMock = vi.fn();
Object.defineProperty(window, 'location', {
  configurable: true,
  value: { ...window.location, reload: reloadMock },
});

import LanguageSelector from './LanguageSelector';

function renderSelector(locale: 'de' | 'en' = 'de') {
  return render(
    <NextIntlClientProvider locale={locale} messages={deMessages}>
      <LanguageSelector />
    </NextIntlClientProvider>,
  );
}

describe('LanguageSelector', () => {
  beforeEach(() => {
    updateMyLanguageMock.mockReset();
    updateSessionMock.mockReset();
    reloadMock.mockReset();
  });

  it('renders the current locale as selected', () => {
    renderSelector('de');
    expect(
      screen.getByRole('combobox', { name: /Anzeigesprache/i }),
    ).toHaveTextContent(/Deutsch/);
  });

  it('persists the new language via the server action and refreshes the session', async () => {
    updateMyLanguageMock.mockResolvedValue({ language: 'en' });
    const user = userEvent.setup();
    renderSelector('de');

    await user.click(screen.getByRole('combobox', { name: /Anzeigesprache/i }));
    await user.click(screen.getByRole('option', { name: /English/ }));

    await waitFor(() => {
      expect(updateMyLanguageMock).toHaveBeenCalledWith('en');
      expect(updateSessionMock).toHaveBeenCalledWith({ language: 'en' });
      expect(reloadMock).toHaveBeenCalled();
    });
  });

  it('shows an error message when the server action fails', async () => {
    updateMyLanguageMock.mockRejectedValue(new Error('nope'));
    const user = userEvent.setup();
    renderSelector('de');

    await user.click(screen.getByRole('combobox', { name: /Anzeigesprache/i }));
    await user.click(screen.getByRole('option', { name: /English/ }));

    await waitFor(() => {
      expect(
        screen.getByText(/Sprache konnte nicht gespeichert werden/),
      ).toBeInTheDocument();
      expect(reloadMock).not.toHaveBeenCalled();
    });
  });
});
