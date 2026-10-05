import { describe, it, expect } from 'vitest';
import {
  applyBerichtText,
  hasSybosBerichtText,
  planBerichtText,
  SYBOS_BERICHT_FIELDS,
} from './sybos-bericht-text';

function makeDoc(bodyHtml: string): Document {
  return new DOMParser().parseFromString(
    `<html><body>${bodyHtml}</body></html>`,
    'text/html'
  );
}

/**
 * The Einsatz detail page (`frmEinsatzAdd`, `edit=1`) — reduced to the two
 * text areas, the hidden helper area of SYBOS's big text editor, and a
 * neighbour that must stay untouched.
 */
function berichtDoc({
  ablauf = '',
  taetigkeit = '',
}: { ablauf?: string; taetigkeit?: string } = {}): Document {
  return makeDoc(`
    <form name="frmMain">
      <textarea id="ESunfallhergang" name="ESunfallhergang">${ablauf}</textarea>
      <textarea id="area_ESunfallhergang"></textarea>
      <textarea id="ESbemerkungIntern" name="ESbemerkungIntern">${taetigkeit}</textarea>
      <textarea id="ESbemerk" name="ESbemerk">Chlorgasaustritt</textarea>
    </form>
  `);
}

function value(doc: Document, name: string): string {
  return doc.querySelector<HTMLTextAreaElement>(`textarea[name="${name}"]`)!.value;
}

describe('hasSybosBerichtText', () => {
  it('erkennt die Seite an den beiden Textfeldern', () => {
    expect(hasSybosBerichtText(berichtDoc())).toBe(true);
    expect(hasSybosBerichtText(makeDoc('<form name="frmMain"></form>'))).toBe(false);
  });
});

describe('planBerichtText', () => {
  it('trägt beide Texte in leere Felder ein, ohne Konflikt', () => {
    const plan = planBerichtText(berichtDoc(), {
      einsatzablauf: 'Um 21:06 Uhr alarmiert.',
      taetigkeit: 'Dekonplatz aufgebaut.',
    });

    expect(plan).toEqual({
      write: ['einsatzablauf', 'taetigkeit'],
      conflicts: [],
      unchanged: [],
      empty: [],
    });
  });

  it('meldet anderen Text, der schon in SYBOS steht, als Konflikt', () => {
    const plan = planBerichtText(
      berichtDoc({ ablauf: 'Von Hand geschrieben', taetigkeit: 'Dekonplatz aufgebaut.' }),
      { einsatzablauf: 'Neu', taetigkeit: 'Dekonplatz aufgebaut.' }
    );

    expect(plan.write).toEqual(['einsatzablauf']);
    expect(plan.conflicts).toEqual(['einsatzablauf']);
    expect(plan.unchanged).toEqual(['taetigkeit']);
  });

  it('vergleicht ohne Rücksicht auf Zeilenenden und Leerraum am Rand', () => {
    const plan = planBerichtText(berichtDoc({ ablauf: 'Zeile 1\r\nZeile 2  ' }), {
      einsatzablauf: 'Zeile 1\nZeile 2',
      taetigkeit: '',
    });

    expect(plan.write).toEqual([]);
    expect(plan.unchanged).toEqual(['einsatzablauf']);
    expect(plan.empty).toEqual(['taetigkeit']);
  });

  it('lässt ein Feld weg, wenn die Einsatzkarte keinen Text hat', () => {
    const plan = planBerichtText(berichtDoc({ taetigkeit: 'Schon in SYBOS' }), {
      einsatzablauf: 'Neu',
      taetigkeit: '   ',
    });

    expect(plan.write).toEqual(['einsatzablauf']);
    expect(plan.empty).toEqual(['taetigkeit']);
    expect(plan.conflicts).toEqual([]);
  });
});

describe('applyBerichtText', () => {
  it('schreibt nur die genannten Felder und lässt die übrigen stehen', () => {
    const doc = berichtDoc({ taetigkeit: 'Schon in SYBOS' });

    applyBerichtText(doc, { einsatzablauf: 'Zeile 1\nZeile 2', taetigkeit: 'Neu' }, [
      'einsatzablauf',
    ]);

    expect(value(doc, SYBOS_BERICHT_FIELDS.einsatzablauf)).toBe('Zeile 1\nZeile 2');
    expect(value(doc, SYBOS_BERICHT_FIELDS.taetigkeit)).toBe('Schon in SYBOS');
    expect(value(doc, 'ESbemerk')).toBe('Chlorgasaustritt');
  });

  it('löst input und change aus, damit SYBOS die Änderung bemerkt', () => {
    const doc = berichtDoc();
    const events: string[] = [];
    const area = doc.querySelector<HTMLTextAreaElement>('textarea[name="ESunfallhergang"]')!;
    area.addEventListener('input', () => events.push('input'));
    area.addEventListener('change', () => events.push('change'));

    applyBerichtText(doc, { einsatzablauf: 'Text', taetigkeit: '' }, ['einsatzablauf']);

    expect(events).toEqual(['input', 'change']);
  });

  it('übernimmt den Text getrimmt', () => {
    const doc = berichtDoc();

    applyBerichtText(doc, { einsatzablauf: '  Text \n', taetigkeit: '' }, ['einsatzablauf']);

    expect(value(doc, SYBOS_BERICHT_FIELDS.einsatzablauf)).toBe('Text');
  });
});
