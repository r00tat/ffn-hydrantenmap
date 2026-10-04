// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { useLocale, useTimeZone, useTranslations } from 'next-intl';
import { describe, expect, it } from 'vitest';
import deMessages from '../../../messages/de.json';
import enMessages from '../../../messages/en.json';
import IntlClientProvider from './IntlClientProvider';

function Probe() {
  const t = useTranslations('common');
  return (
    <span>
      {useLocale()}|{useTimeZone()}|{t('cancel')}
    </span>
  );
}

describe('IntlClientProvider', () => {
  it('nimmt den deutschen Katalog aus dem Bundle', () => {
    render(
      <IntlClientProvider locale="de">
        <Probe />
      </IntlClientProvider>,
    );
    expect(screen.getByText(`de|Europe/Vienna|${deMessages.common.cancel}`)).toBeInTheDocument();
  });

  it('nimmt für Englisch den englischen Katalog', () => {
    render(
      <IntlClientProvider locale="en">
        <Probe />
      </IntlClientProvider>,
    );
    expect(screen.getByText(`en|Europe/Vienna|${enMessages.common.cancel}`)).toBeInTheDocument();
  });

  it('fällt bei unbekannter Sprache auf Deutsch zurück', () => {
    render(
      <IntlClientProvider locale="fr">
        <Probe />
      </IntlClientProvider>,
    );
    expect(screen.getByText(`de|Europe/Vienna|${deMessages.common.cancel}`)).toBeInTheDocument();
  });
});
