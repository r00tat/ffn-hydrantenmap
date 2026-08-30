'use server';
import 'server-only';

import path from 'path';
import { renderToBuffer } from '@react-pdf/renderer';
import { FieldValue } from 'firebase-admin/firestore';
import { actionGroupAdminRequired } from '../../app/auth';
import type { AtemschutzFuellung } from '../../common/atemschutz';
import {
  DEFAULT_RECHNUNG_CONFIG,
  FUELLUNG_TARIF_IDS,
  empfaengerKopie,
  naechsteRechnungsnummer,
  rechnungPositionen,
  rechnungStatusErlaubt,
  rechnungSumme,
  zeitraumDerPositionen,
  type AtemschutzEmpfaenger,
  type AtemschutzRechnung,
  type AtemschutzRechnungConfig,
  type EmpfaengerKopie,
  type PositionEingabe,
} from '../../common/atemschutzRechnung';
import { renderTemplate } from '../../common/kostenersatzEmail';
import { firestore } from '../../server/firebase/admin';
import { buildMailMessage } from '../../server/mail/buildMailMessage';
import { mailSender, sendRawMail } from '../../server/mail/sendRawMail';
import { actionErrorKey } from '../Fahrtenbuch/actionErrorKey';
import { GROUP_COLLECTION_ID } from '../firebase/firestore';
import FuellungRechnungPdf from './FuellungRechnungPdf';
import { actionFuellungRechnungRequired } from './rechnungGuards';
import {
  empfaengerRef,
  fuellungRef,
  loadFuellungTarife,
  loadRechnung,
  loadRechnungConfig,
  loadVolumen,
  rechnungConfigRef,
  rechnungRef,
} from './rechnungStore';

export interface RechnungActionResult {
  success: boolean;
  error?: string;
  id?: string;
}

export interface RechnungPdfResult {
  success: boolean;
  error?: string;
  fileName?: string;
  /**
   * Das PDF als base64. Eine Server Action liefert keinen Stream; dieselbe
   * Abwägung wie in `exportFahrtenbuchPdf` — eine API-Route mit ID-Token im
   * Header brächte hier nichts, die Action bringt die Prüfung schon mit.
   */
  pdfBase64?: string;
}

/** Die Auswahl aus dem Dialog: welche Füllung mit welchem Tarif. */
export interface RechnungPositionWahl {
  fuellungId: string;
  tarifId?: string;
}

export interface CreateRechnungRequest {
  groupId: string;
  positionen: RechnungPositionWahl[];
  /** Aus dem Adressbuch gewählt. Ohne Eintrag geht keine Rechnung. */
  empfaengerId: string;
  datum?: string;
  bemerkung?: string;
}

const LOGO_PATH = path.join(process.cwd(), 'public', 'FFND_logo.png');

