import { describe, expect, it } from 'vitest';
import {
  type AtemschutzGeraet,
  type AtemschutzTrupp,
  type FuellungInput,
  canTransition,
  entsendePatch,
  findByCode,
  gruppiereTrupps,
  lookupKeys,
  matchGeraete,
  nextBereitstellung,
  normalizeCode,
  rueckkehrPatch,
  validateFuellungInput,
} from './atemschutz';

function geraet(over: Partial<AtemschutzGeraet> = {}): AtemschutzGeraet {
  return {
    id: 'g1',
    typ: 'flasche',
    bezeichnung: 'Atemluftflasche Stahl 6 l',
    feuerwehr: 'Neusiedl am See',
    active: true,
    createdAt: '2026-08-29T10:00:00.000Z',
    createdBy: 'u1',
    updatedAt: '2026-08-29T10:00:00.000Z',
    updatedBy: 'u1',
    ...over,
  };
}

describe('normalizeCode', () => {
  it('vereinheitlicht Groß-/Kleinschreibung und Trennzeichen', () => {
    expect(normalizeCode('AF-2.16.19')).toBe('AF21619');
    expect(normalizeCode('af 2.16.19')).toBe('AF21619');
    expect(normalizeCode(' 2.16.19 ')).toBe('21619');
  });

  it('liefert für leere Eingabe einen leeren String', () => {
    expect(normalizeCode('')).toBe('');
    expect(normalizeCode('   ')).toBe('');
  });
});

describe('lookupKeys', () => {
  it('sammelt alle sechs Kennungen', () => {
    const keys = lookupKeys(
      geraet({
        nummer: '2.16.19',
        inventarNr: '2016-FL-019',
        zusatzInventarNr: 'AF-2.16.19',
        seriennummer: 'BA66937',
        externeId: '96176',
        barcodes: ['4026056001293'],
      }),
    );
    expect(keys).toContain('21619');
    expect(keys).toContain('2016FL019');
    expect(keys).toContain('AF21619');
    expect(keys).toContain('BA66937');
    expect(keys).toContain('96176');
    expect(keys).toContain('4026056001293');
  });

  it('nimmt jeden Eintrag aus barcodes einzeln auf', () => {
    const keys = lookupKeys(geraet({ barcodes: ['AAA111', 'BBB222'] }));
    expect(keys).toContain('AAA111');
    expect(keys).toContain('BBB222');
  });

  it('erzeugt keine leeren Schlüssel', () => {
    const keys = lookupKeys(geraet({ nummer: '', barcodes: ['', '  '] }));
    expect(keys).not.toContain('');
    expect(keys).toHaveLength(0);
  });
});

describe('findByCode', () => {
  const a = geraet({ id: 'a', nummer: '2.16.19' });
  const b = geraet({ id: 'b', nummer: '2.16.20', barcodes: ['4026056001293'] });
  const c = geraet({ id: 'c', nummer: '2.16.21', barcodes: ['4026056001293'] });

  it('findet über einen gepflegten Barcode', () => {
    expect(findByCode([a, b], '4026056001293').map((g) => g.id)).toEqual(['b']);
  });

  it('findet über die Flaschennummer trotz abweichender Trennzeichen', () => {
    expect(findByCode([a, b], '2-16-19').map((g) => g.id)).toEqual(['a']);
    expect(findByCode([a, b], ' 2.16.19 ').map((g) => g.id)).toEqual(['a']);
  });

  it('trifft einen Präfix-Code über die Zusatz-Inventar-Nr.', () => {
    // Der Aufdruck trägt oft ein "AF-" vor der Nummer; im Export steht genau
    // das in der Zusatz-Inventar-Nr. Ein Scan muss exakt treffen — sonst
    // fände "AF-2.16.19" auch die Flasche 2.16.19 einer anderen Wehr.
    const mitPraefix = geraet({ id: 'p', zusatzInventarNr: 'AF-2.16.19' });
    expect(findByCode([a, mitPraefix], 'AF-2.16.19').map((g) => g.id)).toEqual([
      'p',
    ]);
    expect(findByCode([a], 'AF-2.16.19')).toEqual([]);
  });

  it('liefert alle Treffer, wenn sich mehrere Geräte einen Code teilen', () => {
    // Eine EAN-13 bezeichnet den Artikeltyp, nicht das einzelne Stück.
    expect(findByCode([a, b, c], '4026056001293').map((g) => g.id)).toEqual([
      'b',
      'c',
    ]);
  });

  it('liefert für einen unbekannten Code eine leere Liste', () => {
    expect(findByCode([a, b], '9999999')).toEqual([]);
  });

  it('liefert für eine leere Eingabe eine leere Liste', () => {
    expect(findByCode([a, b], '  ')).toEqual([]);
  });
});

