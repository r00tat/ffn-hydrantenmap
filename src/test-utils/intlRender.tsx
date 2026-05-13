import { render, RenderOptions, RenderResult } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ReactElement, ReactNode } from 'react';
import deMessages from '../../messages/de.json';

function IntlWrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="de" messages={deMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

/**
 * Render a component wrapped in NextIntlClientProvider using the de.json
 * catalog. Use this in any test that touches a component which calls
 * `useTranslations()`.
 */
export function renderWithIntl(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
): RenderResult {
  return render(ui, { wrapper: IntlWrapper, ...options });
}
