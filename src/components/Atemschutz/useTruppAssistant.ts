'use client';

import { orderBy } from 'firebase/firestore';
import { useCallback, useMemo } from 'react';
import {
  ATEMSCHUTZ_TRUPP_COLLECTION_ID,
  gruppiereTrupps,
  type AtemschutzTrupp,
} from '../../common/atemschutz';
import useFirebaseCollection from '../../hooks/useFirebaseCollection';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import { useFirecall, useFirecallId } from '../../hooks/useFirecall';
import useFirecallWriteAccess from '../../hooks/useFirecallWriteAccess';
import useRegisterMessaging from '../../hooks/useRegisterMessaging';
import { FIRECALL_COLLECTION_ID } from '../firebase/firestore';
import { addDruckabfrage, addTrupp, updateTrupp } from './atemschutzStore';
import {
  planTruppCommand,
  truppKontext,
  type AiTruppContext,
  type TruppCommand,
} from './truppAssistant';
import type { TruppDiaryTrupp } from './truppDiaryEntry';
import { planeUeberwachungWarnung } from './ueberwachungTaskAction';
import useTruppTagebuch from './useTruppTagebuch';

const NO_FIRECALL_MESSAGE =
  'Ohne laufenden Einsatz gibt es keine Atemschutzüberwachung.';
const NO_WRITE_MESSAGE =
  'Du hast in diesem Einsatz kein Schreibrecht für die Atemschutzüberwachung.';

export interface TruppAssistant {
  /** Führt einen Befehl samt allen Nebenwirkungen aus. */
  runTruppCommand: (
    command: TruppCommand,
  ) => Promise<{ success: boolean; message: string }>;
  /** Die laufenden Trupps für den Kontext des Modells. */
  truppContext: AiTruppContext[];
}

/**
 * Die Atemschutzüberwachung für den Sprach-Assistenten.
 *
 * Entschieden wird in `planTruppCommand`; hier wird nur ausgeführt — mit
 * **denselben** Schreibwegen und Nebenwirkungen wie auf der
 * Überwachungsseite (`UeberwachungPage`): Einsatztagebuch über
 * `useTruppTagebuch`, Warntermin über `planeUeberwachungWarnung`,
 * Push-Registrierung über `useRegisterMessaging`. Ein Sprachbefehl, der nur
 * das Dokument schreibt, hätte stille Fristen und ein lückenhaftes Tagebuch.
 *
 * Die Trupps werden hier selbst abonniert und nicht von der Seite
 * hereingereicht: Der Assistent hängt auch an der Karte und am
 * Einsatztagebuch, wo sonst niemand die Trupps lädt. Nur die Trupps — die
 * Ausrüstungsausgabe, die `useAtemschutzEinsatzdaten` mitlädt, braucht der
 * Assistent nicht.
 */
export default function useTruppAssistant(): TruppAssistant {
  const firecallId = useFirecallId();
  const firecall = useFirecall();
  const hatEinsatz = !!firecallId && firecallId !== 'unknown';
  const canWrite = useFirecallWriteAccess();
  const { uid } = useFirebaseLogin();
  const registerMessaging = useRegisterMessaging();
  const schreibeTagebuch = useTruppTagebuch();

  const trupps = useFirebaseCollection<AtemschutzTrupp>({
    collectionName: hatEinsatz ? FIRECALL_COLLECTION_ID : '',
    pathSegments: hatEinsatz ? [firecallId, ATEMSCHUTZ_TRUPP_COLLECTION_ID] : [],
    queryConstraints: [orderBy('bereitSeit', 'desc')],
  });

  const aktuell = useMemo(
    () => (hatEinsatz ? gruppiereTrupps(trupps ?? []).aktuell : []),
    [hatEinsatz, trupps],
  );
  const truppContext = useMemo(() => truppKontext(aktuell), [aktuell]);

  const runTruppCommand = useCallback(
    async (command: TruppCommand) => {
      if (!hatEinsatz) return { success: false, message: NO_FIRECALL_MESSAGE };
      if (!canWrite) return { success: false, message: NO_WRITE_MESSAGE };

      const jetzt = new Date().toISOString();
      const plan = planTruppCommand(command, {
        trupps: aktuell,
        jetzt,
        uid: uid ?? '',
        fireDepartment: firecall.fw,
      });
      if (!plan.ok) return { success: false, message: plan.message };

      const actor = { userId: uid ?? '', now: jetzt };
      let truppId: string;
      // Der Trupp **nach** dem Schreibvorgang — das Tagebuch soll den eben
      // gegebenen Auftrag kennen, wie auf der Seite.
      let nachher: TruppDiaryTrupp;
      try {
        switch (plan.write.art) {
          case 'add': {
            truppId = await addTrupp(firecallId, plan.write.data, actor);
            nachher = { ...plan.write.data, id: truppId };
            break;
          }
          case 'update': {
            truppId = plan.write.truppId;
            await updateTrupp(firecallId, truppId, plan.write.patch, actor);
            nachher = { ...(plan.trupp as AtemschutzTrupp), ...plan.write.patch };
            break;
          }
          case 'abfrage': {
            const trupp = plan.trupp as AtemschutzTrupp;
            truppId = trupp.id as string;
            // `arrayUnion` im Store: Ein zweites Gerät am selben Trupp
            // verliert seine Abfrage nicht.
            await addDruckabfrage(firecallId, trupp, plan.write.abfrage, actor);
            nachher = trupp;
            break;
          }
        }
      } catch (err) {
        console.warn('[AI] Atemschutztrupp: Speichern fehlgeschlagen', err);
        return {
          success: false,
          message: 'Das Speichern ist fehlgeschlagen. Bitte auf der Überwachungsseite prüfen.',
        };
      }

      // Die Nebenwirkungen scheitern nicht mit dem Befehl: Geschrieben ist
      // er schon, und der Zeitplan findet den Trupp auch ohne Termin.
      const abfrage = plan.write.art === 'abfrage' ? plan.write.abfrage : undefined;
      for (const anlass of plan.tagebuch) {
        await schreibeTagebuch(nachher, anlass, abfrage);
      }
      if (plan.push) {
        await registerMessaging().catch((err) => {
          console.warn('Push-Registrierung fehlgeschlagen', err);
        });
      }
      if (plan.warnung) {
        await planeUeberwachungWarnung(firecallId, truppId).catch((err) => {
          console.warn('Terminplanung der Atemschutzwarnung fehlgeschlagen', err);
        });
      }
      return { success: true, message: plan.message };
    },
    [aktuell, canWrite, firecall.fw, firecallId, hatEinsatz, registerMessaging, schreibeTagebuch, uid],
  );

  return { runTruppCommand, truppContext };
}
