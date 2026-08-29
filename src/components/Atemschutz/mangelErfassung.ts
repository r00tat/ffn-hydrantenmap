'use client';

import { useTranslations } from 'next-intl';
import { v4 as uuid } from 'uuid';
import { MANGEL_MAX_IMAGE_BYTES } from '../../common/mangel';
import {
  MangelImageError,
  prepareMangelImage,
  type CompressedImage,
} from '../Fahrtenbuch/compressImage';
import { uploadMangelImage } from '../Fahrtenbuch/uploadMangelImage';
import { createAtemschutzMangel } from './atemschutzActions';

/** Was für einen Mangel eingegeben wird — Text und noch nicht hochgeladene Bilder. */
export interface MangelEingabe {
  description: string;
  images: File[];
}

export const LEERE_MANGEL_EINGABE: MangelEingabe = {
  description: '',
  images: [],
};

/** Ob die Eingabe reicht, um einen Mangel anzulegen. */
export function hatMangelEingabe(eingabe: MangelEingabe): boolean {
  return eingabe.description.trim().length > 0;
}

/**
 * Legt einen Mangel an der Atemschutzausrüstung an und liefert seine ID.
 *
 * Die ID entsteht hier und nicht erst im Server: Der Storage-Pfad der Bilder
 * enthält sie, und die Bilder müssen vor dem Dokument liegen — sonst zeigt das
 * Dokument auf Dateien, die es noch nicht gibt. Dieselbe Reihenfolge wie im
 * Mangel-Dialog des Fahrtenbuchs.
 *
 * Wirft bei einem abgelehnten Bild eine `MangelImageError` und sonst einen
 * `Error` mit dem Schlüssel oder der Meldung des Servers; `mangelFehlerText`
 * übersetzt beides.
 */
export async function saveAtemschutzMangel(
  groupId: string,
  geraetId: string,
  eingabe: MangelEingabe,
): Promise<string> {
  const mangelId = uuid();
  let images: string[] = [];
  if (eingabe.images.length > 0) {
    // Erst alle vorbereiten, dann hochladen: Ein Bild, das die storage.rules
    // ohnehin ablehnen würden, fällt so auf, bevor das erste hochgeladen ist.
    const prepared: CompressedImage[] = [];
    for (const file of eingabe.images) prepared.push(await prepareMangelImage(file));
    images = await Promise.all(
      prepared.map((image) => uploadMangelImage(groupId, mangelId, image)),
    );
  }

  const result = await createAtemschutzMangel(groupId, {
    geraetId,
    description: eingabe.description,
    images,
  });
  if (!result.success || !result.id) {
    throw new Error(result.error ?? 'saveFailed');
  }
  return result.id;
}

/**
 * Übersetzt, was `saveAtemschutzMangel` wirft.
 *
 * Die Bildfehler tragen die Schlüssel des Fahrtenbuchs samt Dateiname und
 * Höchstgröße — dort sind sie bereits übersetzt, und ein zweiter Satz
 * derselben Meldungen liefe auseinander.
 */
export function useMangelFehlerText(): (err: unknown) => string {
  const t = useTranslations('atemschutz');
  const tMaengel = useTranslations('fahrtenbuch.maengel');
  return (err: unknown) => {
    if (err instanceof MangelImageError) {
      return tMaengel(`errors.${err.reason}` as 'errors.imageTooLarge', {
        name: err.fileName,
        size: MANGEL_MAX_IMAGE_BYTES / 1024 / 1024,
      });
    }
    const message = (err as Error)?.message;
    return message || t('errors.saveFailed');
  };
}
