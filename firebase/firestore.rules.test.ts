import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { derivePermissionFields, type GroupRoles } from '../src/common/permissions';
import { adminToken, createRulesTestEnv, guestToken, memberToken } from './rulesTestEnv';

// Regeln nach dem Modell der Gruppenrollen (docs/berechtigungen.md):
// Mitgliedschaft kommt aus dem Claim `groups`, Fachrechte aus `groupPerms` und
// `permsAny` am Benutzerdokument. Vor der Umstellung standen hier zwei Lücken
// als erlaubte Zugriffe (Freischaltung Kostenersatz galt in jeder Gruppe; die
// Berechnungen am Einsatz fielen unter den Wildcard). Die Tests „Lücke 1/2"
// prüfen, dass sie geschlossen bleiben.

let env: RulesTestEnvironment;

interface TestUser {
  uid: string;
  claimGroups: string[];
  /** undefined: kein Benutzerdokument. */
  groupRoles?: GroupRoles;
  /** Zusätzliche Felder am Benutzerdokument (Altbestand vor der Migration). */
  legacy?: Record<string, unknown>;
}

const USERS = {
  mitglied: { uid: 'mitglied', claimGroups: ['ffnd'], groupRoles: { ffnd: [] } },
  fremd: { uid: 'fremd', claimGroups: ['other'], groupRoles: { other: [] } },
  // Kostenersatz nur in ffnd, Mitglied auch in other. Die Schein-Gruppe
  // 'kostenersatz' steht bis zum Entfernen der alten Felder noch im Claim.
  kostenersatz: {
    uid: 'kostenersatz',
    claimGroups: ['ffnd', 'other', 'kostenersatz'],
    groupRoles: { ffnd: ['kostenersatz'], other: [] },
  },
  bekleidungswart: {
    uid: 'bekleidungswart',
    claimGroups: ['ffnd'],
    groupRoles: { ffnd: ['bekleidungswart'] },
  },
  gruppenadmin: {
    uid: 'gruppenadmin',
    claimGroups: ['ffnd'],
    groupRoles: { ffnd: ['gruppenadmin'] },
  },
  // Rechte am Dokument, aber (noch) kein Mitglied laut Claim.
  ohneClaim: {
    uid: 'ohneClaim',
    claimGroups: [],
    groupRoles: { ffnd: ['kostenersatz', 'bekleidungswart'] },
  },
  // Vor der Migration: nur die alten Felder, keine abgeleiteten.
  altbestand: {
    uid: 'altbestand',
    claimGroups: ['ffnd', 'kostenersatz'],
    legacy: { groups: ['ffnd', 'kostenersatz'], bekleidungswart: ['ffnd'], groupAdmin: ['ffnd'] },
  },
  ohneDokument: { uid: 'ohneDokument', claimGroups: ['ffnd'] },
} satisfies Record<string, TestUser>;

const db = (user: TestUser): Firestore =>
  env
    .authenticatedContext(user.uid, memberToken(`${user.uid}@example.com`, user.claimGroups))
    .firestore() as unknown as Firestore;

const admin = (): Firestore =>
  env.authenticatedContext('admin', adminToken()).firestore() as unknown as Firestore;

const guest = (write: boolean, expiresAt?: number): Firestore =>
  env
    .authenticatedContext(`gast-${write}`, guestToken('callA', { write, expiresAt }))
    .firestore() as unknown as Firestore;

const read = (fs: Firestore, path: string) => getDoc(doc(fs, path));
const write = (fs: Firestore, path: string) => setDoc(doc(fs, path), { x: 1 });

