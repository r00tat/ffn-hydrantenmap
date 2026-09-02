'use client';
import { doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useCallback, useEffect, useRef } from 'react';
import { firestore } from '../components/firebase/firebase';
import { deleteDoc, setDoc } from '../lib/firestoreClient';
import { FIRECALL_COLLECTION_ID } from '../components/firebase/firestore';
import {
  liveLocationDocId,
  LIVE_LOCATION_COLLECTION_ID,
  TTL_EXPIRY_MS,
} from '../common/liveLocation';
import type { LiveLocationSettings } from './useLiveLocationSettings';
import type { GeoPositionObject } from '../common/geo';

interface ShareIdentity {
  firecallId: string;
  uid: string;
  /** Ein Dokument je Gerät, siehe `liveLocationDocId`. */
  deviceId: string;
  deviceLabel: string;
  name: string;
  email: string;
}

export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function shouldSendUpdate(
  lastSentMs: number | undefined,
  nowMs: number,
  lastPos: { lat: number; lng: number } | undefined,
  currentPos: { lat: number; lng: number },
  settings: LiveLocationSettings
): boolean {
  if (lastSentMs === undefined || !lastPos) return true;
  const elapsed = nowMs - lastSentMs;
  if (elapsed >= settings.heartbeatMs) return true;
  if (distanceMeters(lastPos, currentPos) >= settings.distanceM) return true;
  return false;
}

export interface LiveLocationShareApi {
  /** Push a fresh position if the throttle gate allows. */
  maybeSend: (
    pos: GeoPositionObject,
    location: GeolocationPosition | undefined
  ) => Promise<void>;
  /** Delete the user's doc (called on stop / firecall change). */
  deleteOwn: () => Promise<void>;
}

export function useLiveLocationShare(
  identity: ShareIdentity | null,
  settings: LiveLocationSettings
): LiveLocationShareApi {
  const lastSentMsRef = useRef<number | undefined>(undefined);
  const lastPosRef = useRef<{ lat: number; lng: number } | undefined>(undefined);
  const legacyCleanedRef = useRef(false);

  const docRefFor = useCallback(
    (id: ShareIdentity, docId: string) =>
      doc(
        firestore,
        FIRECALL_COLLECTION_ID,
        id.firecallId,
        LIVE_LOCATION_COLLECTION_ID,
        docId
      ),
    []
  );

  const maybeSend = useCallback(
    async (
      pos: GeoPositionObject,
      location: GeolocationPosition | undefined
    ) => {
      if (!identity) return;
      const now = Date.now();
      if (
        !shouldSendUpdate(
          lastSentMsRef.current,
          now,
          lastPosRef.current,
          { lat: pos.lat, lng: pos.lng },
          settings
        )
      ) {
        return;
      }
      const ref = docRefFor(
        identity,
        liveLocationDocId(identity.uid, identity.deviceId)
      );
      const payload: Record<string, unknown> = {
        uid: identity.uid,
        deviceId: identity.deviceId,
        deviceLabel: identity.deviceLabel,
        name: identity.name,
        email: identity.email,
        lat: pos.lat,
        lng: pos.lng,
        updatedAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + TTL_EXPIRY_MS),
      };
      const accuracy = location?.coords.accuracy;
      if (typeof accuracy === 'number' && Number.isFinite(accuracy)) {
        payload.accuracy = accuracy;
      }
      const heading = location?.coords.heading;
      if (typeof heading === 'number' && Number.isFinite(heading)) {
        payload.heading = heading;
      }
      const speed = location?.coords.speed;
      if (typeof speed === 'number' && Number.isFinite(speed)) {
        payload.speed = speed;
      }
      await setDoc(ref, payload);
      lastSentMsRef.current = now;
      lastPosRef.current = { lat: pos.lat, lng: pos.lng };

      // Beim ersten Schreiben nach dem Update liegt unter der bloßen uid noch
      // das Dokument der Vorgängerversion. Ohne Aufräumen stünde der eigene
      // Pin bis zum TTL-Ablauf (1 h) doppelt auf den Karten der anderen.
      if (!legacyCleanedRef.current && identity.deviceId) {
        legacyCleanedRef.current = true;
        await deleteDoc(docRefFor(identity, identity.uid)).catch(() => {});
      }
    },
    [identity, settings, docRefFor]
  );

  const deleteOwn = useCallback(async () => {
    if (!identity) return;
    // Beide Dokumente: das dieses Geräts und — solange die Umstellung noch
    // nicht überall durch ist — das der Vorgängerversion unter der bloßen uid.
    const docIds = [liveLocationDocId(identity.uid, identity.deviceId)];
    if (identity.deviceId) docIds.push(identity.uid);
    for (const docId of docIds) {
      await deleteDoc(docRefFor(identity, docId)).catch((err) => {
        console.warn('[liveLocation] deleteOwn failed', err);
      });
    }
    lastSentMsRef.current = undefined;
    lastPosRef.current = undefined;
  }, [identity, docRefFor]);

  // Reset internal state when identity (firecall/user) changes.
  useEffect(() => {
    lastSentMsRef.current = undefined;
    lastPosRef.current = undefined;
    legacyCleanedRef.current = false;
  }, [identity?.firecallId, identity?.uid]);

  return { maybeSend, deleteOwn };
}
