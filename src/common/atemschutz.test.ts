import { describe, expect, it } from 'vitest';
import {
  MAX_TRUPP_MITGLIEDER,
  MAX_UEBERWACHUNG_UIDS,
  type AtemschutzGeraet,
  type AtemschutzTrupp,
  type FuellungInput,
  type TruppInput,
  braucheDatum,
  buildDruckabfrage,
  canTransition,
  darfFuellungAendern,
  entsendePatch,
  erneuterEinsatz,
  findByCode,
  fuellungSperre,
  geraetDetails,
  geraetKennung,
  gruppiereTrupps,
  istGueltigeUid,
  lookupKeys,
  matchGeraete,
  mitUeberwachungsUid,
  nextBereitstellung,
  normalizeCode,
  rueckkehrPatch,
  sanitizeMitglieder,
  sanitizePersonen,
  sanitizeTruppGeraete,
  sanitizeUeberwachungUids,
  truppGeraetLabel,
  truppGeraetVonGeraet,
  uebernahmePatch,
  validateDruckabfrage,
  validateFuellungInput,
  validateTruppInput,
  verrechnenVorgabe,
  waehleFuellstation,
  zweckOf,
  zweckVorgabe,
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
    verrechnen: false,
    zweck: 'sonstiges',
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

describe('erneuterEinsatz', () => {
  const zurueck = trupp({
    id: 't1',
    status: 'zurueck',
    laufendeNummer: 1,
    entsendetAn: 'LFA',
    einsatzziel: 'Stiegenhaus 3. OG',
    ueberwachtVon: 'GRKDT Huber',
    ueberwachungSeit: '2026-08-29T10:20:00.000Z',
    ueberwachungUids: ['u1'],
    paTyp: 'langzeit300',
    flaschenAnzahl: 2,
    flaschenVolumen: 6.8,
    fuellDruck: 300,
    abmarschZeit: '2026-08-29T10:30:00.000Z',
    druckAbmarsch: 290,
    rueckkehrZeit: '2026-08-29T11:00:00.000Z',
    druckRueckkehr: 80,
    abfragen: [{ zeitpunkt: '2026-08-29T10:40:00.000Z', druck: 240 }],
    warnungen: { drittel: '2026-08-29T10:38:00.000Z' },
  });

  const entsendung = entsendePatch({
    abmarschZeit: '2026-08-29T11:40:00.000Z',
    druckAbmarsch: 300,
  });

  it('legt eine neue Zeile an, die sofort im Einsatz ist', () => {
    const neu = erneuterEinsatz({
      vorherige: zurueck,
      jetzt: '2026-08-29T11:40:00.000Z',
      entsendung,
    });
    expect(neu.laufendeNummer).toBe(2);
    expect(neu.truppKey).toBe('k1');
    expect(neu.status).toBe('imEinsatz');
    expect(neu.abmarschZeit).toBe('2026-08-29T11:40:00.000Z');
    expect(neu.druckAbmarsch).toBe(300);
    expect(neu).not.toHaveProperty('id');
  });

  it('übernimmt Gerätesatz und Einheit — das bleibt derselbe Trupp', () => {
    const neu = erneuterEinsatz({
      vorherige: zurueck,
      jetzt: '2026-08-29T11:40:00.000Z',
      entsendung,
    });
    expect(neu.paTyp).toBe('langzeit300');
    expect(neu.flaschenAnzahl).toBe(2);
    expect(neu.flaschenVolumen).toBe(6.8);
    expect(neu.fuellDruck).toBe(300);
    expect(neu.entsendetAn).toBe('LFA');
    expect(neu.ueberwachtVon).toBe('GRKDT Huber');
  });

  it('führt die Zeitkontrolle weiter und nimmt den Anleger dazu', () => {
    const neu = erneuterEinsatz({
      vorherige: zurueck,
      jetzt: '2026-08-29T11:40:00.000Z',
      entsendung,
      uid: 'u2',
    });
    // Auf der neuen Zeile beginnt die Kontrolle jetzt — die alte Übernahme
    // gilt für die alte Bereitstellung.
    expect(neu.ueberwachungSeit).toBe('2026-08-29T11:40:00.000Z');
    expect(neu.ueberwachungUids).toEqual(['u1', 'u2']);
  });

  it('trägt Messwerte, Warnungen und das alte Einsatzziel nicht mit', () => {
    const neu = erneuterEinsatz({
      vorherige: zurueck,
      jetzt: '2026-08-29T11:40:00.000Z',
      entsendung,
    });
    expect(neu).not.toHaveProperty('abfragen');
    expect(neu).not.toHaveProperty('warnungen');
    expect(neu).not.toHaveProperty('rueckkehrZeit');
    expect(neu).not.toHaveProperty('druckRueckkehr');
    // Das Einsatzziel ist der Auftrag *dieser* Entsendung: Der zweite Einsatz
    // führt den Trupp oft woandershin, und ein stehengebliebenes „Stiegenhaus
    // 3. OG" wäre eine Behauptung.
    expect(neu).not.toHaveProperty('einsatzziel');
  });

  it('lässt die alte Zeile unverändert', () => {
    const vorher = JSON.stringify(zurueck);
    erneuterEinsatz({
      vorherige: zurueck,
      jetzt: '2026-08-29T11:40:00.000Z',
      entsendung,
    });
    expect(JSON.stringify(zurueck)).toBe(vorher);
  });
});

describe('gruppiereTrupps', () => {
  it('teilt nach Status und lässt Abgemeldete aus den Abschnitten heraus', () => {
    // Vier verschiedene Trupps: Gleicher `truppKey` hieße, es wäre viermal
    // derselbe, und dann zählte nur die jüngste Bereitstellung.
    const bereit = trupp({ id: 'a', truppKey: 'ka', status: 'bereit' });
    const imEinsatz = trupp({ id: 'b', truppKey: 'kb', status: 'imEinsatz' });
    const zurueck = trupp({ id: 'c', truppKey: 'kc', status: 'zurueck' });
    const abgemeldet = trupp({ id: 'd', truppKey: 'kd', status: 'abgemeldet' });

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
    const alt = trupp({
      id: 'alt',
      truppKey: 'ka',
      bereitSeit: '2026-08-29T09:00:00.000Z',
    });
    const neu = trupp({
      id: 'neu',
      truppKey: 'kb',
      bereitSeit: '2026-08-29T11:00:00.000Z',
    });
    expect(gruppiereTrupps([alt, neu]).protokoll.map((t) => t.id)).toEqual([
      'neu',
      'alt',
    ]);
  });

  it('zeigt einen erneut entsendeten Trupp nur einmal', () => {
    // Der gemeldete Fall: Trupp 1 kommt zurück, wird wieder bereitgestellt und
    // geht erneut hinaus. Die alte Zeile steht auf `zurueck` — er darf nicht
    // gleichzeitig unter „Im Einsatz" und unter „Zurück & Regeneration"
    // stehen, sonst zählt die Tafel einen Trupp zu viel.
    const erste = trupp({
      id: '1',
      laufendeNummer: 1,
      status: 'zurueck',
      bereitSeit: '2026-08-29T10:00:00.000Z',
    });
    const zweite = trupp({
      id: '2',
      laufendeNummer: 2,
      status: 'imEinsatz',
      bereitSeit: '2026-08-29T11:00:00.000Z',
    });

    const gruppen = gruppiereTrupps([erste, zweite]);
    expect(gruppen.imEinsatz.map((t) => t.id)).toEqual(['2']);
    expect(gruppen.zurueck).toEqual([]);
    // Als Nachweis bleiben beide Zeilen im Protokoll stehen.
    expect(gruppen.protokoll.map((t) => t.id)).toEqual(['2', '1']);
  });

  it('entscheidet über die laufende Nummer, nicht über die Reihenfolge', () => {
    // Zwei Bereitstellungen in derselben Sekunde — dann trägt nur die
    // laufende Nummer.
    const erste = trupp({ id: '1', laufendeNummer: 1, status: 'zurueck' });
    const zweite = trupp({ id: '2', laufendeNummer: 2, status: 'bereit' });
    const gruppen = gruppiereTrupps([zweite, erste]);
    expect(gruppen.bereit.map((t) => t.id)).toEqual(['2']);
    expect(gruppen.zurueck).toEqual([]);
  });
});

describe('validateTruppInput', () => {
  const gueltig: TruppInput = {
    feuerwehr: 'Neusiedl am See',
    mitglieder: ['Anna Beispiel', 'Bernd Beispiel', 'Clara Beispiel'],
  };

  it('akzeptiert einen vollständigen Trupp', () => {
    expect(validateTruppInput(gueltig)).toEqual([]);
  });

  it('akzeptiert einen Trupp mit nur einem Mitglied', () => {
    // Ein Sicherheitstrupp aus zweien und ein einzelner Melder kommen vor —
    // die Zahl drei ist der Regelfall, keine Vorschrift für dieses Formular.
    expect(validateTruppInput({ ...gueltig, mitglieder: ['Anna'] })).toEqual([]);
  });

  it('lehnt einen Trupp ohne Feuerwehr ab', () => {
    expect(validateTruppInput({ ...gueltig, feuerwehr: ' ' })).toEqual([
      'feuerwehrMissing',
    ]);
  });

  it('lehnt einen Trupp ohne Mitglieder ab', () => {
    expect(validateTruppInput({ ...gueltig, mitglieder: [] })).toEqual([
      'mitgliederMissing',
    ]);
    expect(
      validateTruppInput({ ...gueltig, mitglieder: ['', '  '] }),
    ).toEqual(['mitgliederMissing']);
  });
});

describe('sanitizeMitglieder', () => {
  it('entfernt Leerzeilen und Randleerzeichen', () => {
    expect(sanitizeMitglieder([' Anna ', '', '  ', 'Bernd'])).toEqual([
      'Anna',
      'Bernd',
    ]);
  });

  it('begrenzt auf die Höchstzahl', () => {
    expect(
      sanitizeMitglieder(['a', 'b', 'c', 'd', 'e', 'f']),
    ).toHaveLength(MAX_TRUPP_MITGLIEDER);
  });
});

describe('geraetKennung', () => {
  it('nimmt die Flaschennummer', () => {
    expect(geraetKennung(geraet({ nummer: '2.16.03' }))).toBe('2.16.03');
  });

  it('fällt auf die Inventarnummer zurück', () => {
    expect(
      geraetKennung(
        geraet({ nummer: undefined, inventarNr: '2016-FL-003' }),
      ),
    ).toBe('2016-FL-003');
  });

  it('fällt auf die Seriennummer zurück', () => {
    expect(
      geraetKennung(
        geraet({
          nummer: undefined,
          inventarNr: undefined,
          seriennummer: 'BA66937',
        }),
      ),
    ).toBe('BA66937');
  });

  it('liefert nichts, wenn keine Kennung gepflegt ist', () => {
    expect(
      geraetKennung(
        geraet({ nummer: undefined, inventarNr: undefined, seriennummer: undefined }),
      ),
    ).toBeUndefined();
  });
});

describe('geraetDetails', () => {
  it('stellt die Bezeichnung voran und lässt Leeres weg', () => {
    expect(
      geraetDetails(
        geraet({
          bezeichnung: 'Atemluftflasche CFK 6,8 l',
          feuerwehr: 'Bezirksreserve',
          inventarNr: '2901-FL-001',
          seriennummer: undefined,
        }),
      ),
    ).toBe('Atemluftflasche CFK 6,8 l · Bezirksreserve · 2901-FL-001');
  });
});

describe('sanitizePersonen', () => {
  it('entfernt Leeres und Randleerzeichen', () => {
    expect(sanitizePersonen([' Anna ', '', '  ', 'Bernd'])).toEqual([
      'Anna',
      'Bernd',
    ]);
  });

  it('wirft Dubletten ohne Rücksicht auf die Schreibweise weg', () => {
    expect(sanitizePersonen(['Anna Huber', 'anna huber', 'Bernd'])).toEqual([
      'Anna Huber',
      'Bernd',
    ]);
  });

  it('kürzt auf die Höchstzahl', () => {
    expect(sanitizePersonen(['a', 'b', 'c'], 2)).toEqual(['a', 'b']);
  });

  it('lässt ohne Höchstzahl alles stehen', () => {
    expect(sanitizePersonen(['a', 'b', 'c', 'd', 'e'])).toHaveLength(5);
  });
});

describe('waehleFuellstation', () => {
  const station = (id: string, active = true): AtemschutzGeraet => ({
    id,
    typ: 'fuellstation',
    bezeichnung: `Kompressor ${id}`,
    feuerwehr: 'Neusiedl am See',
    active,
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
  });

  it('meldet "keine" bei leerer Liste', () => {
    const r = waehleFuellstation([], undefined);
    expect(r.modus).toBe('keine');
    expect(r.station).toBeUndefined();
    expect(r.optionen).toEqual([]);
  });

  it('ordnet eine einzige Station fest zu', () => {
    const a = station('a');
    const r = waehleFuellstation([a], undefined);
    expect(r.modus).toBe('fest');
    expect(r.station?.id).toBe('a');
  });

  it('zählt inaktive Stationen nicht mit', () => {
    const r = waehleFuellstation([station('a'), station('b', false)], undefined);
    expect(r.modus).toBe('fest');
    expect(r.station?.id).toBe('a');
  });

  it('bietet bei mehreren zur Auswahl und nimmt die letzte Wahl vorweg', () => {
    const r = waehleFuellstation([station('a'), station('b')], 'b');
    expect(r.modus).toBe('auswahl');
    expect(r.station?.id).toBe('b');
    expect(r.optionen).toHaveLength(2);
  });

  it('fällt bei unbekannter letzter Wahl auf die erste Station zurück', () => {
    const r = waehleFuellstation([station('a'), station('b')], 'weg');
    expect(r.modus).toBe('auswahl');
    expect(r.station?.id).toBe('a');
  });
});

describe('verrechnenVorgabe', () => {
  const eigene = 'Neusiedl am See';

  it('ist im Einsatz immer aus, auch bei fremder Feuerwehr', () => {
    expect(
      verrechnenVorgabe({
        feuerwehr: 'FF Weiden',
        firecallId: 'abc',
        eigeneFeuerwehr: eigene,
      }),
    ).toBe(false);
  });

  it('ist ohne Feuerwehr aus', () => {
    expect(verrechnenVorgabe({ firecallId: '', eigeneFeuerwehr: eigene })).toBe(
      false,
    );
  });

  it('ist ohne gepflegte eigene Feuerwehr aus', () => {
    expect(verrechnenVorgabe({ feuerwehr: 'FF Weiden', firecallId: '' })).toBe(
      false,
    );
  });

  it('ist bei der eigenen Feuerwehr aus', () => {
    expect(
      verrechnenVorgabe({
        feuerwehr: eigene,
        firecallId: '',
        eigeneFeuerwehr: eigene,
      }),
    ).toBe(false);
  });

  it('ist bei fremder Feuerwehr an der Station an', () => {
    expect(
      verrechnenVorgabe({
        feuerwehr: 'FF Weiden',
        firecallId: '',
        eigeneFeuerwehr: eigene,
      }),
    ).toBe(true);
  });

  it('behandelt abweichende Schreibweisen als dieselbe Feuerwehr', () => {
    expect(
      verrechnenVorgabe({
        feuerwehr: 'neusiedl-am-see',
        firecallId: '',
        eigeneFeuerwehr: eigene,
      }),
    ).toBe(false);
  });
});

describe('zweckVorgabe', () => {
  it('ist mit Einsatz „Einsatz"', () => {
    expect(zweckVorgabe('e1')).toBe('einsatz');
  });

  it('ist ohne Einsatz „Sonstiges" und nicht „Übung"', () => {
    expect(zweckVorgabe('')).toBe('sonstiges');
  });
});

describe('zweckOf', () => {
  it('nimmt den gespeicherten Zweck, auch gegen den Einsatzbezug', () => {
    // Eine Übung *mit* Einsatznummer kommt vor — die Übung wird als Einsatz
    // geführt. Der gesetzte Zweck ist die Aussage des Benutzers.
    expect(zweckOf({ zweck: 'uebung', firecallId: 'e1' })).toBe('uebung');
  });

  it('leitet ihn für Altzeilen aus dem Einsatzbezug ab', () => {
    expect(zweckOf({ firecallId: 'e1' })).toBe('einsatz');
    expect(zweckOf({ firecallId: '' })).toBe('sonstiges');
  });
});

describe('fuellungSperre', () => {
  const eigene = { createdBy: 'u1' };

  it('lässt den Erfasser ändern', () => {
    expect(fuellungSperre({ fuellung: eigene, uid: 'u1' })).toBeUndefined();
    expect(darfFuellungAendern({ fuellung: eigene, uid: 'u1' })).toBe(true);
  });

  it('sperrt eine fremde Zeile', () => {
    expect(fuellungSperre({ fuellung: eigene, uid: 'u2' })).toBe('fremd');
  });

  it('lässt den Gruppen-Admin auch fremde Zeilen ändern', () => {
    expect(
      fuellungSperre({ fuellung: eigene, uid: 'u2', istGruppenAdmin: true }),
    ).toBeUndefined();
  });

  it('sperrt eine verrechnete Zeile auch für den Erfasser', () => {
    expect(
      fuellungSperre({
        fuellung: { createdBy: 'u1', rechnungId: 'r1' },
        uid: 'u1',
      }),
    ).toBe('verrechnet');
  });

  it('sperrt eine verrechnete Zeile auch für den Gruppen-Admin', () => {
    expect(
      fuellungSperre({
        fuellung: { createdBy: 'u1', rechnungId: 'r1' },
        uid: 'u1',
        istGruppenAdmin: true,
      }),
    ).toBe('verrechnet');
  });

  it('gibt eine Zeile ohne Erfasser nicht an jeden frei', () => {
    // Weder der abgemeldete Zustand (`uid` fehlt) noch ein beliebiges
    // Mitglied darf über `createdBy: ''` an die Zeile.
    expect(fuellungSperre({ fuellung: { createdBy: '' } })).toBe('fremd');
    expect(fuellungSperre({ fuellung: { createdBy: '' }, uid: 'u1' })).toBe(
      'fremd',
    );
    expect(
      fuellungSperre({ fuellung: { createdBy: '' }, istGruppenAdmin: true }),
    ).toBeUndefined();
  });
});

describe('braucheDatum', () => {
  const jetzt = new Date('2026-09-02T10:00:00');

  it('zeigt für heute kein Datum', () => {
    expect(braucheDatum('2026-09-02T06:15:00', jetzt)).toBe(false);
  });

  it('zeigt für einen anderen Tag ein Datum', () => {
    expect(braucheDatum('2026-09-01T23:59:00', jetzt)).toBe(true);
  });

  it('bleibt bei einem unlesbaren Zeitpunkt still', () => {
    expect(braucheDatum('kaputt', jetzt)).toBe(false);
  });
});

describe('mitUeberwachungsUid', () => {
  it('legt die Liste an', () => {
    expect(mitUeberwachungsUid(undefined, 'u1')).toEqual(['u1']);
  });

  it('hängt an, ohne zu doppeln', () => {
    expect(mitUeberwachungsUid(['u1'], 'u2')).toEqual(['u1', 'u2']);
    expect(mitUeberwachungsUid(['u1', 'u2'], 'u1')).toEqual(['u1', 'u2']);
  });

  it('ignoriert eine leere uid', () => {
    expect(mitUeberwachungsUid(['u1'], '')).toEqual(['u1']);
    expect(mitUeberwachungsUid(undefined, ' ')).toEqual([]);
  });
});

describe('uebernahmePatch', () => {
  const jetzt = '2026-09-02T10:00:00.000Z';

  it('protokolliert den Wechsel der Verantwortung', () => {
    const patch = uebernahmePatch({
      trupp: {},
      jetzt,
      uid: 'u1',
      ueberwachtVon: ' Maschinist LFA ',
      einsatzziel: ' Keller ',
      satz: { flaschenAnzahl: 1, flaschenVolumen: 6.8, fuellDruck: 300 },
      paTyp: 'custom',
    });
    expect(patch).toEqual({
      ueberwachungSeit: jetzt,
      ueberwachungUids: ['u1'],
      ueberwachtVon: 'Maschinist LFA',
      einsatzziel: 'Keller',
      paTyp: 'custom',
      flaschenAnzahl: 1,
      flaschenVolumen: 6.8,
      fuellDruck: 300,
    });
  });

  it('lässt eine schon vermerkte Übernahme stehen', () => {
    const patch = uebernahmePatch({
      trupp: { ueberwachungSeit: '2026-09-02T09:00:00.000Z', ueberwachungUids: ['u1'] },
      jetzt,
      uid: 'u2',
      paTyp: 'standard300',
    });
    expect(patch.ueberwachungSeit).toBeUndefined();
    expect(patch.ueberwachungUids).toEqual(['u1', 'u2']);
  });

  it('schickt keine leeren Felder mit — Firestore lehnt undefined ab', () => {
    const patch = uebernahmePatch({ trupp: {}, jetzt, uid: 'u1', ueberwachtVon: '  ' });
    expect('ueberwachtVon' in patch).toBe(false);
    expect('einsatzziel' in patch).toBe(false);
    expect('paTyp' in patch).toBe(false);
  });
});

describe('buildDruckabfrage', () => {
  it('baut eine Abfrage mit Zeitpunkt und Erfasser', () => {
    expect(
      buildDruckabfrage(
        { druck: 200, amZiel: true, bemerkung: ' Ziel erreicht ' },
        { uid: 'u1', jetzt: '2026-09-02T10:05:00.000Z' },
      ),
    ).toEqual({
      zeitpunkt: '2026-09-02T10:05:00.000Z',
      druck: 200,
      amZiel: true,
      bemerkung: 'Ziel erreicht',
      erfasstVon: 'u1',
    });
  });

  it('lässt Leeres weg', () => {
    const abfrage = buildDruckabfrage({ druck: 180 }, { uid: '', jetzt: '2026-09-02T10:05:00.000Z' });
    expect(abfrage).toEqual({ zeitpunkt: '2026-09-02T10:05:00.000Z', druck: 180 });
  });

  it('nimmt einen vorgegebenen Zeitpunkt', () => {
    expect(
      buildDruckabfrage(
        { druck: 180, zeitpunkt: '2026-09-02T10:03:00.000Z' },
        { uid: 'u1', jetzt: '2026-09-02T10:05:00.000Z' },
      ).zeitpunkt,
    ).toBe('2026-09-02T10:03:00.000Z');
  });
});

describe('validateDruckabfrage', () => {
  it('nimmt einen plausiblen Druck', () => {
    expect(validateDruckabfrage({ druck: 200 })).toEqual([]);
  });

  it('lehnt fehlenden, negativen und unsinnig hohen Druck ab', () => {
    expect(validateDruckabfrage({})).toEqual(['druckMissing']);
    expect(validateDruckabfrage({ druck: -1 })).toEqual(['druckInvalid']);
    expect(validateDruckabfrage({ druck: 1000 })).toEqual(['druckInvalid']);
  });
});

describe('truppGeraetVonGeraet', () => {
  it('kopiert Bezeichnung und Kennung aus den Stammdaten', () => {
    expect(
      truppGeraetVonGeraet(
        geraet({ id: 'g7', nummer: '2.16.19', bezeichnung: 'Atemluftflasche CFK 6,8 l' }),
      ),
    ).toEqual({
      geraetId: 'g7',
      typ: 'flasche',
      bezeichnung: 'Atemluftflasche CFK 6,8 l',
      kennung: '2.16.19',
    });
  });

  it('lässt geraetId und kennung weg, wenn es keine gibt', () => {
    const ohne = geraet({ nummer: undefined, inventarNr: undefined, seriennummer: undefined });
    delete ohne.id;
    expect(truppGeraetVonGeraet(ohne)).toEqual({
      typ: 'flasche',
      bezeichnung: 'Atemluftflasche Stahl 6 l',
    });
  });
});

describe('truppGeraetLabel', () => {
  it('stellt die Kennung voran', () => {
    expect(
      truppGeraetLabel({ typ: 'flasche', bezeichnung: 'CFK 6,8 l', kennung: '2.16.19' }),
    ).toBe('2.16.19 · CFK 6,8 l');
  });

  it('nennt ohne Kennung nur die Bezeichnung', () => {
    expect(truppGeraetLabel({ typ: 'maske', bezeichnung: 'Maske FPS' })).toBe('Maske FPS');
  });
});

describe('sanitizeTruppGeraete', () => {
  it('entfernt leere Felder — Firestore lehnt undefined auch im Array ab', () => {
    expect(
      sanitizeTruppGeraete([
        {
          geraetId: ' g1 ',
          typ: 'flasche',
          bezeichnung: ' CFK 6,8 l ',
          kennung: ' 2.16.19 ',
          person: undefined,
        },
      ]),
    ).toEqual([
      {
        geraetId: 'g1',
        typ: 'flasche',
        bezeichnung: 'CFK 6,8 l',
        kennung: '2.16.19',
      },
    ]);
  });

  it('behält einen gesetzten Träger', () => {
    expect(
      sanitizeTruppGeraete([
        { typ: 'maske', bezeichnung: 'Maske FPS', person: ' Anna ' },
      ]),
    ).toEqual([{ typ: 'maske', bezeichnung: 'Maske FPS', person: 'Anna' }]);
  });

  it('wirft Zeilen ohne Bezeichnung und ohne Kennung weg', () => {
    expect(
      sanitizeTruppGeraete([{ typ: 'flasche', bezeichnung: '   ' }]),
    ).toEqual([]);
  });

  it('nimmt die Kennung als Bezeichnung, wenn nur sie da ist', () => {
    expect(
      sanitizeTruppGeraete([
        { typ: 'flasche', bezeichnung: '', kennung: '2.16.19' },
      ]),
    ).toEqual([
      { typ: 'flasche', bezeichnung: '2.16.19', kennung: '2.16.19' },
    ]);
  });
});

describe('istGueltigeUid', () => {
  it('nimmt eine gewöhnliche Auth-uid', () => {
    expect(istGueltigeUid('AbC123xyz_-')).toBe(true);
  });

  it('lehnt einen Pfad ab — er würde auf ein anderes Dokument zeigen', () => {
    // `user/foo/geheim/bar` statt `user/foo`.
    expect(istGueltigeUid('foo/geheim/bar')).toBe(false);
    expect(istGueltigeUid('/foo')).toBe(false);
  });

  it('lehnt die Punkt-Segmente ab — das SDK würde werfen', () => {
    expect(istGueltigeUid('.')).toBe(false);
    expect(istGueltigeUid('..')).toBe(false);
  });

  it('lehnt die von Firestore reservierte Form ab', () => {
    expect(istGueltigeUid('__name__')).toBe(false);
  });

  it('lehnt Leeres ab', () => {
    expect(istGueltigeUid('')).toBe(false);
    expect(istGueltigeUid('   ')).toBe(false);
  });

  it('lehnt mehr als 1500 Byte ab', () => {
    expect(istGueltigeUid('a'.repeat(1500))).toBe(true);
    expect(istGueltigeUid('a'.repeat(1501))).toBe(false);
    // Mehrbyte-Zeichen zählen als Bytes, nicht als Zeichen.
    expect(istGueltigeUid('ä'.repeat(751))).toBe(false);
  });
});

describe('sanitizeUeberwachungUids', () => {
  it('wirft ungültige Einträge weg und hält die Reihenfolge', () => {
    expect(
      sanitizeUeberwachungUids(['u1', 'foo/bar', ' u2 ', '..', '', 'u1']),
    ).toEqual(['u1', 'u2']);
  });

  it('übergeht Einträge, die keine Zeichenketten sind', () => {
    expect(
      sanitizeUeberwachungUids([
        'u1',
        42 as unknown as string,
        null as unknown as string,
      ]),
    ).toEqual(['u1']);
  });

  it('kürzt auf die Höchstzahl', () => {
    const viele = Array.from({ length: MAX_UEBERWACHUNG_UIDS + 5 }, (_, i) => `u${i}`);
    expect(sanitizeUeberwachungUids(viele)).toHaveLength(MAX_UEBERWACHUNG_UIDS);
  });

  it('ist ohne Liste leer', () => {
    expect(sanitizeUeberwachungUids(undefined)).toEqual([]);
  });
});

describe('mitUeberwachungsUid: Schranken', () => {
  it('nimmt eine krumme uid nicht auf', () => {
    expect(mitUeberwachungsUid(['u1'], 'foo/bar')).toEqual(['u1']);
  });

  it('räumt eine bereits verunreinigte Liste mit auf', () => {
    expect(mitUeberwachungsUid(['u1', 'foo/bar'], 'u2')).toEqual(['u1', 'u2']);
  });

  it('hängt über der Höchstzahl nichts mehr an', () => {
    const voll = Array.from({ length: MAX_UEBERWACHUNG_UIDS }, (_, i) => `u${i}`);
    expect(mitUeberwachungsUid(voll, 'neu')).toEqual(voll);
  });
});