function trimmed(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

async function loadGroupFeuerwehrName(groupId: string): Promise<string> {
  const doc = await firestore
    .collection(GROUP_COLLECTION_ID)
    .doc(groupId)
    .get();
  const data = doc.data();
  return trimmed(data?.feuerwehrName) ?? trimmed(data?.name) ?? '';
}

/**
 * Legt die Rechnung an, friert die Preise ein und markiert die enthaltenen
 * Füllungen.
 *
 * Alles in einer Transaktion: Die laufende Nummer wird darin hochgezählt (zwei
 * gleichzeitige Entwürfe bekämen sonst dieselbe), und die Füllungen werden
 * darin noch einmal gelesen — zwischen dem Öffnen des Dialogs und dem Klick
 * kann eine Zeile bereits auf einer anderen Rechnung gelandet sein.
 */
export async function createFuellungRechnung(
  request: CreateRechnungRequest,
): Promise<RechnungActionResult> {
  try {
    const { groupId, positionen, empfaengerId, datum, bemerkung } = request;
    const session = await actionFuellungRechnungRequired(groupId);

    if (!Array.isArray(positionen) || positionen.length === 0) {
      return { success: false, error: 'rechnungNoPositions' };
    }
    if (!trimmed(empfaengerId)) {
      return { success: false, error: 'rechnungNoRecipient' };
    }

    const empfaengerDoc = await empfaengerRef(groupId).doc(empfaengerId).get();
    if (!empfaengerDoc.exists) {
      return { success: false, error: 'rechnungNoRecipient' };
    }
    const empfaenger = {
      id: empfaengerDoc.id,
      ...empfaengerDoc.data(),
    } as AtemschutzEmpfaenger;

    const [{ preise, rateVersion }, volumen, config] = await Promise.all([
      loadFuellungTarife(),
      loadVolumen(groupId),
      loadRechnungConfig(groupId),
    ]);

    const userId = session.user.email ?? session.user.name ?? 'unbekannt';
    const now = new Date().toISOString();
    const jahr = new Date(trimmed(datum) ?? now).getFullYear();
    const neueRechnung = rechnungRef(groupId).doc();

    await firestore.runTransaction(async (tx) => {
      const fuellungDocs = await tx.getAll(
        ...positionen.map((p) => fuellungRef(groupId).doc(p.fuellungId)),
      );
      const configDoc = await tx.get(rechnungConfigRef(groupId));

      const eingaben: PositionEingabe[] = [];
      fuellungDocs.forEach((doc, index) => {
        if (!doc.exists) throw new Error('rechnungFuellungGone');
        const fuellung = { id: doc.id, ...doc.data() } as AtemschutzFuellung;
        if (!fuellung.verrechnen || fuellung.rechnungId) {
          throw new Error('rechnungFuellungTaken');
        }
        eingaben.push({
          fuellung,
          volumenLiter: fuellung.geraetId
            ? volumen[fuellung.geraetId]
            : undefined,
          tarifId: FUELLUNG_TARIF_IDS.includes(positionen[index].tarifId ?? '')
            ? positionen[index].tarifId
            : undefined,
        });
      });

      const gebaut = rechnungPositionen(eingaben, preise, config.vorgabeTarif);
      const zeitraum = zeitraumDerPositionen(gebaut);

      const nummernkreis: Record<string, number> = {
        ...((configDoc.data()?.nummernkreis as Record<string, number>) ?? {}),
      };
      const nummer = naechsteRechnungsnummer(jahr, nummernkreis[jahr] ?? 0);
      nummernkreis[jahr] = (nummernkreis[jahr] ?? 0) + 1;

      const kopie: EmpfaengerKopie = empfaengerKopie(empfaenger);
      const rechnung: AtemschutzRechnung = {
        nummer,
        status: 'draft',
        empfaenger: kopie,
        empfaengerId: empfaenger.id,
        positionen: gebaut,
        rateVersion,
        summe: rechnungSumme(gebaut),
        datum: trimmed(datum) ?? now,
        zeitraumVon: zeitraum.von,
        zeitraumBis: zeitraum.bis,
        ...(trimmed(bemerkung) ? { bemerkung: trimmed(bemerkung) } : {}),
        createdAt: now,
        createdBy: userId,
        updatedAt: now,
        updatedBy: userId,
      };

      tx.set(neueRechnung, rechnung);
      tx.set(
        rechnungConfigRef(groupId),
        { nummernkreis, updatedAt: now, updatedBy: userId },
        { merge: true },
      );
      for (const position of gebaut) {
        tx.update(fuellungRef(groupId).doc(position.fuellungId), {
          rechnungId: neueRechnung.id,
          updatedAt: now,
          updatedBy: userId,
        });
      }
    });

    return { success: true, id: neueRechnung.id };
  } catch (err) {
    console.error('createFuellungRechnung failed', err);
    return { success: false, error: actionErrorKey(err) };
  }
}

interface RechnungKontext {
  rechnung: {
    nummer: string;
    summe: string;
    flaschen: number;
    zeitraum: string;
    datum: string;
  };
  empfaenger: EmpfaengerKopie;
  feuerwehr: { name: string };
}

function baueKontext(
  rechnung: AtemschutzRechnung,
  feuerwehrName: string,
): RechnungKontext {
  const tag = (iso: string) =>
    iso ? new Date(iso).toLocaleDateString('de-AT') : '';
  return {
    rechnung: {
      nummer: rechnung.nummer,
      summe: new Intl.NumberFormat('de-AT', {
        style: 'currency',
        currency: 'EUR',
      }).format(rechnung.summe),
      flaschen: rechnung.positionen.reduce((s, p) => s + p.anzahl, 0),
      zeitraum: `${tag(rechnung.zeitraumVon)} – ${tag(rechnung.zeitraumBis)}`,
      datum: tag(rechnung.datum),
    },
    empfaenger: rechnung.empfaenger,
    feuerwehr: { name: feuerwehrName },
  };
}

function pdfDateiname(rechnung: AtemschutzRechnung): string {
  const empfaenger =
    rechnung.empfaenger.name.replace(/[^a-zA-Z0-9]+/g, '_') || 'Rechnung';
  return `${rechnung.nummer}_${empfaenger}.pdf`;
}

async function baueRechnungPdf(
  groupId: string,
  rechnung: AtemschutzRechnung,
  config: AtemschutzRechnungConfig,
): Promise<Buffer> {
  const feuerwehrName = await loadGroupFeuerwehrName(groupId);
  return renderToBuffer(
    FuellungRechnungPdf({
      rechnung,
      feuerwehrName,
      config,
      logoPath: LOGO_PATH,
    }),
  );
}

export async function renderFuellungRechnungPdf(request: {
  groupId: string;
  rechnungId: string;
}): Promise<RechnungPdfResult> {
  try {
    const { groupId, rechnungId } = request;
    await actionFuellungRechnungRequired(groupId);
    const rechnung = await loadRechnung(groupId, rechnungId);
    const config = await loadRechnungConfig(groupId);
    const pdf = await baueRechnungPdf(groupId, rechnung, config);
    return {
      success: true,
      fileName: pdfDateiname(rechnung),
      pdfBase64: Buffer.from(pdf).toString('base64'),
    };
  } catch (err) {
    console.error('renderFuellungRechnungPdf failed', err);
    return { success: false, error: actionErrorKey(err) };
  }
}

export interface RechnungMailVorschau {
  success: boolean;
  error?: string;
  to?: string;
  cc?: string[];
  subject?: string;
  body?: string;
}

/**
 * Betreff und Text aus den Vorlagen — für die Vorschau *und* als Grundlage des
 * Versands. Der Dialog zeigt sie und lässt sie ändern.
 */
export async function buildFuellungRechnungMail(request: {
  groupId: string;
  rechnungId: string;
}): Promise<RechnungMailVorschau> {
  try {
    const { groupId, rechnungId } = request;
    await actionFuellungRechnungRequired(groupId);
    const rechnung = await loadRechnung(groupId, rechnungId);
    const config = await loadRechnungConfig(groupId);
    const kontext = baueKontext(rechnung, await loadGroupFeuerwehrName(groupId));
    return {
      success: true,
      to: rechnung.empfaenger.email,
      cc: trimmed(config.ccEmail) ? [config.ccEmail.trim()] : [],
      subject: renderTemplate(
        config.subjectTemplate || DEFAULT_RECHNUNG_CONFIG.subjectTemplate,
        kontext,
      ),
      body: renderTemplate(
        config.bodyTemplate || DEFAULT_RECHNUNG_CONFIG.bodyTemplate,
        kontext,
      ),
    };
  } catch (err) {
    console.error('buildFuellungRechnungMail failed', err);
    return { success: false, error: actionErrorKey(err) };
  }
}

export interface SendRechnungRequest {
  groupId: string;
  rechnungId: string;
  to: string;
  cc?: string[];
  subject: string;
  body: string;
}

export async function sendFuellungRechnung(
  request: SendRechnungRequest,
): Promise<RechnungActionResult> {
  try {
    const { groupId, rechnungId, to, cc, subject, body } = request;
    const session = await actionFuellungRechnungRequired(groupId);

    if (!trimmed(to)) return { success: false, error: 'rechnungNoEmail' };
    if (!trimmed(subject) || !trimmed(body)) {
      return { success: false, error: 'rechnungNoText' };
    }

    const from = mailSender();
    if (!from) return { success: false, error: 'rechnungMailNotConfigured' };

    const rechnung = await loadRechnung(groupId, rechnungId);
    if (!rechnungStatusErlaubt(rechnung.status, 'sent')) {
      return { success: false, error: 'rechnungStatusInvalid' };
    }

    const config = await loadRechnungConfig(groupId);
    const pdf = await baueRechnungPdf(groupId, rechnung, config);

    await sendRawMail(
      buildMailMessage({
        to: to.trim(),
        from,
        replyTo: from,
        cc: (cc ?? []).map((a) => a.trim()).filter(Boolean),
        subject: subject.trim(),
        body,
        attachments: [
          {
            content: pdf,
            filename: pdfDateiname(rechnung),
            mimeType: 'application/pdf',
          },
        ],
      }),
    );

    const now = new Date().toISOString();
    const userId = session.user.email ?? session.user.name ?? 'unbekannt';
    await rechnungRef(groupId).doc(rechnungId).update({
      status: 'sent',
      emailSentAt: now,
      updatedAt: now,
      updatedBy: userId,
    });

    return { success: true, id: rechnungId };
  } catch (err) {
    console.error('sendFuellungRechnung failed', err);
    return { success: false, error: actionErrorKey(err) };
  }
}

export async function setFuellungRechnungBezahlt(request: {
  groupId: string;
  rechnungId: string;
}): Promise<RechnungActionResult> {
  try {
    const { groupId, rechnungId } = request;
    const session = await actionFuellungRechnungRequired(groupId);
    const rechnung = await loadRechnung(groupId, rechnungId);
    if (!rechnungStatusErlaubt(rechnung.status, 'paid')) {
      return { success: false, error: 'rechnungStatusInvalid' };
    }
    const now = new Date().toISOString();
    await rechnungRef(groupId).doc(rechnungId).update({
      status: 'paid',
      bezahltAm: now,
      updatedAt: now,
      updatedBy: session.user.email ?? session.user.name ?? 'unbekannt',
    });
    return { success: true, id: rechnungId };
  } catch (err) {
    console.error('setFuellungRechnungBezahlt failed', err);
    return { success: false, error: actionErrorKey(err) };
  }
}

/**
 * Storniert die Rechnung und gibt ihre Füllungen wieder frei.
 *
 * `verrechnen` bleibt dabei unangetastet — die Aussage „das ist zu
 * verrechnen" hat sich nicht geändert, nur die Rechnung ist weg. Gelöscht
 * wird ausschließlich `rechnungId`, und damit stehen die Zeilen sofort wieder
 * in der Übersicht der offenen.
 */
export async function cancelFuellungRechnung(request: {
  groupId: string;
  rechnungId: string;
}): Promise<RechnungActionResult> {
  try {
    const { groupId, rechnungId } = request;
    const session = await actionFuellungRechnungRequired(groupId);
    const rechnung = await loadRechnung(groupId, rechnungId);
    if (!rechnungStatusErlaubt(rechnung.status, 'cancelled')) {
      return { success: false, error: 'rechnungStatusInvalid' };
    }

    const now = new Date().toISOString();
    const userId = session.user.email ?? session.user.name ?? 'unbekannt';
    const batch = firestore.batch();
    batch.update(rechnungRef(groupId).doc(rechnungId), {
      status: 'cancelled',
      storniertAm: now,
      storniertVon: userId,
      updatedAt: now,
      updatedBy: userId,
    });
    for (const position of rechnung.positionen) {
      batch.update(fuellungRef(groupId).doc(position.fuellungId), {
        rechnungId: FieldValue.delete(),
        updatedAt: now,
        updatedBy: userId,
      });
    }
    await batch.commit();

    return { success: true, id: rechnungId };
  } catch (err) {
    console.error('cancelFuellungRechnung failed', err);
    return { success: false, error: actionErrorKey(err) };
  }
}

export type EmpfaengerInput = Pick<
  AtemschutzEmpfaenger,
  | 'feuerwehr'
  | 'name'
  | 'ansprechpartner'
  | 'adresse'
  | 'email'
  | 'telefon'
  | 'active'
>;

/**
 * Legt einen Adressbucheintrag an oder ändert ihn.
 *
 * Absichtlich unter demselben Guard wie die Rechnung und nicht beim
 * Gruppen-Admin: Ein Empfänger entsteht, wenn zum ersten Mal an eine Wehr
 * abgerechnet wird — bräuchte es dafür einen Admin, bliebe die Rechnung
 * liegen.
 */
export async function saveAtemschutzEmpfaenger(request: {
  groupId: string;
  empfaengerId?: string;
  input: EmpfaengerInput;
}): Promise<RechnungActionResult> {
  try {
    const { groupId, empfaengerId, input } = request;
    const session = await actionFuellungRechnungRequired(groupId);

    // Action-Argumente sind Client-Eingabe, der `Pick<>`-Typ ist zur Laufzeit
    // weg — deshalb bereinigen statt roh zu speichern.
    const feuerwehr = trimmed(input.feuerwehr);
    const name = trimmed(input.name);
    const email = trimmed(input.email);
    if (!feuerwehr || !name || !email) {
      return { success: false, error: 'rechnungEmpfaengerIncomplete' };
    }

    const now = new Date().toISOString();
    const userId = session.user.email ?? session.user.name ?? 'unbekannt';
    const payload: Record<string, unknown> = {
      feuerwehr,
      name,
      email,
      adresse: trimmed(input.adresse) ?? '',
      active: input.active !== false,
      updatedAt: now,
      updatedBy: userId,
    };
    if (trimmed(input.ansprechpartner)) {
      payload.ansprechpartner = trimmed(input.ansprechpartner);
    }
    if (trimmed(input.telefon)) payload.telefon = trimmed(input.telefon);

    if (empfaengerId) {
      await empfaengerRef(groupId)
        .doc(empfaengerId)
        .set(payload, { merge: true });
      return { success: true, id: empfaengerId };
    }

    const ref = await empfaengerRef(groupId).add({
      ...payload,
      createdAt: now,
      createdBy: userId,
    });
    return { success: true, id: ref.id };
  } catch (err) {
    console.error('saveAtemschutzEmpfaenger failed', err);
    return { success: false, error: actionErrorKey(err) };
  }
}

export async function deleteAtemschutzEmpfaenger(request: {
  groupId: string;
  empfaengerId: string;
}): Promise<RechnungActionResult> {
  try {
    const { groupId, empfaengerId } = request;
    await actionFuellungRechnungRequired(groupId);
    await empfaengerRef(groupId).doc(empfaengerId).delete();
    return { success: true, id: empfaengerId };
  } catch (err) {
    console.error('deleteAtemschutzEmpfaenger failed', err);
    return { success: false, error: actionErrorKey(err) };
  }
}

/**
 * Die Konfiguration gilt für alle Rechnungen der Gruppe und ist keine
 * Tagesarbeit — deshalb `actionGroupAdminRequired` und nicht der
 * Rechnungs-Guard.
 */
export async function saveAtemschutzRechnungConfig(request: {
  groupId: string;
  config: Omit<
    AtemschutzRechnungConfig,
    'nummernkreis' | 'updatedAt' | 'updatedBy'
  >;
}): Promise<RechnungActionResult> {
  try {
    const { groupId, config } = request;
    const session = await actionGroupAdminRequired(groupId);
    const now = new Date().toISOString();
    await rechnungConfigRef(groupId).set(
      {
        ccEmail: trimmed(config.ccEmail) ?? '',
        subjectTemplate:
          trimmed(config.subjectTemplate) ??
          DEFAULT_RECHNUNG_CONFIG.subjectTemplate,
        bodyTemplate:
          trimmed(config.bodyTemplate) ?? DEFAULT_RECHNUNG_CONFIG.bodyTemplate,
        absenderName: trimmed(config.absenderName) ?? '',
        absenderAdresse: trimmed(config.absenderAdresse) ?? '',
        absenderKontakt: trimmed(config.absenderKontakt) ?? '',
        leistungstext:
          trimmed(config.leistungstext) ?? DEFAULT_RECHNUNG_CONFIG.leistungstext,
        kontoinhaber: trimmed(config.kontoinhaber) ?? '',
        // Leerzeichen in der IBAN sind üblich und beim Abtippen hilfreich —
        // gespeichert wird die Eingabe, nur ohne Rand.
        iban: trimmed(config.iban) ?? '',
        bic: trimmed(config.bic) ?? '',
        zahlungszielTage:
          Number.isFinite(config.zahlungszielTage) &&
          config.zahlungszielTage >= 0
            ? Math.floor(config.zahlungszielTage)
            : DEFAULT_RECHNUNG_CONFIG.zahlungszielTage,
        ustHinweis: trimmed(config.ustHinweis) ?? '',
        vorgabeTarif: FUELLUNG_TARIF_IDS.includes(config.vorgabeTarif)
          ? config.vorgabeTarif
          : DEFAULT_RECHNUNG_CONFIG.vorgabeTarif,
        updatedAt: now,
        updatedBy: session.user.email ?? session.user.name ?? 'unbekannt',
      },
      { merge: true },
    );
    return { success: true };
  } catch (err) {
    console.error('saveAtemschutzRechnungConfig failed', err);
    return { success: false, error: actionErrorKey(err) };
  }
}
