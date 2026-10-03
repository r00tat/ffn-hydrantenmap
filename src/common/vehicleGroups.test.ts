import { describe, expect, it } from 'vitest';
import { Fzg } from '../components/firebase/firestore';
import {
  groupVehiclesByFw,
  isOwnVehicle,
  normalizeFwName,
  sortVehiclesOwnFirst,
} from './vehicleGroups';

const fzg = (id: string, fw?: string, extra: Partial<Fzg> = {}): Fzg =>
  ({ id, name: id, type: 'vehicle', fw, ...extra }) as Fzg;

const OWN = 'Neusiedl am See';

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
  it('ist eigen bei gleicher Feuerwehr, auch in anderer Schreibweise', () => {
    expect(isOwnVehicle(fzg('a', OWN), OWN)).toBe(true);
    expect(isOwnVehicle(fzg('a', 'FF Neusiedl am See'), OWN)).toBe(true);
  });

  it('ist eigen ohne Feuerwehrangabe', () => {
    expect(isOwnVehicle(fzg('a'), OWN)).toBe(true);
    expect(isOwnVehicle(fzg('a', ''), OWN)).toBe(true);
  });

  it('ist fremd bei anderer Feuerwehr', () => {
    expect(isOwnVehicle(fzg('a', 'Weiden am See'), OWN)).toBe(false);
  });

  it('ist fremd, wenn das Fahrzeug als fremd markiert ist', () => {
    expect(isOwnVehicle(fzg('a', undefined, { fremd: 'true' }), OWN)).toBe(
      false,
    );
    expect(isOwnVehicle(fzg('a', OWN, { fremd: 'true' }), OWN)).toBe(false);
  });
});

describe('groupVehiclesByFw', () => {
  it('stellt die eigenen Fahrzeuge voran und behält deren Reihenfolge', () => {
    const groups = groupVehiclesByFw(
      [
        fzg('w1', 'Weiden am See'),
        fzg('o2', OWN),
        fzg('j1', 'Jois'),
        fzg('o1'),
      ],
      OWN,
    );
    expect(groups.map((g) => g.label)).toEqual([OWN, 'Jois', 'Weiden am See']);
    expect(groups[0].own).toBe(true);
    expect(groups[0].vehicles.map((v) => v.id)).toEqual(['o2', 'o1']);
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
      [fzg('r1', undefined, { fremd: 'true' }), fzg('w1', 'Weiden am See')],
      OWN,
    );
    expect(groups.map((g) => g.key)).toEqual(['weiden am see', '']);
    expect(groups[1].label).toBe('');
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
      [fzg('w1', 'Weiden am See'), fzg('j1', 'Jois'), fzg('o1', OWN)],
      OWN,
    );
    expect(sorted.map((v) => v.id)).toEqual(['o1', 'j1', 'w1']);
  });
});
