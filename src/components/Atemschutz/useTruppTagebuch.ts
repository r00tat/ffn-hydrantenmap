'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import type { Druckabfrage } from '../../common/atemschutz';
import { useFirecallId } from '../../hooks/useFirecall';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';
import { vermerkeTagebuch } from './atemschutzStore';
import {
  buildTruppDiaryEntry,
  type TagebuchAnlass,
  type TruppDiaryLabels,
  type TruppDiaryTrupp,
} from './truppDiaryEntry';

/**
 * Schreibt ein Trupp-Ereignis ins Einsatztagebuch — genau einmal.
 *
 * Der Hook hält die Regeln, die auf **beiden** Seiten gelten (Sammelplatz und
 * Überwachung): welcher Anlass einen Merker bekommt, und dass ein
 * fehlgeschlagener Eintrag den eigentlichen Schreibvorgang nicht mitreißt.
 * Dasselbe Muster wie `planeWarnung`: Ein fehlender Tagebucheintrag darf keine
 * Druckabfrage verhindern.
 *
 * Der übergebene Trupp muss der Zustand **nach** dem Schreibvorgang sein —
 * die Aufrufer reichen `{ ...trupp, ...patch }` herein.
 */
export default function useTruppTagebuch() {
  const t = useTranslations('atemschutz');
  const addItem = useFirecallItemAdd();
  const firecallId = useFirecallId();
  const { uid } = useFirebaseLogin();

  return useCallback(
    async (
      trupp: TruppDiaryTrupp,
      anlass: TagebuchAnlass,
      abfrage?: Druckabfrage,
    ): Promise<void> => {
      if (!trupp.id) return;
      // Zwei Geräte sehen denselben Trupp; ohne diese Schranke entstünde der
      // Eintrag ein zweites Mal, sobald jemand einen Dialog erneut speichert.
      if (anlass !== 'meldung' && trupp.tagebuch?.[anlass]) return;

      const jetzt = new Date().toISOString();
      const labels: TruppDiaryLabels = {
        auftrag: ({ trupp: name, auftrag, ziel }) =>
          auftrag && ziel
            ? t('tagebuch.auftragMitZiel', { trupp: name, auftrag, ziel })
            : auftrag
              ? t('tagebuch.auftragNurAuftrag', { trupp: name, auftrag })
              : ziel
                ? t('tagebuch.auftragNurZiel', { trupp: name, ziel })
                : t('tagebuch.auftragOhne', { trupp: name }),
        amZiel: ({ trupp: name, ziel }) =>
          ziel
            ? t('tagebuch.amZielMitZiel', { trupp: name, ziel })
            : t('tagebuch.amZielOhne', { trupp: name }),
        rueckzug: ({ trupp: name }) => t('tagebuch.rueckzug', { trupp: name }),
        rueckkehr: ({ trupp: name, einheit }) =>
          einheit
            ? t('tagebuch.rueckkehrMitEinheit', { trupp: name, einheit })
            : t('tagebuch.rueckkehrOhne', { trupp: name }),
        meldung: ({ trupp: name, text }) =>
          text
            ? t('tagebuch.meldung', { trupp: name, text })
            : t('tagebuch.meldungOhneText', { trupp: name }),
        druck: (bar) => t('tagebuch.druck', { druck: bar }),
        abmarschdruck: (bar) => t('tagebuch.abmarschdruck', { druck: bar }),
        einsatzdauer: (minuten) => t('tagebuch.einsatzdauer', { minuten }),
      };

      try {
        await addItem(
          buildTruppDiaryEntry({
            anlass,
            trupp,
            abfrage,
            // Der Zeitpunkt der **Meldung**, nicht der der Erfassung: Über
            // Funk kommt sie eine Minute vor dem Tippen, und im Tagebuch soll
            // sie an der richtigen Stelle stehen.
            zeitpunkt: abfrage?.zeitpunkt ?? jetzt,
            labels,
          }),
        );
        if (anlass !== 'meldung') {
          await vermerkeTagebuch(firecallId, trupp.id, anlass, {
            userId: uid ?? '',
            now: jetzt,
          });
        }
      } catch (err) {
        // Nicht weiterwerfen: Der Zustandswechsel oder die Druckabfrage sind
        // schon geschrieben, und ein Tagebucheintrag ist die Nebensache.
        console.warn('Tagebucheintrag fehlgeschlagen', err);
      }
    },
    [addItem, firecallId, t, uid],
  );
}
