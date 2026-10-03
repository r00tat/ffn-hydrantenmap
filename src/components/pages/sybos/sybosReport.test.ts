import { describe, expect, it } from 'vitest';
import {
  CrewAssignment,
  Diary,
  Firecall,
  FirecallItem,
  FirecallLocation,
  Fzg,
  GeschaeftsbuchEintrag,
  Rohr,
} from '../../firebase/firestore';
import {
  buildAiContext,
  buildBasisdaten,
  buildGeschaeftsbuchText,
  buildKraefte,
  buildMannschaftText,
  buildMaterialText,
  buildNotizenText,
  buildTagebuchText,
  countMaterial,
  formatDauer,
  formatSybosTime,
  parseSybosSummary,
  sortCrew,
} from './sybosReport';

const firecall: Firecall = {
  id: 'fc1',
  name: 'T1 Verkehrsunfall A4',
  fw: 'Neusiedl am See',
  date: '2026-03-01T14:00:00',
  description: 'Fahrzeugbergung nach VU',
};

const tlf: Fzg = {
  id: 'v1',
  type: 'vehicle',
  name: 'TLFA 4000',
  fw: 'Neusiedl am See',
  besatzung: '5',
  ats: 2,
  alarmierung: '2026-03-01T14:02:00',
  eintreffen: '2026-03-01T14:10:00',
  abruecken: '2026-03-01T15:30:00',
};

const rtw: Fzg = {
  id: 'v2',
  type: 'vehicle',
  name: 'RTW',
  fw: 'Rotes Kreuz',
  besatzung: '2',
  fremd: 'true',
  eintreffen: '2026-03-01T14:15:00',
  abruecken: '2026-03-01T14:45:00',
};

const rohr: Rohr = {
  id: 'r1',
  type: 'rohr',
  name: 'C-Rohr 1',
  art: 'C',
};

const marker: FirecallItem = {
  id: 'm1',
  type: 'marker',
  name: 'Ölbindemittel',
};

const crew: CrewAssignment[] = [
  {
    recipientId: 'a',
    name: 'Max Muster',
    vehicleId: 'v1',
    vehicleName: 'TLFA 4000',
    funktion: 'Maschinist',
  },
  {
    recipientId: 'b',
    name: 'Erika Beispiel',
    vehicleId: 'v1',
    vehicleName: 'TLFA 4000',
    funktion: 'Gruppenkommandant',
  },
  {
    recipientId: 'c',
    name: 'Hans Probe',
    vehicleId: null,
    vehicleName: '',
    funktion: 'Feuerwehrmann',
  },
];

const location: FirecallLocation = {
  id: 'l1',
  street: 'Wiener Straße',
  number: '12',
  city: 'Neusiedl am See',
  name: 'Unfallstelle',
  description: 'Zwei PKW',
  info: 'Fahrbahn gesperrt',
  status: 'in arbeit',
  vehicles: {},
  created: '2026-03-01T14:00:00',
  creator: 'test',
};

describe('formatSybosTime', () => {
  it('formatiert ISO-Zeitpunkte ohne Sekunden', () => {
    expect(formatSybosTime('2026-03-01T14:02:33')).toBe('01.03.2026 14:02');
  });

  it('liest auch die deutsche Schreibweise', () => {
    expect(formatSybosTime('01.03.2026 14:02:33')).toBe('01.03.2026 14:02');
  });

  it('gibt bei fehlendem oder ungültigem Wert einen Leerstring zurück', () => {
    expect(formatSybosTime(undefined)).toBe('');
    expect(formatSybosTime('kein Datum')).toBe('');
  });
});

describe('formatDauer', () => {
  it('rechnet Stunden und Minuten', () => {
    expect(formatDauer('2026-03-01T14:00:00', '2026-03-01T15:30:00')).toBe(
      '1 h 30 min'
    );
  });

  it('lässt null Stunden weg', () => {
    expect(formatDauer('2026-03-01T14:00:00', '2026-03-01T14:45:00')).toBe(
      '45 min'
    );
  });

  it('gibt ohne Ende oder bei negativer Dauer nichts aus', () => {
    expect(formatDauer('2026-03-01T14:00:00', undefined)).toBe('');
    expect(formatDauer('2026-03-01T15:00:00', '2026-03-01T14:00:00')).toBe('');
  });
});

