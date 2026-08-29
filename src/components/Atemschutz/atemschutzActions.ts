'use server';
import 'server-only';

import {
  ATEMSCHUTZ_GERAET_TYPEN,
  type AtemschutzGeraet,
  type AtemschutzGeraetTyp,
} from '../../common/atemschutz';
import { actionGroupAdminRequired } from '../../app/auth';
import { geraeteRef } from './atemschutzStammdaten';

export interface AtemschutzActionResult {
  success: boolean;
  error?: string;
  id?: string;
}

/** Die Felder, die der Verwaltungsdialog schreiben darf. */
export type GeraetInput = Pick<
  AtemschutzGeraet,
  | 'typ'
  | 'bezeichnung'
  | 'feuerwehr'
  | 'nummer'
  | 'inventarNr'
  | 'zusatzInventarNr'
  | 'seriennummer'
  | 'externeId'
  | 'barcodes'
  | 'nenndruck'
  | 'volumenLiter'
  | 'material'
  | 'hersteller'
  | 'baujahr'
  | 'active'
  | 'bemerkung'
>;

function trimmed(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

/**
 * Baut das zu speichernde Dokument aus der Client-Eingabe.
 *
 * Server-Action-Argumente sind Client-Eingabe und der `Pick<>`-Typ ist zur
 * Laufzeit weg — deshalb hier bereinigen statt roh zu speichern, dieselbe
 * Vorsicht wie in `saveFahrtenbuchVehicle`. Leere Felder werden weggelassen
 * statt als leerer String gespeichert: `lookupKeys` filtert sie ohnehin, und
 * ein leerer String im Dokument sieht aus wie eine gepflegte Angabe.
 */
function buildGeraetPayload(input: GeraetInput): Record<string, unknown> {
  const typ: AtemschutzGeraetTyp = ATEMSCHUTZ_GERAET_TYPEN.includes(input.typ)
    ? input.typ
    : 'zubehoer';

  const payload: Record<string, unknown> = {
    typ,
    bezeichnung: trimmed(input.bezeichnung) ?? '',
    feuerwehr: trimmed(input.feuerwehr) ?? '',
    active: input.active !== false,
  };

  const optionalStrings: (keyof GeraetInput)[] = [
    'nummer',
    'inventarNr',
    'zusatzInventarNr',
    'seriennummer',
    'externeId',
    'material',
    'hersteller',
    'bemerkung',
  ];
  for (const key of optionalStrings) {
    const value = trimmed(input[key]);
    if (value) payload[key] = value;
  }

  const barcodes = Array.isArray(input.barcodes)
    ? [
        ...new Set(
          input.barcodes
            .map((b) => trimmed(b))
            .filter((b): b is string => !!b),
        ),
      ]
    : [];
  if (barcodes.length > 0) payload.barcodes = barcodes;

  const nenndruck = positiveNumber(input.nenndruck);
  if (nenndruck) payload.nenndruck = nenndruck;
  const volumen = positiveNumber(input.volumenLiter);
  if (volumen) payload.volumenLiter = volumen;
  const baujahr = positiveNumber(input.baujahr);
  if (baujahr) payload.baujahr = baujahr;

  return payload;
}

export async function saveAtemschutzGeraet(
  groupId: string,
  geraetId: string | undefined,
  input: GeraetInput,
): Promise<AtemschutzActionResult> {
  try {
    const session = await actionGroupAdminRequired(groupId);
    const now = new Date().toISOString();
    const payload = {
      ...buildGeraetPayload(input),
      updatedAt: now,
      updatedBy: session.user.id,
    };

    if (geraetId) {
      await geraeteRef(groupId).doc(geraetId).set(payload, { merge: true });
      return { success: true, id: geraetId };
    }
    const ref = await geraeteRef(groupId).add({
      ...payload,
      createdAt: now,
      createdBy: session.user.id,
    });
    return { success: true, id: ref.id };
  } catch (err) {
    console.error('saveAtemschutzGeraet failed', err);
    return { success: false, error: (err as Error).message };
  }
}

export async function deleteAtemschutzGeraet(
  groupId: string,
  geraetId: string,
): Promise<AtemschutzActionResult> {
  try {
    await actionGroupAdminRequired(groupId);
    await geraeteRef(groupId).doc(geraetId).delete();
    return { success: true, id: geraetId };
  } catch (err) {
    console.error('deleteAtemschutzGeraet failed', err);
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Lernt einen gescannten Code an einem Gerät an.
 *
 * Eigene Action und nicht `saveAtemschutzGeraet` mit voller Eingabe: Der
 * Anlern-Knopf steht im Einsatzdialog, wo niemand die übrigen Stammdaten in
 * der Hand hat — ein Rundlauf über das ganze Dokument würde dort Felder
 * überschreiben, die der Dialog gar nicht kennt.
 */
export async function addAtemschutzBarcode(
  groupId: string,
  geraetId: string,
  code: string,
): Promise<AtemschutzActionResult> {
  try {
    const session = await actionGroupAdminRequired(groupId);
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      return { success: false, error: 'codeMissing' };
    }
    const ref = geraeteRef(groupId).doc(geraetId);
    const doc = await ref.get();
    if (!doc.exists) {
      return { success: false, error: 'geraetNotFound' };
    }
    const existing = (doc.data() as AtemschutzGeraet).barcodes ?? [];
    if (existing.includes(trimmedCode)) {
      return { success: true, id: geraetId };
    }
    await ref.set(
      {
        barcodes: [...existing, trimmedCode],
        updatedAt: new Date().toISOString(),
        updatedBy: session.user.id,
      },
      { merge: true },
    );
    return { success: true, id: geraetId };
  } catch (err) {
    console.error('addAtemschutzBarcode failed', err);
    return { success: false, error: (err as Error).message };
  }
}
