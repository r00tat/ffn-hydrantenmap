import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteObject,
  getBytes,
  ref,
  updateMetadata,
  uploadBytes,
} from 'firebase/storage';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { adminToken, createStorageRulesTestEnv, memberToken } from './rulesTestEnv';

let env: RulesTestEnvironment;

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

beforeAll(async () => {
  env = await createStorageRulesTestEnv();
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const storage = ctx.storage();
    await uploadBytes(ref(storage, 'risikoobjekt/ro1/d1-plan.pdf'), PDF, {
      contentType: 'application/pdf',
      customMetadata: { groups: 'ffnd,other' },
    });
    await uploadBytes(ref(storage, 'risikoobjekt/ro3/d1-plan.pdf'), PDF, {
      contentType: 'application/pdf',
    });
    await uploadBytes(ref(storage, 'gefahrobjekt/g1/d1-plan.pdf'), PDF, {
      contentType: 'application/pdf',
      customMetadata: { groups: 'ffnd' },
    });
    await uploadBytes(ref(storage, 'hydrant/h1/d1-plan.pdf'), PDF, {
      contentType: 'application/pdf',
      customMetadata: { groups: 'ffnd' },
    });
  });
});

function storageAs(token: Record<string, unknown>, uid = 'u1') {
  return env.authenticatedContext(uid, token).storage();
}

describe('Storage: risikoobjekt', () => {
  it('lässt Mitglieder einer freigegebenen Gruppe lesen', async () => {
    const storage = storageAs(memberToken('m@example.com', ['ffnd']));
    await assertSucceeds(getBytes(ref(storage, 'risikoobjekt/ro1/d1-plan.pdf')));
  });

  it('sperrt fremde Gruppen und Dateien ohne Freigabe', async () => {
    const storage = storageAs(memberToken('m@example.com', ['fremd']));
    await assertFails(getBytes(ref(storage, 'risikoobjekt/ro1/d1-plan.pdf')));
    const member = storageAs(memberToken('m@example.com', ['ffnd']));
    await assertFails(getBytes(ref(member, 'risikoobjekt/ro3/d1-plan.pdf')));
  });

  it('lässt den Admin alles lesen', async () => {
    const storage = storageAs(adminToken(), 'admin');
    await assertSucceeds(getBytes(ref(storage, 'risikoobjekt/ro3/d1-plan.pdf')));
  });

  it('nimmt Uploads nur mit der eigenen Gruppe im Metadatum an', async () => {
    const storage = storageAs(memberToken('m@example.com', ['ffnd']));
    await assertSucceeds(
      uploadBytes(ref(storage, 'risikoobjekt/ro1/d2-neu.pdf'), PDF, {
        contentType: 'application/pdf',
        customMetadata: { groups: 'ffnd' },
      }),
    );
    await assertFails(
      uploadBytes(ref(storage, 'risikoobjekt/ro1/d3-neu.pdf'), PDF, {
        contentType: 'application/pdf',
        customMetadata: { groups: 'fremd' },
      }),
    );
    await assertFails(
      uploadBytes(ref(storage, 'risikoobjekt/ro1/d4-neu.pdf'), PDF, {
        contentType: 'application/pdf',
      }),
    );
  });

  it('weist andere Dateitypen ab', async () => {
    const storage = storageAs(memberToken('m@example.com', ['ffnd']));
    await assertFails(
      uploadBytes(ref(storage, 'risikoobjekt/ro1/d5-x.html'), PDF, {
        contentType: 'text/html',
        customMetadata: { groups: 'ffnd' },
      }),
    );
  });

  it('lässt nur den Admin ändern und löschen', async () => {
    const member = storageAs(memberToken('m@example.com', ['ffnd']));
    await assertFails(
      updateMetadata(ref(member, 'risikoobjekt/ro1/d1-plan.pdf'), {
        customMetadata: { groups: 'ffnd' },
      }),
    );
    await assertFails(deleteObject(ref(member, 'risikoobjekt/ro1/d1-plan.pdf')));
    const admin = storageAs(adminToken(), 'admin');
    await assertSucceeds(deleteObject(ref(admin, 'risikoobjekt/ro1/d1-plan.pdf')));
  });
});

describe('Storage: gefahrobjekt', () => {
  it('gilt wie bei Risikoobjekten', async () => {
    const member = storageAs(memberToken('m@example.com', ['ffnd']));
    await assertSucceeds(getBytes(ref(member, 'gefahrobjekt/g1/d1-plan.pdf')));
    const fremd = storageAs(memberToken('m@example.com', ['fremd']));
    await assertFails(getBytes(ref(fremd, 'gefahrobjekt/g1/d1-plan.pdf')));
    await assertSucceeds(
      uploadBytes(ref(member, 'gefahrobjekt/g1/d2-neu.pdf'), PDF, {
        contentType: 'application/pdf',
        customMetadata: { groups: 'ffnd' },
      }),
    );
  });

  it('öffnet keine anderen Pfade mit drei Teilen', async () => {
    const member = storageAs(memberToken('m@example.com', ['ffnd']));
    await assertFails(getBytes(ref(member, 'hydrant/h1/d1-plan.pdf')));
    await assertFails(
      uploadBytes(ref(member, 'hydrant/h1/d2-neu.pdf'), PDF, {
        contentType: 'application/pdf',
        customMetadata: { groups: 'ffnd' },
      }),
    );
  });
});
