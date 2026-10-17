import { parseBesatzung } from '../../common/vehicle-utils';
import {
  FirecallItem,
  Fzg,
  TacticalUnit,
  TacticalUnitType,
} from '../firebase/firestore';

export type QuickAddKind = 'vehicle' | 'tacticalUnit';

/** Der Inhalt der Schnelleingabe auf der Seite „Einsatzmittel", roh wie getippt. */
export interface QuickAddInput {
  kind: QuickAddKind;
  name: string;
  fw: string;
  /** Am Fahrzeug „Besatzung 1:?", an der Einheit die Gesamtstärke. */
  strength: string;
  ats: string;
  unitType: TacticalUnitType;
  /** Nur am Fahrzeug — die taktische Einheit kennt den Schalter nicht. */
  fremd: boolean;
  /** Die Kräfte sind schon da: Eintreffen ist jetzt. */
  arrived: boolean;
  /** Nur am Fahrzeug — die taktische Einheit, unter der es fährt. */
  tacticalUnitId?: string;
}

export interface QuickAddContext {
  now: Date;
  lat: number;
  lng: number;
}

function parsePositiveInt(raw: string): number | undefined {
  const value = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Die Gesamtstärke einer taktischen Einheit aus dem, was getippt wurde.
 *
 * An der Einheit speichert `mann` die **Gesamtstärke** (docs/einsatzmittel-staerke.md).
 * Gemeldet wird eine Einheit aber meist als „1:8" oder „1/8/9" — eine `1` aus
 * „1:8" wäre um acht Personen zu wenig. Deshalb: Ist die Summe angeschrieben
 * (drei Teile und mehr), gilt sie, sonst werden die Teile addiert.
 */
export function parseTotalStrength(raw: string): number | undefined {
  const parts = raw
    .split(/[:/]/)
    .map((p) => p.trim())
    .filter((p) => p !== '');
  if (parts.length === 0) return undefined;
  if (parts.length > 2) return parsePositiveInt(parts[parts.length - 1]);
  const values = parts.map((p) => Number.parseInt(p, 10));
  if (values.some((v) => !Number.isFinite(v))) return undefined;
  const total = values.reduce((sum, v) => sum + v, 0);
  return total > 0 ? total : undefined;
}

/**
 * Vorgabe für den Schalter „Fremdorganisation": an, sobald eine andere als die
 * eigene Feuerwehr eingetragen ist. Eine Nachbarwehr ist nicht die eigene
 * Mannschaft (docs/einsatzmittel-staerke.md) — wer sie trotzdem eigen führen
 * will, schaltet um.
 */
export function defaultFremd(fw: string, ownFw: string): boolean {
  const normalized = fw.trim().toLowerCase();
  return normalized !== '' && normalized !== ownFw.trim().toLowerCase();
}

/** Feuerwehren für die Vorschlagsliste: die eigene zuerst, dann die schon im Einsatz. */
export function collectFwOptions(items: FirecallItem[], ownFw: string): string[] {
  const others = new Set<string>();
  for (const item of items) {
    const fw = (item as Fzg | TacticalUnit).fw?.trim();
    if (fw && fw !== ownFw) others.add(fw);
  }
  return [ownFw, ...[...others].sort((a, b) => a.localeCompare(b, 'de'))];
}

/**
 * Baut aus der Schnelleingabe das neue Element — oder nichts, wenn die
 * Bezeichnung fehlt. Leere Angaben bleiben weg statt als `0` gespeichert zu
 * werden: Ein fehlender Wert am Fahrzeug fällt auf die Besatzungszuordnung
 * zurück, eine `0` überschriebe sie.
 */
export function buildQuickAddItem(
  input: QuickAddInput,
  { now, lat, lng }: QuickAddContext,
): Fzg | TacticalUnit | undefined {
  const name = input.name.trim();
  if (!name) return undefined;

  const fw = input.fw.trim() || undefined;
  const ats = parsePositiveInt(input.ats);
  const datum = now.toISOString();
  // Eine der beiden Zeiten ist immer gesetzt: Aus ihr entsteht der Eintrag
  // „… alarmiert" bzw. „… eingetroffen" im Einsatztagebuch.
  const eintreffen = input.arrived ? datum : undefined;
  const alarmierung = input.arrived ? undefined : datum;

  if (input.kind === 'tacticalUnit') {
    return stripUndefined({
      type: 'tacticalUnit',
      name,
      unitType: input.unitType,
      // Keine Feuerwehr: Eine Einheit wird so gemeldet, wie sie heißt —
      // „FW Neusiedl" als Zug. Die Feuerwehr des Fahrzeugs im Feld daneben
      // hängte sonst ein zweites „Neusiedl am See" an die Bezeichnung.
      mann: parseTotalStrength(input.strength),
      ats,
      alarmierung,
      eintreffen,
      datum,
      lat,
      lng,
    }) as TacticalUnit;
  }

  // Kanonisch nur die Zahl hinter dem Doppelpunkt, wie in jedem anderen
  // schreibenden Weg — „1:8" landet als „8" im Dokument.
  const besatzung = parseBesatzung(input.strength);
  return stripUndefined({
    type: 'vehicle',
    name,
    fw,
    besatzung: besatzung ? String(besatzung) : undefined,
    ats,
    fremd: input.fremd ? 'true' : undefined,
    tacticalUnitId: input.tacticalUnitId || undefined,
    alarmierung,
    eintreffen,
    datum,
    lat,
    lng,
  }) as Fzg;
}

function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as T;
}
