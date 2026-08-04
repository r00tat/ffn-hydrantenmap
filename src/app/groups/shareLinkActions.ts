'use server';
import 'server-only';

import type { WriteBatch } from 'firebase-admin/firestore';
import { headers } from 'next/headers';
import {
  FAHRTENBUCH_SHARE_LINK_COLLECTION_ID,
  type FahrtenbuchShareLink,
  type ShareLinkInfo,
} from '../../common/fahrtenbuchShare';
import { assertFahrtenbuchGroup } from '../../components/Fahrtenbuch/authGuards';
import { firestore } from '../../server/firebase/admin';
import {
  generateShareLinkId,
  generateShareToken,
} from '../../server/fahrtenbuchShare/shareToken';
import { actionAdminRequired } from '../auth';

function linksRef() {
  return firestore.collection(FAHRTENBUCH_SHARE_LINK_COLLECTION_ID);
}

/**
 * Die öffentliche Basis-URL. `NEXTAUTH_URL` ist die kanonische Adresse; hinter
 * einem Proxy oder in der Capacitor-App ist `window.location.origin` falsch
 * (dort `https://localhost`), deshalb wird die URL serverseitig gebaut. Der
 * Header-Fallback deckt die lokale Entwicklung ab, wo `NEXTAUTH_URL` fehlen
 * kann.
 */
async function baseUrl(): Promise<string> {
  if (process.env.NEXTAUTH_URL) {
    return process.env.NEXTAUTH_URL.replace(/\/$/, '');
  }
  const headerList = await headers();
  const host = headerList.get('host') ?? 'localhost:3000';
  const proto = headerList.get('x-forwarded-proto') ?? 'http';
  return `${proto}://${host}`;
}

async function toInfo(
  token: string,
  data: FahrtenbuchShareLink,
): Promise<ShareLinkInfo> {
  return {
    url: `${await baseUrl()}/fahrtenbuch/teilen/${token}`,
    createdAt: data.createdAt,
    createdByName: data.createdByName,
  };
}

/**
 * Alle nicht widerrufenen Links der Gruppe, neuester zuerst.
 *
 * Im Normalfall ist das höchstens einer. Zwei können entstehen, wenn zwei
 * Admins gleichzeitig „Neu erzeugen" klicken — es gibt keine Transaktion, und
 * eine wäre hier auch übertrieben. Deshalb wird die Mehrzahl bewusst
 * ausgehalten: Angezeigt wird der neueste, und Widerrufen trifft *alle*. Sonst
 * bliebe nach einem Widerruf still ein zweiter gültiger Link im Umlauf — genau
 * das, was der Widerruf verhindern soll.
 */
async function activeLinks(groupId: string) {
  const snapshot = await linksRef().where('groupId', '==', groupId).get();
  return snapshot.docs
    .filter((doc) => !(doc.data() as FahrtenbuchShareLink).revokedAt)
    .sort((a, b) =>
      ((b.data() as FahrtenbuchShareLink).createdAt ?? '').localeCompare(
        (a.data() as FahrtenbuchShareLink).createdAt ?? '',
      ),
    );
}

/** Der anzuzeigende Link der Gruppe — der neueste aktive, oder undefined. */
async function activeLink(groupId: string) {
  return (await activeLinks(groupId))[0];
}

/**
 * Trägt den Widerruf aller aktiven Links der Gruppe in den übergebenen Batch
 * ein und liefert die Anzahl. Der Batch statt einzelner `update`s, damit
 * „Neu erzeugen" den Widerruf und die Neuanlage in *einem* Commit ablegen kann:
 * scheitert das Anlegen, darf der bisherige Link nicht schon widerrufen sein —
 * sonst zeigt der Dialog eine tote URL samt bereits ausgedrucktem QR-Code an.
 */
async function revokeActiveLinks(
  groupId: string,
  now: string,
  batch: WriteBatch,
) {
  const docs = await activeLinks(groupId);
  docs.forEach((doc) => batch.update(doc.ref, { revokedAt: now }));
  return docs.length;
}

export async function getFahrtenbuchShareLink(
  groupId: string,
): Promise<ShareLinkInfo | null> {
  await actionAdminRequired();
  assertFahrtenbuchGroup(groupId);

  const doc = await activeLink(groupId);
  if (!doc) return null;
  return toInfo(doc.id, doc.data() as FahrtenbuchShareLink);
}

/**
 * Erzeugt einen neuen Link und widerruft die bisherigen. Ein Widerruf setzt
 * `revokedAt` statt zu löschen — sonst wäre ein `createdBy: share:<linkId>` an
 * einem Eintrag später nicht mehr zuordenbar.
 *
 * Widerruf und Neuanlage laufen in einem Batch: entweder greift beides oder
 * nichts. Zwei getrennte Schreibvorgänge könnten die Gruppe ohne gültigen Link
 * zurücklassen, während der Dialog unverändert die alte URL zeigt.
 */
export async function createFahrtenbuchShareLink(
  groupId: string,
): Promise<ShareLinkInfo> {
  const session = await actionAdminRequired();
  assertFahrtenbuchGroup(groupId);

  const now = new Date().toISOString();
  const batch = firestore.batch();
  await revokeActiveLinks(groupId, now, batch);

  const token = generateShareToken();
  const data: FahrtenbuchShareLink = {
    groupId,
    // Nicht geheime Kennung für `createdBy` erfasster Fahrten — der Token, also
    // die Dokument-ID, darf dort nicht landen.
    linkId: generateShareLinkId(),
    createdAt: now,
    createdBy: session.user.id,
    createdByName: session.user.name ?? session.user.email ?? '',
  };
  batch.set(linksRef().doc(token), data);
  await batch.commit();

  return toInfo(token, data);
}

export async function revokeFahrtenbuchShareLink(
  groupId: string,
): Promise<void> {
  await actionAdminRequired();
  assertFahrtenbuchGroup(groupId);

  const batch = firestore.batch();
  const revoked = await revokeActiveLinks(
    groupId,
    new Date().toISOString(),
    batch,
  );
  // Ein leerer Commit wäre erlaubt, aber ein überflüssiger Roundtrip.
  if (revoked > 0) await batch.commit();
}
