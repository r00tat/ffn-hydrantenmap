import { describe, it, expect } from 'vitest';
import type { Firecall } from '../components/firebase/firestore';
import { DEFAULT_GROUP_STAMMDATEN } from './groupStammdaten';
import type { KostenersatzCalculation } from './kostenersatz';
import {
  buildTemplateContext,
  renderTemplate,
  renderEmailTemplates,
  DEFAULT_EMAIL_CONFIG,
} from './kostenersatzEmail';
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
  absender: {
    name: 'Freiwillige Feuerwehr Musterdorf',
    adresse: 'Hauptstraße 1',
    kontakt: '',
    kontoinhaber: 'Freiwillige Feuerwehr Musterdorf',
    iban: 'AT40 3300 0000 0202 0402',
    bic: 'RLBBAT2E',
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

    expect(subject).toBe(
      'Kostenersatz - Freiwillige Feuerwehr Musterdorf - 15.03.2026'
    );
    expect(body).toContain('Max Mustermann');
    expect(body).toContain('Brand Wohnhaus');
    expect(body).toContain('15.03.2026');
  });
});

const stammdaten = {
  ...DEFAULT_GROUP_STAMMDATEN,
  absenderName: 'Freiwillige Feuerwehr Musterdorf',
  absenderAdresse: 'Hauptstraße 1',
  iban: 'AT40 3300 0000 0202 0402',
  bic: 'RLBBAT2E',
};

const calculation = {
  recipient: { name: 'Max Muster', email: 'max@example.at', address: '', phone: '' },
  totalSum: 120,
  defaultStunden: 1,
  comment: '',
  items: [],
  customItems: [],
  rateVersion: '2023',
} as unknown as KostenersatzCalculation;

const firecall = { id: 'e1', name: 'Brand', date: '2026-01-02', group: 'ffnd' } as Firecall;

describe('Absender aus den Gruppen-Stammdaten', () => {
  it('setzt Absender und Bankverbindung aus den Stammdaten ein', () => {
    const context = buildTemplateContext(calculation, firecall, stammdaten);
    const { subject, body } = renderEmailTemplates(DEFAULT_EMAIL_CONFIG, context);
    expect(subject).toContain('Freiwillige Feuerwehr Musterdorf');
    expect(body).toContain('AT40 3300 0000 0202 0402');
    expect(body).toContain('RLBBAT2E');
  });

  it('trägt keine feste Bankverbindung mehr im Vorlagentext', () => {
    // Genau der Fehler, den diese Umstellung abstellt: Eine hier eingetippte
    // IBAN stünde in der Mail jeder Gruppe.
    expect(DEFAULT_EMAIL_CONFIG.bodyTemplate).not.toContain('AT40');
    expect(DEFAULT_EMAIL_CONFIG.bodyTemplate).not.toContain('RLBBAT2E');
    expect(DEFAULT_EMAIL_CONFIG.fromEmail).toBe('');
  });

  it('nimmt den Absender als Kontoinhaber, wenn keiner gepflegt ist', () => {
    const context = buildTemplateContext(calculation, firecall, stammdaten);
    expect(context.absender.kontoinhaber).toBe('Freiwillige Feuerwehr Musterdorf');
  });
});