describe('buildBasisdaten', () => {
  it('liefert die Zeiten aus Einsatz und Einsatzmitteln', () => {
    const basis = buildBasisdaten({
      firecall,
      items: [tlf, rtw],
      locations: [location],
    });
    const byKey = Object.fromEntries(basis.map((b) => [b.key, b.value]));
    expect(byKey.name).toBe('T1 Verkehrsunfall A4');
    expect(byKey.fw).toBe('Neusiedl am See');
    expect(byKey.beginn).toBe('01.03.2026 14:00');
    expect(byKey.alarmierung).toBe('01.03.2026 14:02');
    expect(byKey.eintreffen).toBe('01.03.2026 14:10');
    expect(byKey.ende).toBe('01.03.2026 15:30');
    expect(byKey.dauer).toBe('1 h 30 min');
    expect(byKey.einsatzort).toBe('Wiener Straße 12, Neusiedl am See');
    expect(byKey.beschreibung).toBe('Fahrzeugbergung nach VU');
  });

  it('bevorzugt die Zeiten am Einsatz selbst', () => {
    const basis = buildBasisdaten({
      firecall: {
        ...firecall,
        eintreffen: '2026-03-01T14:08:00',
        abruecken: '2026-03-01T16:00:00',
      },
      items: [tlf],
      locations: [],
    });
    const byKey = Object.fromEntries(basis.map((b) => [b.key, b.value]));
    expect(byKey.eintreffen).toBe('01.03.2026 14:08');
    expect(byKey.ende).toBe('01.03.2026 16:00');
    expect(byKey.dauer).toBe('2 h');
  });

  it('lässt leere Felder weg und fällt beim Ort auf die Koordinaten zurück', () => {
    const basis = buildBasisdaten({
      firecall: { name: 'Übung', lat: 47.9, lng: 16.8 },
      items: [],
      locations: [],
    });
    expect(basis.map((b) => b.key)).toEqual(['name', 'einsatzort']);
    expect(basis[1].value).toBe('47.9, 16.8');
  });
});

describe('buildKraefte', () => {
  it('trennt eigene und fremde Kräfte und summiert', () => {
    const kraefte = buildKraefte([tlf, rtw, rohr], []);
    expect(kraefte.eigene).toContain('TLFA 4000');
    expect(kraefte.eigene).toContain('6 Personen');
    expect(kraefte.eigene).toContain('2 ATS');
    expect(kraefte.eigene).toContain('Eintreffen 01.03.2026 14:10');
    expect(kraefte.eigene).not.toContain('RTW');
    expect(kraefte.fremde).toContain('RTW (Rotes Kreuz)');
    expect(kraefte.summe).toEqual({
      eigeneEinheiten: 1,
      eigenePersonen: 6,
      fremdeEinheiten: 1,
      fremdePersonen: 3,
      ats: 2,
    });
  });

  it('liefert die Zeilen alphabetisch nach Name, Zahlen natürlich sortiert', () => {
    const kraefte = buildKraefte(
      [
        { ...tlf, id: 'a', name: 'TLFA 4000' },
        { ...tlf, id: 'b', name: 'KDOF' },
        { ...tlf, id: 'c', name: 'RLF 10' },
        { ...tlf, id: 'd', name: 'RLF 2' },
        { ...rtw, id: 'e', name: 'RTW' },
        { ...rtw, id: 'f', name: 'NEF' },
      ],
      []
    );
    expect(kraefte.eigeneRows.map((r) => r.name)).toEqual([
      'KDOF',
      'RLF 2',
      'RLF 10',
      'TLFA 4000',
    ]);
    expect(kraefte.fremdeRows.map((r) => r.name)).toEqual(['NEF', 'RTW']);
    expect(kraefte.eigene.split('\n')[0]).toMatch(/^KDOF/);
  });
});

describe('sortCrew', () => {
  it('sortiert die Mannschaft alphabetisch nach Name', () => {
    expect(sortCrew(crew).map((c) => c.name)).toEqual([
      'Erika Beispiel',
      'Hans Probe',
      'Max Muster',
    ]);
  });
});

describe('buildMannschaftText', () => {
  it('listet die Mannschaft alphabetisch mit Funktion und Fahrzeug', () => {
    const text = buildMannschaftText(crew);
    expect(text.split('\n')).toEqual([
      'Erika Beispiel – Gruppenkommandant (TLFA 4000)',
      'Hans Probe – Feuerwehrmann',
      'Max Muster – Maschinist (TLFA 4000)',
    ]);
  });

  it('ist leer ohne Zuordnung', () => {
    expect(buildMannschaftText([])).toBe('');
  });
});