describe('matchGeraete', () => {
  const flasche = geraet({
    id: 'f',
    nummer: '2.16.19',
    inventarNr: '2016-FL-019',
    seriennummer: 'BA66937',
    externeId: '96176',
    feuerwehr: 'Neusiedl am See',
    bezeichnung: 'Atemluftflasche Stahl 6 l',
  });
  const fremd = geraet({
    id: 'j',
    nummer: '2.11.03',
    feuerwehr: 'Jois',
    bezeichnung: 'Atemluftflasche CFK 6,8 l',
  });

  it('findet über einen Teil der Flaschennummer', () => {
    expect(matchGeraete([flasche, fremd], '2.16').map((g) => g.id)).toEqual([
      'f',
    ]);
  });

  it('findet über einen Teil der Inventar-Nr.', () => {
    expect(matchGeraete([flasche, fremd], 'FL-019').map((g) => g.id)).toEqual([
      'f',
    ]);
  });

  it('findet über die Seriennummer und die externe ID', () => {
    expect(matchGeraete([flasche, fremd], 'ba669').map((g) => g.id)).toEqual([
      'f',
    ]);
    expect(matchGeraete([flasche, fremd], '96176').map((g) => g.id)).toEqual([
      'f',
    ]);
  });

  it('findet über die Feuerwehr', () => {
    // Der ausdrückliche Wunsch: am Sammelplatz weiß man oft nur die Wehr.
    expect(matchGeraete([flasche, fremd], 'jois').map((g) => g.id)).toEqual([
      'j',
    ]);
  });

  it('findet über die Bezeichnung', () => {
    expect(matchGeraete([flasche, fremd], 'CFK').map((g) => g.id)).toEqual([
      'j',
    ]);
  });

  it('ignoriert Trennzeichen in der Eingabe', () => {
    expect(matchGeraete([flasche, fremd], '2-16-19').map((g) => g.id)).toEqual([
      'f',
    ]);
  });

  it('gibt bei leerer Eingabe alles zurück', () => {
    expect(matchGeraete([flasche, fremd], '')).toHaveLength(2);
  });

  it('begrenzt die Trefferzahl', () => {
    const viele = Array.from({ length: 200 }, (_, i) =>
      geraet({ id: `g${i}`, nummer: `2.16.${i}` }),
    );
    expect(matchGeraete(viele, '2.16', 25)).toHaveLength(25);
  });
});