beforeAll(async () => {
  env = await createRulesTestEnv();
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const fs = ctx.firestore();
    const docs: Record<string, object> = {
      'call/callA': { group: 'ffnd', name: 'Brand' },
      'call/callA/item/i1': { type: 'marker' },
      'call/callA/kostenersatz/k1': { totalSum: 100, createdBy: 'x' },
      'call/callA/kostenersatz/k1/detail/d1': { a: 1 },
      'call/callB': { group: 'other', name: 'Technisch' },
      'call/callB/kostenersatz/k1': { totalSum: 100 },
      'call/callAll': { group: 'allUsers', name: 'Für alle' },
      'call/callAll/kostenersatz/k1': { totalSum: 100 },
      'groups/ffnd': { name: 'FF Neusiedl' },
      'groups/other': { name: 'FF Andere' },
      'groups/allUsers': { name: 'Pseudo' },
      'groups/kostenersatz': { name: 'Pseudo' },
      'groups/ffnd/vehicle/v1': { name: 'TLF' },
      'kostenersatzVersions/v1': { name: 'LGBl' },
      'kostenersatzRates/r1': { price: 1 },
      'kostenersatzTemplates/t1': { createdBy: 'kostenersatz@example.com', name: 'Eigene' },
      'kostenersatzTemplates/t2': { createdBy: 'jemand@example.com', name: 'Fremde' },
    };
    for (const g of ['ffnd', 'other']) {
      for (const c of GROUP_KOSTENERSATZ) docs[`groups/${g}/${c}/d1`] = { a: 1 };
      for (const c of BEKLEIDUNG) docs[`groups/${g}/${c}/d1`] = { a: 1 };
    }
    for (const user of Object.values(USERS) as TestUser[]) {
      if (!user.groupRoles && !user.legacy) continue;
      docs[`user/${user.uid}`] = {
        ...user.legacy,
        ...(user.groupRoles
          ? { groupRoles: user.groupRoles, ...derivePermissionFields(user.groupRoles) }
          : {}),
      };
    }
    for (const [p, data] of Object.entries(docs)) {
      await setDoc(doc(fs, p), data);
    }
  });
});

const GROUP_KOSTENERSATZ = [
  'atemschutzRechnung',
  'atemschutzEmpfaenger',
  'atemschutzConfig',
  'kostenersatzConfig',
];
const BEKLEIDUNG = [
  'bekleidungArtikel',
  'bekleidungStueck',
  'bekleidungBestand',
  'bekleidungAusgabe',
  'bekleidungWaesche',
];

describe('Einsatz (claim-basiert, unverändert)', () => {
  it('Mitglied liest und schreibt Einsatz und Elemente', async () => {
    await assertSucceeds(read(db(USERS.mitglied), 'call/callA'));
    await assertSucceeds(read(db(USERS.mitglied), 'call/callA/item/i1'));
    await assertSucceeds(write(db(USERS.mitglied), 'call/callA/item/i2'));
  });

  it('Fremder liest nicht', async () => {
    await assertFails(read(db(USERS.fremd), 'call/callA'));
    await assertFails(read(db(USERS.fremd), 'call/callA/item/i1'));
  });

  it('Gast lesend liest, schreibt aber nicht', async () => {
    await assertSucceeds(read(guest(false), 'call/callA/item/i1'));
    await assertFails(write(guest(false), 'call/callA/item/i2'));
  });

  it('Gast schreibend schreibt Elemente', async () => {
    await assertSucceeds(write(guest(true), 'call/callA/item/i2'));
  });

  it('abgelaufener Gast liest nicht', async () => {
    await assertFails(read(guest(true, Date.now() - 1000), 'call/callA/item/i1'));
  });
});

describe('Gruppendaten (Mitgliedschaft aus dem Claim)', () => {
  it('Mitglied liest die eigene Gruppe, Fremder nicht', async () => {
    await assertSucceeds(read(db(USERS.mitglied), 'groups/ffnd'));
    await assertSucceeds(read(db(USERS.mitglied), 'groups/ffnd/vehicle/v1'));
    await assertFails(read(db(USERS.fremd), 'groups/ffnd'));
    await assertFails(read(db(USERS.fremd), 'groups/ffnd/vehicle/v1'));
  });

  it('Mitglied ohne Benutzerdokument liest weiter (kein get())', async () => {
    await assertSucceeds(read(db(USERS.ohneDokument), 'groups/ffnd/vehicle/v1'));
  });

  it('Schein-Gruppen zählen nicht als Mandant', async () => {
    await assertFails(read(db(USERS.mitglied), 'groups/allUsers'));
    await assertFails(read(db(USERS.kostenersatz), 'groups/kostenersatz'));
  });

  it('Mitglied legt eine eigene Füllung an', async () => {
    await assertSucceeds(
      setDoc(doc(db(USERS.mitglied), 'groups/ffnd/atemschutzFuellung/f1'), {
        createdBy: 'mitglied',
      }),
    );
    await assertFails(
      setDoc(doc(db(USERS.fremd), 'groups/ffnd/atemschutzFuellung/f2'), { createdBy: 'fremd' }),
    );
  });
});

