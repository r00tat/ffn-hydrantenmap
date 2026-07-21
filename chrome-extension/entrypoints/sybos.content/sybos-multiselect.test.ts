import { describe, it, expect } from 'vitest';
import {
  parseMultiselectData,
  matchesVehicleName,
  type MultiselectRow,
} from './sybos-multiselect';

function makeDoc(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

// Verbatim 3-row fixture captured from a real frmGeraetSelect response.
const MYDATA_FIXTURE = `var myData = [["<input name='BListMulti[]' value='57738' type='hidden'/><input name='deleted[57738]' id='selected_tbl[]' value='57738' type='checkbox' class='checkbox' /><input type='hidden' name='name_tbl[57738]' value='57738'><input type='hidden' name='id_tbl[57738]' value='57738'><input type='hidden' name='name_tbl[deleted[57738]]' value='{GEbez}'>","KDTFA","Neusiedl am See","FW-205ND","Einsatzfahrzeuge","Kommandantenfahrzeug","","Kommando Neusiedl am See"],["<input name='BListMulti[]' value='2004' type='hidden'/><input name='deleted[2004]' id='selected_tbl[]' value='2004' type='checkbox' class='checkbox' /><input type='hidden' name='name_tbl[2004]' value='2004'><input type='hidden' name='id_tbl[2004]' value='2004'><input type='hidden' name='name_tbl[deleted[2004]]' value='{GEbez}'>","TLFA 4000","Neusiedl am See","FW-233ND","Einsatzfahrzeuge","Tanklöschfahrzeug","TLFA","Tank1 Neusiedl am See"],["<input name='BListMulti[]' value='105692' type='hidden'/><input name='deleted[105692]' id='selected_tbl[]' value='105692' type='checkbox' class='checkbox' /><input type='hidden' name='name_tbl[105692]' value='105692'><input type='hidden' name='id_tbl[105692]' value='105692'><input type='hidden' name='name_tbl[deleted[105692]]' value='{GEbez}'>","WLF-K Neusiedl am See","Neusiedl am See","FW-109ND","Einsatzfahrzeuge","Wechselladerfahrzeug","WLF",""]];`;

function fixtureDoc(): Document {
  return makeDoc(
    `<html><body><form name="frmMain"><input type="hidden" name="patFormCheckID" value="x~y"><script>${MYDATA_FIXTURE}</script></form></body></html>`
  );
}

describe('parseMultiselectData', () => {
  it('parses the 3 rows from var myData', () => {
    const rows = parseMultiselectData(fixtureDoc());
    expect(rows).toHaveLength(3);
  });

  it('extracts waname and rufname for each row', () => {
    const rows = parseMultiselectData(fixtureDoc());
    expect(rows[0].waname).toBe('KDTFA');
    expect(rows[0].rufname).toBe('');
    expect(rows[1].waname).toBe('TLFA 4000');
    expect(rows[1].rufname).toBe('TLFA');
    expect(rows[2].waname).toBe('WLF-K Neusiedl am See');
    expect(rows[2].rufname).toBe('WLF');
  });

  it('extracts the checkbox name/value from row[0]', () => {
    const rows = parseMultiselectData(fixtureDoc());
    expect(rows[0].checkboxName).toBe('deleted[57738]');
    expect(rows[0].checkboxValue).toBe('57738');
    expect(rows[1].checkboxName).toBe('deleted[2004]');
    expect(rows[2].checkboxName).toBe('deleted[105692]');
  });

  it('derives the row id from the checkbox name', () => {
    const rows = parseMultiselectData(fixtureDoc());
    expect(rows[0].id).toBe('57738');
    expect(rows[1].id).toBe('2004');
    expect(rows[2].id).toBe('105692');
  });

  it('collects all hidden inputs from row[0]', () => {
    const rows = parseMultiselectData(fixtureDoc());
    const names = rows[0].hiddenFields.map((f) => f.name);
    expect(names).toEqual([
      'BListMulti[]',
      'name_tbl[57738]',
      'id_tbl[57738]',
      'name_tbl[deleted[57738]]',
    ]);
    expect(rows[0].hiddenFields.find((f) => f.name === 'BListMulti[]')?.value).toBe(
      '57738'
    );
    expect(
      rows[0].hiddenFields.find((f) => f.name === 'name_tbl[deleted[57738]]')?.value
    ).toBe('{GEbez}');
  });

  it('returns [] when there is no myData script', () => {
    const doc = makeDoc('<html><body><form name="frmMain"></form></body></html>');
    expect(parseMultiselectData(doc)).toEqual([]);
  });

  it('returns [] when myData is malformed JSON', () => {
    const doc = makeDoc(
      `<html><body><form name="frmMain"><script>var myData = [[oops,]];</script></form></body></html>`
    );
    expect(parseMultiselectData(doc)).toEqual([]);
  });
});

describe('matchesVehicleName', () => {
  function row(waname: string, rufname: string): MultiselectRow {
    return {
      id: '1',
      waname,
      rufname,
      checkboxName: 'deleted[1]',
      checkboxValue: '1',
      hiddenFields: [],
    };
  }

  it('matches on exact waname (case-insensitive, trimmed)', () => {
    expect(matchesVehicleName('kdtfa', row('KDTFA', ''))).toBe(true);
    expect(matchesVehicleName('  KDTFA  ', row('KDTFA', ''))).toBe(true);
  });

  it('matches on exact rufname when waname differs', () => {
    expect(matchesVehicleName('TLFA', row('TLFA 4000', 'TLFA'))).toBe(true);
  });

  it('does not match rufname when it is empty', () => {
    expect(matchesVehicleName('', row('KDTFA', ''))).toBe(false);
  });

  it('matches when waname starts with "ekName "', () => {
    expect(
      matchesVehicleName('WLF-K', row('WLF-K Neusiedl am See', 'WLF'))
    ).toBe(true);
  });

  it('returns false for an empty ekName', () => {
    expect(matchesVehicleName('', row('KDTFA', 'KDTFA'))).toBe(false);
  });

  it('returns false when nothing matches', () => {
    expect(matchesVehicleName('Unbekannt', row('KDTFA', 'TLFA'))).toBe(false);
  });
});