describe('validateFuellungInput', () => {
  const gueltig: FuellungInput = {
    flaschenNummer: '2.16.19',
    feuerwehr: 'Neusiedl am See',
    anzahl: 1,
    startdruck: 50,
    enddruck: 300,
    gefuelltVon: 'Max Muster',
  };

  it('akzeptiert eine vollständige Eingabe', () => {
    expect(validateFuellungInput(gueltig)).toEqual([]);
  });

  it('akzeptiert eine Eingabe nur mit Flaschennummer', () => {
    expect(validateFuellungInput({ ...gueltig, feuerwehr: undefined })).toEqual(
      [],
    );
  });

  it('akzeptiert eine Eingabe nur mit Feuerwehr', () => {
    // Der Fall "fünf Flaschen der FF XY ohne Nummern".
    expect(
      validateFuellungInput({
        ...gueltig,
        flaschenNummer: undefined,
        anzahl: 5,
      }),
    ).toEqual([]);
  });

  it('lehnt eine Eingabe ohne Nummer und ohne Feuerwehr ab', () => {
    expect(
      validateFuellungInput({
        ...gueltig,
        flaschenNummer: '  ',
        feuerwehr: '',
      }),
    ).toEqual(['identifierMissing']);
  });

  it('lehnt eine Anzahl unter 1 und über der Obergrenze ab', () => {
    expect(validateFuellungInput({ ...gueltig, anzahl: 0 })).toEqual([
      'anzahlInvalid',
    ]);
    expect(validateFuellungInput({ ...gueltig, anzahl: 100 })).toEqual([
      'anzahlInvalid',
    ]);
  });

  it('lehnt einen Enddruck von 0 oder darunter ab', () => {
    expect(validateFuellungInput({ ...gueltig, enddruck: 0 })).toEqual([
      'enddruckInvalid',
    ]);
  });

  it('akzeptiert eine fehlende Angabe des Startdrucks', () => {
    // Am Sammelplatz zählt Tempo — ein nicht abgelesener Startdruck darf die
    // Eingabe nicht blockieren.
    expect(validateFuellungInput({ ...gueltig, startdruck: undefined })).toEqual(
      [],
    );
  });

  it('lehnt einen Startdruck über dem Enddruck ab', () => {
    expect(
      validateFuellungInput({ ...gueltig, startdruck: 310, enddruck: 300 }),
    ).toEqual(['startdruckAboveEnddruck']);
  });

  it('lehnt eine Füllung ohne Füller ab', () => {
    expect(validateFuellungInput({ ...gueltig, gefuelltVon: ' ' })).toEqual([
      'gefuelltVonMissing',
    ]);
  });
});

function trupp(over: Partial<AtemschutzTrupp> = {}): AtemschutzTrupp {
  return {
    id: 't1',
    truppKey: 'k1',
    laufendeNummer: 1,
    feuerwehr: 'Neusiedl am See',
    mitglieder: ['Anna Beispiel', 'Bernd Beispiel', 'Clara Beispiel'],
    status: 'bereit',
    bereitSeit: '2026-08-29T10:00:00.000Z',
    createdAt: '2026-08-29T10:00:00.000Z',
    createdBy: 'u1',
    updatedAt: '2026-08-29T10:00:00.000Z',
    updatedBy: 'u1',
    ...over,
  };
}

describe('canTransition', () => {
  it('erlaubt bereit → imEinsatz und imEinsatz → zurueck', () => {
    expect(canTransition('bereit', 'imEinsatz')).toBe(true);
    expect(canTransition('imEinsatz', 'zurueck')).toBe(true);
  });

  it('erlaubt das Abmelden aus bereit und zurueck', () => {
    expect(canTransition('bereit', 'abgemeldet')).toBe(true);
    expect(canTransition('zurueck', 'abgemeldet')).toBe(true);
  });

  it('verbietet das Abmelden mitten im Einsatz', () => {
    // Ein Trupp im Einsatz muss erst zurückkommen — sonst behauptet das
    // Protokoll, niemand sei mehr draußen.
    expect(canTransition('imEinsatz', 'abgemeldet')).toBe(false);
  });

  it('verbietet den Rückweg von zurueck nach bereit', () => {
    // Wieder bereitstellen erzeugt eine neue Zeile, siehe nextBereitstellung.
    expect(canTransition('zurueck', 'bereit')).toBe(false);
  });

  it('verbietet jeden Wechsel aus abgemeldet', () => {
    expect(canTransition('abgemeldet', 'bereit')).toBe(false);
    expect(canTransition('abgemeldet', 'imEinsatz')).toBe(false);
  });
});

describe('entsendePatch', () => {
  it('setzt Gruppenkommandant, Zeit und Druck', () => {
    const patch = entsendePatch({
      entsendetAn: 'GRKDT Huber',
      abmarschZeit: '2026-08-29T10:30:00.000Z',
      druckAbmarsch: 290,
    });
    expect(patch).toEqual({
      status: 'imEinsatz',
      entsendetAn: 'GRKDT Huber',
      abmarschZeit: '2026-08-29T10:30:00.000Z',
      druckAbmarsch: 290,
    });
  });

  it('lässt einen nicht abgelesenen Druck weg statt undefined zu schreiben', () => {
    // Firestore lehnt `undefined` ab — dieselbe Vorsicht wie in
    // buildMangelDocument.
    const patch = entsendePatch({
      entsendetAn: 'GRKDT Huber',
      abmarschZeit: '2026-08-29T10:30:00.000Z',
    });
    expect(patch).not.toHaveProperty('druckAbmarsch');
  });
});

