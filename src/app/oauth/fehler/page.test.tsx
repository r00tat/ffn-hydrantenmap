import { isValidElement, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import OauthErrorPage from './page';

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));

/**
 * Sammelt alle Props im Baum, deren Wert eine Funktion ist.
 *
 * Das ist der Test hinter dem eigentlichen Punkt: Diese Seite ist eine Server
 * Component und rendert MUI-Komponenten, also Client Components. React
 * serialisiert die Props über die Grenze, und eine Funktion lässt sich nicht
 * serialisieren — der Aufruf stirbt zur Laufzeit mit „Functions cannot be
 * passed directly to Client Components".
 *
 * Der Build fängt das nicht ab: Die Seite ist `force-dynamic`, wird also nie
 * vorgerendert, und die Grenze entsteht erst beim Request.
 */
function functionProps(node: unknown, path = 'root'): string[] {
  if (Array.isArray(node)) {
    return node.flatMap((child, index) =>
      functionProps(child, `${path}[${index}]`),
    );
  }
  if (!isValidElement(node)) {
    return [];
  }

  const element = node as ReactElement<Record<string, unknown>>;
  const found: string[] = [];
  for (const [name, value] of Object.entries(element.props ?? {})) {
    if (name === 'children') {
      found.push(...functionProps(value, `${path}.children`));
      continue;
    }
    if (typeof value === 'function') {
      found.push(`${path}.${name}`);
    }
  }
  return found;
}

describe('OauthErrorPage', () => {
  const render = (searchParams: { error?: string; description?: string }) =>
    OauthErrorPage({ searchParams: Promise.resolve(searchParams) });

  it('reicht keine Funktion an eine Client Component weiter', async () => {
    const page = await render({
      error: 'invalid_client',
      description: 'Unbekannte client_id',
    });

    expect(functionProps(page)).toEqual([]);
  });

  it('zeigt die übergebene Beschreibung und den Fehlercode', async () => {
    const page = await render({
      error: 'invalid_client',
      description: 'Unbekannte client_id',
    });

    const text = JSON.stringify(page);
    expect(text).toContain('Unbekannte client_id');
    expect(text).toContain('invalid_client');
  });

  it('fällt ohne Beschreibung auf den Ersatztext zurück', async () => {
    const page = await render({});

    expect(JSON.stringify(page)).toContain('errorFallback');
  });
});
