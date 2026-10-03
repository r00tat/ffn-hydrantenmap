import { describe, expect, it } from 'vitest';
import { Fzg } from '../components/firebase/firestore';
import {
  groupVehiclesByFw,
  isOwnVehicle,
  normalizeFwName,
  OwnFleet,
  ownFleet,
  sortVehiclesOwnFirst,
} from './vehicleGroups';

const fzg = (id: string, fw?: string, extra: Partial<Fzg> = {}): Fzg =>
  ({ id, name: id, type: 'vehicle', fw, ...extra }) as Fzg;

const OWN_FW = 'Neusiedl am See';
const OWN: OwnFleet = ownFleet(OWN_FW, ['KDTFA', 'TLFA 4000', 'RLFA']);

describe('normalizeFwName', () => {
  it('ignoriert Groß-/Kleinschreibung, Leerraum und das Kürzel FF', () => {
    expect(normalizeFwName('  FF Neusiedl am See ')).toBe('neusiedl am see');
    expect(normalizeFwName('Feuerwehr Neusiedl  am See')).toBe(
      'neusiedl am see',
    );
    expect(normalizeFwName('neusiedl am see')).toBe('neusiedl am see');
  });

  it('liefert für fehlende Angaben eine leere Zeichenkette', () => {
    expect(normalizeFwName(undefined)).toBe('');
    expect(normalizeFwName('   ')).toBe('');
  });
});

describe('isOwnVehicle', () => {
  it('erkennt ein vorgefertigtes Fahrzeug ohne Feuerwehrangabe als eigen', () => {
    expect(isOwnVehicle(fzg('KDTFA'), OWN)).toBe(true);
    expect(isOwnVehicle(fzg(' tlfa 4000 '), OWN)).toBe(true);
  });

  it('erkennt ein vorgefertigtes Fahrzeug der eigenen Feuerwehr als eigen', () => {
    expect(isOwnVehicle(fzg('KDTFA', OWN_FW), OWN)).toBe(true);
    expect(isOwnVehicle(fzg('KDTFA', 'FF Neusiedl am See'), OWN)).toBe(true);
  });

  it('nimmt ein Fahrzeug mit ausdrücklich eigener Feuerwehr als eigen', () => {
    expect(isOwnVehicle(fzg('Privat-PKW', OWN_FW), OWN)).toBe(true);
  });

  it('ist fremd ohne Feuerwehr, wenn es kein vorgefertigtes Fahrzeug ist', () => {
    expect(isOwnVehicle(fzg('RTW'), OWN)).toBe(false);
    expect(isOwnVehicle(fzg('RTW', ''), OWN)).toBe(false);
  });

  it('ist fremd bei anderer Feuerwehr, auch mit gleichem Fahrzeugnamen', () => {
    expect(isOwnVehicle(fzg('TLF Weiden', 'Weiden am See'), OWN)).toBe(false);
    expect(isOwnVehicle(fzg('TLFA 4000', 'Weiden am See'), OWN)).toBe(false);
  });

  it('ist fremd, wenn das Fahrzeug als fremd markiert ist', () => {
    expect(isOwnVehicle(fzg('KDTFA', undefined, { fremd: 'true' }), OWN)).toBe(
      false,
    );
    expect(isOwnVehicle(fzg('KDTFA', OWN_FW, { fremd: 'true' }), OWN)).toBe(
      false,
    );
  });
});

describe('groupVehiclesByFw', () => {
  it('stellt die eigenen Fahrzeuge voran und behält deren Reihenfolge', () => {
    const groups = groupVehiclesByFw(
      [
        fzg('w1', 'Weiden am See'),
        fzg('TLFA 4000', OWN_FW),
        fzg('j1', 'Jois'),
        fzg('KDTFA'),
      ],
      OWN,
    );
    expect(groups.map((g) => g.label)).toEqual([
      OWN_FW,
      'Jois',
      'Weiden am See',
    ]);
    expect(groups[0].own).toBe(true);
    expect(groups[0].vehicles.map((v) => v.id)).toEqual(['TLFA 4000', 'KDTFA']);
    expect(groups.slice(1).every((g) => !g.own)).toBe(true);
  });

  it('fasst Schreibvarianten derselben fremden Feuerwehr zusammen', () => {
    const groups = groupVehiclesByFw(
      [fzg('w1', 'Weiden am See'), fzg('w2', 'FF Weiden am See')],
      OWN,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Weiden am See');
    expect(groups[0].vehicles.map((v) => v.id)).toEqual(['w1', 'w2']);
  });

  it('stellt fremde Fahrzeuge ohne Feuerwehr ans Ende', () => {
    const groups = groupVehiclesByFw(
      [fzg('RTW'), fzg('Polizei', undefined, { fremd: 'true' }), fzg('w1', 'Weiden am See')],
      OWN,
    );
    expect(groups.map((g) => g.key)).toEqual(['weiden am see', '']);
    expect(groups[1].label).toBe('');
    expect(groups[1].vehicles.map((v) => v.id)).toEqual(['RTW', 'Polizei']);
  });

  it('lässt die eigene Gruppe weg, wenn es keine eigenen Fahrzeuge gibt', () => {
    const groups = groupVehiclesByFw([fzg('w1', 'Weiden am See')], OWN);
    expect(groups).toHaveLength(1);
    expect(groups[0].own).toBe(false);
  });

  it('liefert für eine leere Liste keine Gruppen', () => {
    expect(groupVehiclesByFw([], OWN)).toEqual([]);
  });
});

describe('sortVehiclesOwnFirst', () => {
  it('reiht eigene vor fremde, fremde nach Feuerwehr', () => {
    const sorted = sortVehiclesOwnFirst(
      [fzg('w1', 'Weiden am See'), fzg('j1', 'Jois'), fzg('KDTFA')],
      OWN,
    );
    expect(sorted.map((v) => v.id)).toEqual(['KDTFA', 'j1', 'w1']);
  });
});