describe('rueckkehrPatch', () => {
  it('setzt Rückkehrzeit und Druck', () => {
    expect(
      rueckkehrPatch({
        rueckkehrZeit: '2026-08-29T11:00:00.000Z',
        druckRueckkehr: 80,
      }),
    ).toEqual({
      status: 'zurueck',
      rueckkehrZeit: '2026-08-29T11:00:00.000Z',
      druckRueckkehr: 80,
    });
  });
});

describe('nextBereitstellung', () => {
  const zurueck = trupp({
    id: 't1',
    status: 'zurueck',
    laufendeNummer: 2,
    entsendetAn: 'GRKDT Huber',
    abmarschZeit: '2026-08-29T10:30:00.000Z',
    druckAbmarsch: 290,
    rueckkehrZeit: '2026-08-29T11:00:00.000Z',
    druckRueckkehr: 80,
    bemerkung: 'Rauchgasdurchzündung',
  });

  it('übernimmt die Basisdaten und zählt die laufende Nummer hoch', () => {
    const neu = nextBereitstellung(zurueck, '2026-08-29T11:30:00.000Z');
    expect(neu.truppKey).toBe('k1');
    expect(neu.laufendeNummer).toBe(3);
    expect(neu.feuerwehr).toBe('Neusiedl am See');
    expect(neu.mitglieder).toEqual(zurueck.mitglieder);
    expect(neu.status).toBe('bereit');
    expect(neu.bereitSeit).toBe('2026-08-29T11:30:00.000Z');
  });

  it('trägt keine Zeiten und keinen Druck der alten Zeile mit', () => {
    const neu = nextBereitstellung(zurueck, '2026-08-29T11:30:00.000Z');
    expect(neu).not.toHaveProperty('entsendetAn');
    expect(neu).not.toHaveProperty('abmarschZeit');
    expect(neu).not.toHaveProperty('druckAbmarsch');
    expect(neu).not.toHaveProperty('rueckkehrZeit');
    expect(neu).not.toHaveProperty('druckRueckkehr');
    expect(neu).not.toHaveProperty('bemerkung');
  });

  it('trägt keine id mit — es entsteht ein neues Dokument', () => {
    expect(
      nextBereitstellung(zurueck, '2026-08-29T11:30:00.000Z'),
    ).not.toHaveProperty('id');
  });

  it('lässt die alte Zeile unverändert', () => {
    const vorher = JSON.stringify(zurueck);
    nextBereitstellung(zurueck, '2026-08-29T11:30:00.000Z');
    expect(JSON.stringify(zurueck)).toBe(vorher);
  });
});

describe('gruppiereTrupps', () => {
  it('teilt nach Status und lässt Abgemeldete aus den Abschnitten heraus', () => {
    const bereit = trupp({ id: 'a', status: 'bereit' });
    const imEinsatz = trupp({ id: 'b', status: 'imEinsatz' });
    const zurueck = trupp({ id: 'c', status: 'zurueck' });
    const abgemeldet = trupp({ id: 'd', status: 'abgemeldet' });

    const gruppen = gruppiereTrupps([abgemeldet, zurueck, imEinsatz, bereit]);
    expect(gruppen.bereit.map((t) => t.id)).toEqual(['a']);
    expect(gruppen.imEinsatz.map((t) => t.id)).toEqual(['b']);
    expect(gruppen.zurueck.map((t) => t.id)).toEqual(['c']);
    // Alle vier stehen im Protokoll. Die Reihenfolge wird hier nicht geprüft:
    // Sie hängt an `bereitSeit`, und das ist bei allen vier gleich.
    expect(gruppen.protokoll.map((t) => t.id).sort()).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });

  it('sortiert das Protokoll neueste Bereitstellung zuerst', () => {
    const alt = trupp({ id: 'alt', bereitSeit: '2026-08-29T09:00:00.000Z' });
    const neu = trupp({ id: 'neu', bereitSeit: '2026-08-29T11:00:00.000Z' });
    expect(gruppiereTrupps([alt, neu]).protokoll.map((t) => t.id)).toEqual([
      'neu',
      'alt',
    ]);
  });
});
