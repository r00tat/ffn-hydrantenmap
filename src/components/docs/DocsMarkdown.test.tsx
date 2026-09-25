// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderWithIntl as render } from '../../test-utils/intlRender';
import DocsMarkdown from './DocsMarkdown';

describe('DocsMarkdown', () => {
  it('rendert einen Absatz mit Screenshot nicht als <p>', () => {
    // Screenshot ist ein <div>; in einem <p> wäre das ungültiges HTML und
    // führt zu einem Hydration-Fehler.
    const { container } = render(
      <DocsMarkdown markdown="![Kartenansicht](/docs-assets/screenshots/karte.png)" />,
    );

    expect(container.querySelector('img')).not.toBeNull();
    expect(container.querySelector('p div')).toBeNull();
  });

  it('rendert gewöhnlichen Text weiterhin als <p>', () => {
    const { container } = render(<DocsMarkdown markdown="Nur Text." />);

    expect(container.querySelector('p')).toHaveTextContent('Nur Text.');
  });
});