describe('Bekleidung (bekleidung.read)', () => {
  it.each(BEKLEIDUNG)('%s: Bekleidungswart und Gruppen-Admin lesen', async (c) => {
    await assertSucceeds(read(db(USERS.bekleidungswart), `groups/ffnd/${c}/d1`));
    await assertSucceeds(read(db(USERS.gruppenadmin), `groups/ffnd/${c}/d1`));
  });

  it.each(BEKLEIDUNG)('%s: Mitglied ohne Rolle liest nicht', async (c) => {
    await assertFails(read(db(USERS.mitglied), `groups/ffnd/${c}/d1`));
    await assertFails(read(db(USERS.kostenersatz), `groups/ffnd/${c}/d1`));
  });

  it('Recht gilt nur in der eigenen Gruppe', async () => {
    await assertFails(read(db(USERS.bekleidungswart), 'groups/other/bekleidungArtikel/d1'));
  });

  it('Recht ohne Mitgliedschaft im Claim reicht nicht', async () => {
    await assertFails(read(db(USERS.ohneClaim), 'groups/ffnd/bekleidungArtikel/d1'));
  });

  it('alte Rollenfelder geben kein Recht mehr', async () => {
    await assertFails(read(db(USERS.altbestand), 'groups/ffnd/bekleidungArtikel/d1'));
  });

  it('ohne Benutzerdokument kein Zugriff', async () => {
    await assertFails(read(db(USERS.ohneDokument), 'groups/ffnd/bekleidungArtikel/d1'));
  });

  it('Admin liest', async () => {
    await assertSucceeds(read(admin(), 'groups/ffnd/bekleidungArtikel/d1'));
  });

  it('niemand außer Admin schreibt direkt', async () => {
    await assertFails(write(db(USERS.bekleidungswart), 'groups/ffnd/bekleidungArtikel/d1'));
    await assertFails(write(db(USERS.gruppenadmin), 'groups/ffnd/bekleidungArtikel/d2'));
  });
});

describe('Kostenersatz der Gruppe (kostenersatz.use)', () => {
  it.each(GROUP_KOSTENERSATZ)('%s: liest, wer das Recht in der Gruppe hat', async (c) => {
    await assertSucceeds(read(db(USERS.kostenersatz), `groups/ffnd/${c}/d1`));
  });

  it.each(GROUP_KOSTENERSATZ)('%s: Mitglied und Gruppen-Admin ohne Recht lesen nicht', async (c) => {
    await assertFails(read(db(USERS.mitglied), `groups/ffnd/${c}/d1`));
    await assertFails(read(db(USERS.gruppenadmin), `groups/ffnd/${c}/d1`));
  });

  it.each(GROUP_KOSTENERSATZ)(
    '%s: Lücke 1 — kein Zugriff in einer anderen Gruppe, in der man nur Mitglied ist',
    async (c) => {
      await assertFails(read(db(USERS.kostenersatz), `groups/other/${c}/d1`));
    },
  );

  it('Schein-Gruppe im Claim ohne abgeleitete Rechte reicht nicht', async () => {
    await assertFails(read(db(USERS.altbestand), 'groups/ffnd/atemschutzRechnung/d1'));
  });

  it('Recht ohne Mitgliedschaft im Claim reicht nicht', async () => {
    await assertFails(read(db(USERS.ohneClaim), 'groups/ffnd/atemschutzRechnung/d1'));
  });

  it('geschrieben wird nur serverseitig', async () => {
    await assertFails(write(db(USERS.kostenersatz), 'groups/ffnd/atemschutzRechnung/d2'));
  });

  it('Admin liest', async () => {
    await assertSucceeds(read(admin(), 'groups/ffnd/atemschutzRechnung/d1'));
  });
});

