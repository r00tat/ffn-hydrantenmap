import { describe, it, expect } from 'vitest';
import { renderTemplate, renderEmailTemplates, DEFAULT_EMAIL_CONFIG } from './kostenersatzEmail';
import type { EmailTemplateContext } from './kostenersatzEmail';

const ctx: EmailTemplateContext = {
  recipient: {
    name: 'Max Mustermann',
    email: 'max@example.com',
    address: 'Hauptstraße 1, 7100 Neusiedl am See',
    phone: '+43 1234 5678',
  },
  firecall: {
    name: 'Brand Wohnhaus',
    date: '15.03.2026',
    description: 'Küchenbrand im Erdgeschoss',
  },
  calculation: {
    totalSum: '€ 1.234,56',
    defaultStunden: 2,
    comment: 'Einsatz abgeschlossen',
  },
};

describe('renderTemplate', () => {
  it('substitutes a top-level variable', () => {
    expect(renderTemplate('Hello {{ recipient.name }}!', ctx)).toBe(
      'Hello Max Mustermann!'
    );
  });

  it('substitutes multiple variables', () => {
    const result = renderTemplate(
      '{{ firecall.name }} am {{ firecall.date }}',
      ctx
    );
    expect(result).toBe('Brand Wohnhaus am 15.03.2026');
  });

  it('substitutes numeric values as strings', () => {
    expect(renderTemplate('Stunden: {{ calculation.defaultStunden }}', ctx)).toBe(
      'Stunden: 2'
    );
  });

  it('leaves unknown placeholders unchanged', () => {
    expect(renderTemplate('{{ unknown.field }} bleibt', ctx)).toBe(
      '{{ unknown.field }} bleibt'
    );
  });

  it('handles whitespace around variable names', () => {
    expect(renderTemplate('{{  recipient.name  }}', ctx)).toBe('Max Mustermann');
  });

  it('returns the template unchanged when it has no placeholders', () => {
    expect(renderTemplate('Kein Platzhalter', ctx)).toBe('Kein Platzhalter');
  });

  it('handles multiple occurrences of the same variable', () => {
    const result = renderTemplate(
      '{{ recipient.name }} / {{ recipient.name }}',
      ctx
    );
    expect(result).toBe('Max Mustermann / Max Mustermann');
  });
});

describe('renderEmailTemplates', () => {
  it('renders both subject and body from DEFAULT_EMAIL_CONFIG', () => {
    const { subject, body } = renderEmailTemplates(DEFAULT_EMAIL_CONFIG, ctx);

    expect(subject).toBe('Kostenersatz - Feuerwehr Neusiedl am See - 15.03.2026');
    expect(body).toContain('Max Mustermann');
    expect(body).toContain('Brand Wohnhaus');
    expect(body).toContain('15.03.2026');
  });
});