describe('countMaterial', () => {
  it('zählt Material nach Bezeichnung, alphabetisch, ohne Einsatzmittel', () => {
    expect(
      countMaterial(
        [tlf, marker, rohr, { ...rohr, id: 'r2' }],
        (item) => (item.type === 'rohr' ? 'Rohr' : 'Marker')
      )
    ).toEqual([
      { label: 'C-Rohr', count: 2 },
      { label: 'Marker: Ölbindemittel', count: 1 },
    ]);
  });
});

describe('buildMaterialText', () => {
  it('schreibt das Material alphabetisch mit Anzahl', () => {
    const text = buildMaterialText(
      [tlf, marker, rohr, { ...rohr, id: 'r2' }],
      (item) => (item.type === 'rohr' ? 'Rohr' : 'Marker')
    );
    expect(text.split('\n')).toEqual([
      '2× C-Rohr',
      '1× Marker: Ölbindemittel',
    ]);
  });
});

describe('buildTagebuchText', () => {
  it('formatiert die Einträge zeilenweise', () => {
    const diaries: Diary[] = [
      {
        id: 'd1',
        type: 'diary',
        nummer: 1,
        art: 'B',
        datum: '2026-03-01T14:20:00',
        von: 'EL',
        an: 'GK',
        name: 'Fahrbahn reinigen',
        beschreibung: 'mit Bindemittel',
        erledigt: '2026-03-01T14:40:00',
      },
      {
        id: 'd2',
        type: 'diary',
        datum: '2026-03-01T14:02:00',
        name: 'TLFA 4000 alarmiert',
      },
    ];
    expect(buildTagebuchText(diaries).split('\n')).toEqual([
      '01.03.2026 14:20 Nr. 1 Befehl von EL an GK: Fahrbahn reinigen – mit Bindemittel (erledigt 01.03.2026 14:40)',
      '01.03.2026 14:02 TLFA 4000 alarmiert',
    ]);
  });
});

describe('buildGeschaeftsbuchText', () => {
  it('kennzeichnet ein- und ausgehende Einträge', () => {
    const entries: GeschaeftsbuchEintrag[] = [
      {
        id: 'g1',
        type: 'gb',
        nummer: 2,
        ausgehend: true,
        datum: '2026-03-01T14:30:00',
        an: 'BAZ',
        name: 'Lagemeldung',
      },
    ];
    expect(buildGeschaeftsbuchText(entries)).toBe(
      '01.03.2026 14:30 Nr. 2 ausgehend an BAZ: Lagemeldung'
    );
  });
});

describe('buildNotizenText', () => {
  it('nimmt die Einsatzorte mit Beschreibung und Info auf', () => {
    expect(buildNotizenText([location])).toBe(
      'Unfallstelle (Wiener Straße 12, Neusiedl am See): Zwei PKW – Fahrbahn gesperrt'
    );
  });
});

describe('buildAiContext', () => {
  it('fasst die Abschnitte mit Überschriften zusammen und lässt leere weg', () => {
    const text = buildAiContext([
      { title: 'Basisdaten', text: 'Einsatz: Test' },
      { title: 'Leer', text: '' },
      { title: 'Tagebuch', text: 'Zeile 1' },
    ]);
    expect(text).toBe('## Basisdaten\nEinsatz: Test\n\n## Tagebuch\nZeile 1');
  });
});

describe('parseSybosSummary', () => {
  it('liest die beiden Felder aus dem JSON', () => {
    expect(
      parseSybosSummary(
        '{"einsatzablauf":"Ablauf","taetigkeit":"Tätigkeit"}'
      )
    ).toEqual({ einsatzablauf: 'Ablauf', taetigkeit: 'Tätigkeit' });
  });

  it('verträgt einen Codeblock um das JSON', () => {
    expect(
      parseSybosSummary(
        '```json\n{"einsatzablauf":"A","taetigkeit":"B"}\n```'
      )
    ).toEqual({ einsatzablauf: 'A', taetigkeit: 'B' });
  });

  it('wirft bei unbrauchbarer Antwort', () => {
    expect(() => parseSybosSummary('kein json')).toThrow();
    expect(() => parseSybosSummary('{"foo":1}')).toThrow();
  });
});