describe('Kostenersatz am Einsatz (call/{id}/kostenersatz)', () => {
  const calc = 'call/callA/kostenersatz/k1';

  it('mit Recht in der Gruppe des Einsatzes: lesen, anlegen, ändern, löschen', async () => {
    const fs = db(USERS.kostenersatz);
    await assertSucceeds(read(fs, calc));
    await assertSucceeds(write(fs, 'call/callA/kostenersatz/k2'));
    await assertSucceeds(updateDoc(doc(fs, calc), { totalSum: 5 }));
    await assertSucceeds(deleteDoc(doc(fs, calc)));
  });

  it('Lücke 2 — Mitglied ohne Recht liest und schreibt nicht', async () => {
    await assertFails(read(db(USERS.mitglied), calc));
    await assertFails(write(db(USERS.mitglied), calc));
    await assertFails(write(db(USERS.mitglied), 'call/callA/kostenersatz/k3'));
  });

  it('Lücke 2 — Gäste lesen und schreiben nicht', async () => {
    await assertFails(read(guest(false), calc));
    await assertFails(read(guest(true), calc));
    await assertFails(write(guest(true), 'call/callA/kostenersatz/k3'));
  });

  it('Recht in einer anderen Gruppe als der des Einsatzes reicht nicht', async () => {
    await assertFails(read(db(USERS.kostenersatz), 'call/callB/kostenersatz/k1'));
  });

  it('Einsätze der Schein-Gruppe allUsers: nur Admin', async () => {
    await assertFails(read(db(USERS.kostenersatz), 'call/callAll/kostenersatz/k1'));
    await assertSucceeds(read(admin(), 'call/callAll/kostenersatz/k1'));
  });

  it('Pfade unter einer Berechnung sind nicht über den Wildcard offen', async () => {
    await assertFails(read(db(USERS.mitglied), 'call/callA/kostenersatz/k1/detail/d1'));
    await assertFails(read(guest(true), 'call/callA/kostenersatz/k1/detail/d1'));
  });

  it('Gruppen-Admin ohne Kostenersatz liest nicht', async () => {
    await assertFails(read(db(USERS.gruppenadmin), calc));
  });

  it('Admin liest und schreibt', async () => {
    await assertSucceeds(read(admin(), calc));
    await assertSucceeds(write(admin(), calc));
  });
});

describe('globale Kostenersatz-Sammlungen (permsAny)', () => {
  it.each(['kostenersatzVersions/v1', 'kostenersatzRates/r1'])(
    '%s: liest, wer kostenersatz.use in irgendeiner Gruppe hat',
    async (p) => {
      await assertSucceeds(read(db(USERS.kostenersatz), p));
      await assertFails(read(db(USERS.mitglied), p));
      await assertFails(read(db(USERS.altbestand), p));
      await assertFails(write(db(USERS.kostenersatz), p));
    },
  );

  it('Vorlagen: lesen und anlegen mit Recht, sonst nicht', async () => {
    await assertSucceeds(read(db(USERS.kostenersatz), 'kostenersatzTemplates/t2'));
    await assertSucceeds(
      setDoc(doc(db(USERS.kostenersatz), 'kostenersatzTemplates/t3'), {
        createdBy: 'kostenersatz@example.com',
      }),
    );
    await assertFails(read(db(USERS.mitglied), 'kostenersatzTemplates/t1'));
    await assertFails(write(db(USERS.mitglied), 'kostenersatzTemplates/t4'));
  });

  it('Vorlagen: ändern und löschen nur die eigenen', async () => {
    const fs = db(USERS.kostenersatz);
    await assertSucceeds(updateDoc(doc(fs, 'kostenersatzTemplates/t1'), { name: 'neu' }));
    await assertFails(updateDoc(doc(fs, 'kostenersatzTemplates/t2'), { name: 'neu' }));
    await assertFails(deleteDoc(doc(fs, 'kostenersatzTemplates/t2')));
    await assertSucceeds(deleteDoc(doc(fs, 'kostenersatzTemplates/t1')));
  });

  it('Admin ändert fremde Vorlagen', async () => {
    await assertSucceeds(updateDoc(doc(admin(), 'kostenersatzTemplates/t2'), { name: 'neu' }));
  });
});

describe('Benutzerdokument', () => {
  it('nur das eigene ist lesbar, schreiben kann der Benutzer es nicht', async () => {
    await assertSucceeds(read(db(USERS.kostenersatz), 'user/kostenersatz'));
    await assertFails(read(db(USERS.kostenersatz), 'user/mitglied'));
    await assertFails(
      updateDoc(doc(db(USERS.mitglied), 'user/mitglied'), {
        'groupPerms.ffnd': ['kostenersatz.use'],
      }),
    );
  });
});
