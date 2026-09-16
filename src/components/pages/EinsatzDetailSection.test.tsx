// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { renderWithIntl as render } from '../../test-utils/intlRender';
import EinsatzDetailSection from './EinsatzDetailSection';

describe('EinsatzDetailSection', () => {
  it('zeigt den Titel und lässt den Inhalt zu', () => {
    render(
      <EinsatzDetailSection
        sectionId="anhaenge"
        title="Anhänge"
        expanded={false}
        onToggle={vi.fn()}
      >
        <div>Inhalt</div>
      </EinsatzDetailSection>
    );

    expect(screen.getByText('Anhänge')).toBeInTheDocument();
    // Zugeklappt wird der Inhalt gar nicht gerendert (unmountOnExit) — die
    // Abschnitte hängen an Firestore und sollen zu nichts abfragen.
    expect(screen.queryByText('Inhalt')).not.toBeInTheDocument();
  });

  it('rendert den Inhalt, wenn der Abschnitt offen ist', () => {
    render(
      <EinsatzDetailSection
        sectionId="anhaenge"
        title="Anhänge"
        expanded
        onToggle={vi.fn()}
      >
        <div>Inhalt</div>
      </EinsatzDetailSection>
    );

    expect(screen.getByText('Inhalt')).toBeInTheDocument();
  });

  it('meldet den Klick auf die Kopfzeile mit dem neuen Zustand', () => {
    const onToggle = vi.fn();
    render(
      <EinsatzDetailSection
        sectionId="anhaenge"
        title="Anhänge"
        expanded={false}
        onToggle={onToggle}
      >
        <div>Inhalt</div>
      </EinsatzDetailSection>
    );

    fireEvent.click(screen.getByText('Anhänge'));
    expect(onToggle).toHaveBeenCalledWith('anhaenge', true);
  });

  it('zeigt die Zusatzangabe in der Kopfzeile', () => {
    render(
      <EinsatzDetailSection
        sectionId="anhaenge"
        title="Anhänge"
        subtitle="3"
        expanded={false}
        onToggle={vi.fn()}
      >
        <div>Inhalt</div>
      </EinsatzDetailSection>
    );

    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('gibt dem Abschnitt eine ankerbare id', () => {
    const { container } = render(
      <EinsatzDetailSection
        sectionId="kostenersatz"
        title="Kostenersatz"
        expanded={false}
        onToggle={vi.fn()}
      >
        <div>Inhalt</div>
      </EinsatzDetailSection>
    );

    expect(container.querySelector('#kostenersatz')).not.toBeNull();
  });
});
