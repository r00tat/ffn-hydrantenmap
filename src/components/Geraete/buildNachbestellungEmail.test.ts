import { describe, expect, it } from 'vitest';
import {
  buildNachbestellungEmail,
  type NachbestellungItem,
} from './buildNachbestellungEmail';

const bindevlies: NachbestellungItem = {
  geraetId: 'g1',
  bezeichnung: 'Bindevlies Economy',
  inventarNr: 'INV-0815',
  bestandGesamt: 2,
  mindestbestand: 5,
  einheit: 'Sack',
};

function decodeBody(raw: string): string {
  const part = raw.split('\r\n\r\n').pop()!.split('\r\n--')[0];
  return Buffer.from(part, 'base64').toString();
}

function decodeSubject(raw: string): string {
  const match = raw.match(/Subject: =\?UTF-8\?B\?(.+)\?=/);
  return Buffer.from(match![1], 'base64').toString();
}

const base = {
  groupId: 'ffnd',
  appBaseUrl: 'https://karte.example.at/',
  from: 'noreply@example.at',
  to: 'zeugwart@example.at',
};

describe('buildNachbestellungEmail', () => {
  it('nennt einen einzelnen Artikel im Betreff', () => {
    const { subject, raw } = buildNachbestellungEmail({
      ...base,
      items: [bindevlies],
    });
    expect(subject).toBe('[Nachbestellen] Bindevlies Economy');
    expect(decodeSubject(raw)).toBe(subject);
  });

  it('zählt mehrere Artikel im Betreff', () => {
    const { subject } = buildNachbestellungEmail({
      ...base,
      items: [bindevlies, { ...bindevlies, geraetId: 'g2', bezeichnung: 'Filter' }],
    });
    expect(subject).toBe('[Nachbestellen] 2 Artikel unter Mindestbestand');
  });

  it('listet Bestand, Mindestbestand und Einheit je Artikel', () => {
    const { body } = buildNachbestellungEmail({ ...base, items: [bindevlies] });
    expect(body).toContain('Bindevlies Economy (Inv.-Nr. INV-0815)');
    expect(body).toContain('Bestand 2 Sack, Mindestbestand 5 Sack');
  });

  it('nennt Einsatz und Gruppe, wenn bekannt', () => {
    const { body } = buildNachbestellungEmail({
      ...base,
      items: [bindevlies],
      firecallName: 'Ölspur B50',
      groupName: 'FF Neusiedl am See',
    });
    expect(body).toContain('Einsatz:  Ölspur B50');
    expect(body).toContain('Gruppe:   FF Neusiedl am See');
  });

  it('verlinkt die Lagerseite ohne doppelten Schrägstrich', () => {
    const { body } = buildNachbestellungEmail({ ...base, items: [bindevlies] });
    expect(body).toContain('https://karte.example.at/geraete');
    expect(body).not.toContain('.at//geraete');
  });

  it('setzt Empfänger, Cc und kodiert den Text base64', () => {
    const { raw, body } = buildNachbestellungEmail({
      ...base,
      cc: ['kommandant@example.at'],
      items: [bindevlies],
    });
    expect(raw).toContain('From: noreply@example.at');
    expect(raw).toContain('To: zeugwart@example.at');
    expect(raw).toContain('Cc: kommandant@example.at');
    expect(decodeBody(raw)).toBe(body);
  });

  it('lässt Cc weg, wenn es keine weiteren Empfänger gibt', () => {
    const { raw } = buildNachbestellungEmail({ ...base, items: [bindevlies] });
    expect(raw).not.toContain('Cc:');
  });
});
