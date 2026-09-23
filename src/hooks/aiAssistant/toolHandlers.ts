import { FunctionCall } from 'firebase/ai';
import { evaluate } from 'mathjs';
import { FirecallItem, FirecallLayer } from '../../components/firebase/firestore';
import { searchPlace } from '../../components/actions/maps/places';
import { GeoPosition, GeoPositionObject } from '../../common/geo';
import { GeohashCluster } from '../../common/gis-objects';
import {
  EinsatzmittelKategorie,
  parseBesatzung,
} from '../../common/vehicle-utils';
import {
  buildHoseLineDraft,
  collectWaterSupplyCandidates,
  describeHoseLineDraft,
  describeWaterSupplyCandidate,
  HoseLineDraft,
  WaterSupplyCandidate,
  WaterSupplyKind,
  WATER_SUPPLY_LABELS,
} from '../../common/waterSupply';
import type { AssistantEntryCommand } from '../../components/Fahrtenbuch/assistantEntry';
import type { TruppCommand } from '../../components/Atemschutz/truppAssistant';
import { TRUPP_STATUSES, type TruppStatus } from '../../common/atemschutz';
import { findFirecallItemByName } from './itemLookup';
import { EDITABLE_FIELDS } from './editableFields';
import { applyFieldValues, findLayer, type SpokenFieldValue } from './layerFields';
import { DIRECTION_LABELS, type PositionSpec } from './resolveOrigin';
import { normalizeRotation } from '../../components/Map/markers/rotationGeometry';
import { AiAssistantResult, ResolvedOrigin } from './types';
import {
  calculateInverseSquareLaw,
  calculateSchutzwert,
  calculateAufenthaltszeit,
  calculateDosisleistungNuklid,
  NUCLIDES,
  ActivityUnit,
} from '../../common/strahlenschutz';

type ResolvePositionFn = (
  positionSpec: PositionSpec | undefined
) => Promise<{ lat: number; lng: number }>;

type AddFirecallItemFn = (item: FirecallItem) => Promise<{ id: string }>;
type UpdateFirecallItemFn = (item: FirecallItem) => Promise<void>;

export interface ToolHandlerDeps {
  resolvePosition: ResolvePositionFn;
  /**
   * Wie `resolvePosition`, benennt aber zusätzlich, worauf die Angabe
   * tatsächlich hinauslief — inklusive Rückfall. Die Wasserversorgungssuche
   * braucht das, weil eine Messung ohne genannten Bezugspunkt wertlos ist.
   */
  resolveOrigin: (positionSpec: PositionSpec | undefined) => Promise<ResolvedOrigin>;
  addFirecallItem: AddFirecallItemFn;
  updateFirecallItem: UpdateFirecallItemFn;
  existingItems: FirecallItem[];
  /** Ebenen des Einsatzes, samt ihren Datenfeldern (`dataSchema`). */
  layers: FirecallLayer[];
  /**
   * Ebene, in die ein neuer Marker ohne genannte Ebene kommt — im Browser die
   * zuletzt gewählte (`lastSelectedLayer`), wie beim Anlegen über die
   * Oberfläche. Im MCP-Server gibt es keine.
   */
  activeLayerId?: string;
  /** Eine genannte Ebene wird zur aktiven, damit die nächste Messung dort landet. */
  setActiveLayer?: (layerId: string) => void;
  lastCreatedItem: { id: string; type: string } | null;
  setLastCreatedItem: (item: { id: string; type: string } | null) => void;
  map: { getCenter: () => { lat: number; lng: number }; panTo: (latlng: [number, number]) => void } | null;
  defaultPosition: { lat: number; lng: number };
  /** Geohash-Umkreissuche über die Cluster-Sammlung (`clusters6`) */
  findWaterSupply: (
    center: GeoPositionObject,
    radiusInM: number
  ) => Promise<GeohashCluster[]>;
  /**
   * Treffer der letzten `searchWaterSupply`. `proposeHoseLine` löst darüber
   * `sourceName` auf, statt dem Modell Koordinaten abzuverlangen — die
   * erfindet es sonst.
   */
  waterSupplyResults: { current: WaterSupplyCandidate[] };
  /**
   * Eine ganze Runde Leitungsvorschläge anzeigen, ohne sie anzulegen. Die
   * vorherige Runde wird dabei ersetzt.
   */
  proposeHoseLineDrafts: (drafts: HoseLineDraft[]) => void;
  /**
   * Eine Fahrt ins Fahrtenbuch eintragen.
   *
   * Als Abhängigkeit und nicht als direkter Aufruf der Server Action, weil der
   * Einsatzbezug und damit die Gruppe erst im Hook feststehen — und weil diese
   * Datei sonst eine Server Action in ihr Bündel zöge, obwohl die übrigen
   * Werkzeuge rein im Browser laufen.
   *
   * Die Rückmeldung ist ein fertiger deutscher Satz: Was hier schiefgehen
   * kann, sind Namen, die nicht aufgehen, und die Rückfrage danach kennt nur
   * die Gegenseite (siehe `planAssistantEntry`).
   */
  createFahrtenbuchEntry: (
    command: AssistantEntryCommand,
    options: { confirmDuplicate?: boolean },
  ) => Promise<{ success: boolean; message: string }>;
  /** Die zuletzt erfassten Zählerstände nachsehen — derselbe Weg, andere Richtung. */
  getFahrtenbuchCounters: (
    fahrzeug?: string,
  ) => Promise<{ success: boolean; message: string }>;
  /**
   * Einen Atemschutztrupp anlegen, seinen Zustand ändern oder eine Meldung
   * erfassen.
   *
   * Als Abhängigkeit aus demselben Grund wie das Fahrtenbuch: Welcher Trupp
   * gemeint ist, entscheidet `planTruppCommand` anhand der Trupps des
   * Einsatzes, und die Nebenwirkungen (Tagebuch, Warntermin, Push) hängen an
   * Hooks, die es nur im Browser gibt. Die Rückmeldung ist ein fertiger Satz.
   */
  runAtemschutzTruppCommand: (
    command: TruppCommand,
  ) => Promise<{ success: boolean; message: string }>;
}

/**
 * Radien, die `searchWaterSupply` ohne Angabe der Reihe nach probiert, bis
 * etwas gefunden wird.
 *
 * Die Eskalation gehört hierher und nicht in den Prompt: Jeder Anlauf des
 * Modells kostet einen Schleifendurchlauf, und davon gibt es fünf. Vier leere
 * Runden hintereinander reichten, um „Zu viele Verarbeitungsschritte" zu
 * erzeugen, statt eine Antwort zu geben.
 */
const WATER_SUPPLY_RADII = [300, 600, 1200, 2500];

/** Obergrenzen, damit ein einzelner Tool-Call nicht die halbe Datenbank zieht. */
const MAX_WATER_SUPPLY_RADIUS = 2500;
const MAX_WATER_SUPPLY_RESULTS = 20;
const DEFAULT_WATER_SUPPLY_RESULTS = 5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Entfernt Felder, die das Modell nicht gesetzt hat. Der Befehl soll zeigen,
 * was gesagt wurde — ein `pressure: undefined` sähe im Log aus wie ein
 * verlorener Wert.
 */
function ohneLeere<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined && v !== null),
  ) as T;
}

/** Nur Art und Bezeichnung an das Modell geben, nicht die Koordinaten. */
function originInfo(origin: ResolvedOrigin) {
  return { type: origin.type, label: origin.label };
}

function formatValue(value: number): string {
  return value.toFixed(4).replace(/\.?0+$/, '');
}

/** Format hours as human-readable duration (e.g. "2 d 3 h 15 min 30 s") */
function formatDuration(hours: number): string {
  const totalSeconds = Math.round(hours * 3600);
  const days = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const min = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} d`);
  if (h > 0) parts.push(`${h} h`);
  if (min > 0) parts.push(`${min} min`);
  if (s > 0) parts.push(`${s} s`);

  return parts.length > 0 ? parts.join(' ') : '0 s';
}

/** Arten von createMarker: Elementtyp → Ersatzname und Bezeichnung in der Antwort. */
const MARKER_KINDS: Record<string, { fallbackName: string; label: string }> = {
  marker: { fallbackName: 'Marker', label: 'Marker' },
  el: { fallbackName: 'Einsatzleitung', label: 'Einsatzleitung' },
  assp: { fallbackName: 'ASSP', label: 'ASSP' },
};

/**
 * Die Feuerwehr in der Rückmeldung — auch, wenn keine gespeichert wurde. Aus
 * der Rückmeldung baut das Modell seine Antwort; steht die Feuerwehr nicht
 * darin, soll es sie auch nicht behaupten.
 */
function feuerwehrHinweis(fw: unknown): string {
  const name = typeof fw === 'string' ? fw.trim() : '';
  return name ? `(${name})` : 'ohne Feuerwehr';
}

/** Parameter von `updates`, die nicht in `EDITABLE_FIELDS` stehen. */
const COMMON_UPDATE_KEYS = new Set([
  'name',
  'beschreibung',
  'color',
  'position',
  'rotation',
  'rotateBy',
  'layer',
  'values',
]);

/**
 * Ein gesagter Zeitpunkt als ISO-Zeitstempel, wie ihn der Dialog speichert.
 * „jetzt" und „14:30" (heute) werden umgerechnet; was sich nicht lesen lässt,
 * bleibt `undefined`.
 */
export function zeitpunkt(value: unknown, now = new Date()): string | undefined {
  const text = String(value ?? '').trim().toLocaleLowerCase('de');
  if (!text) return undefined;
  if (['jetzt', 'now', 'sofort'].includes(text)) return now.toISOString();
  const uhrzeit = text.match(/^(\d{1,2})[:.](\d{2})(?:\s*uhr)?$/);
  if (uhrzeit) {
    const d = new Date(now);
    d.setHours(Number(uhrzeit[1]), Number(uhrzeit[2]), 0, 0);
    return d.toISOString();
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/**
 * Die typabhängigen Felder aus `updates` übernehmen. Liefert die geänderten
 * Feldnamen oder einen Fehlersatz, wenn ein Feld nicht zum Typ passt — dann
 * wird gar nichts geschrieben.
 */
function typFelder(
  item: FirecallItem,
  updates: Record<string, unknown>,
): { werte: Record<string, unknown>; fehler?: string } {
  const erlaubt = EDITABLE_FIELDS[item.type] ?? {};
  const werte: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (COMMON_UPDATE_KEYS.has(key) || value === undefined || value === null) continue;
    const art = erlaubt[key];
    if (!art) {
      const felder = Object.keys(erlaubt);
      return {
        werte,
        fehler:
          `"${key}" gibt es bei "${item.name}" nicht` +
          (felder.length ? ` (änderbar: ${felder.join(', ')})` : ''),
      };
    }
    if (art === 'number') {
      const zahl = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
      if (!Number.isFinite(zahl)) return { werte, fehler: `"${value}" ist keine Zahl für ${key}` };
      werte[key] = zahl;
    } else if (art === 'flag') {
      // Schaltfelder liegen als 'true'/'false' im Dokument, wie im Dialog.
      werte[key] = String(value === true || value === 'true' || value === 'ja');
    } else if (art === 'time') {
      const iso = zeitpunkt(value);
      if (!iso) return { werte, fehler: `"${value}" ist kein Zeitpunkt für ${key}` };
      werte[key] = iso;
    } else if (art === 'besatzung') {
      const besatzung = parseBesatzung(String(value));
      if (besatzung === undefined) {
        return { werte, fehler: `"${value}" ist keine Besatzung` };
      }
      werte[key] = String(besatzung);
    } else {
      werte[key] = String(value);
    }
  }
  return { werte };
}

/** Typen, die die Karte dreht — dieselben wie `isRotatable()` der Elemente. */
const ROTATABLE_TYPES = new Set(['vehicle', 'rohr']);

/**
 * Drehung nach `updateItem`, in ganzen Grad im Uhrzeigersinn, 0 bis 359.
 * `rotation` setzt den Winkel, `rotateBy` dreht vom jetzigen aus weiter —
 * „um 45° nach rechts" ist +45. `undefined`, wenn keine Drehung verlangt ist.
 */
function neueDrehung(
  item: FirecallItem,
  updates: Record<string, unknown>,
): number | 'nicht drehbar' | undefined {
  const absolut = typeof updates.rotation === 'number' ? updates.rotation : undefined;
  const relativ = typeof updates.rotateBy === 'number' ? updates.rotateBy : undefined;
  if (absolut === undefined && relativ === undefined) return undefined;
  if (!ROTATABLE_TYPES.has(item.type)) return 'nicht drehbar';
  const winkel = absolut ?? normalizeRotation(item.rotation) + relativ!;
  return normalizeRotation(Math.round(winkel));
}

/** Eine genannte Ebene fehlt — mit den vorhandenen, damit das Modell nachfragen kann. */
function ebeneFehlt(name: string, layers: FirecallLayer[]): string {
  const namen = layers.filter((l) => !l.deleted).map((l) => `"${l.name}"`);
  return (
    `Ebene "${name}" nicht gefunden` +
    (namen.length ? ` (Ebenen: ${namen.join(', ')})` : ' — der Einsatz hat keine Ebenen')
  );
}

/**
 * Wohin ein verschobenes Element kam, für die Rückmeldung. Fand sich das
 * Bezugselement nicht, steht das darin — sonst meldet das Modell „links
 * neben dem TLFA", obwohl es in der Kartenmitte gelandet ist.
 */
function positionHinweis(spec: PositionSpec, origin: ResolvedOrigin): string {
  if (origin.type === 'nearItem') {
    const seite = (spec.direction && DIRECTION_LABELS[spec.direction]) || 'neben';
    return `${seite} ${origin.label}`;
  }
  if (origin.type === 'atItem') return `auf ${origin.label}`;
  if ((spec.type === 'nearItem' || spec.type === 'atItem') && spec.itemName) {
    return `an ${origin.label} (Element "${spec.itemName}" nicht gefunden)`;
  }
  return `an ${origin.label}`;
}

export async function executeToolCall(
  call: FunctionCall,
  deps: ToolHandlerDeps,
): Promise<AiAssistantResult> {
  const args = call.args as Record<string, unknown>;
  const {
    resolvePosition,
    resolveOrigin,
    addFirecallItem,
    updateFirecallItem,
    existingItems,
    layers,
    activeLayerId,
    setActiveLayer,
    lastCreatedItem,
    setLastCreatedItem,
    map,
    defaultPosition,
    findWaterSupply,
    waterSupplyResults,
    proposeHoseLineDrafts,
    createFahrtenbuchEntry,
    getFahrtenbuchCounters,
    runAtemschutzTruppCommand,
  } = deps;

  switch (call.name) {
    case 'createMarker': {
      // EL und ASSP sind eigene Elementtypen, für das Modell aber nur eine Art
      // Marker — ein Werkzeug weniger zur Auswahl. Unbekannte Arten landen
      // beim allgemeinen Marker statt bei einem Fehler.
      const kind = MARKER_KINDS[args.kind as string] ? (args.kind as string) : 'marker';
      const { fallbackName, label } = MARKER_KINDS[kind];

      // Eine genannte Ebene muss es geben; ohne Angabe die aktive, wie beim
      // Anlegen über die Oberfläche.
      const layerName = args.layer as string | undefined;
      const layer = layerName
        ? findLayer(layers, layerName)
        : layers.find((l) => l.id === activeLayerId && !l.deleted);
      if (layerName && !layer) {
        return { success: false, message: ebeneFehlt(layerName, layers) };
      }
      const values = (args.values as SpokenFieldValue[] | undefined) ?? [];
      if (values.length > 0 && !layer?.dataSchema?.length) {
        return {
          success: false,
          message: layer
            ? `Die Ebene "${layer.name}" hat keine Datenfelder`
            : 'Messwerte brauchen eine Ebene mit Datenfeldern — keine genannt und keine aktiv',
        };
      }
      const felder = layer?.dataSchema?.length
        ? await applyFieldValues(layer.dataSchema, undefined, values, { isNew: true })
        : undefined;
      if (felder?.errors.length) {
        return { success: false, message: felder.errors.join('; ') };
      }

      const pos = await resolvePosition(args.position as any);
      const name = (args.name as string) || fallbackName;
      const inEbene = layer
        ? { layer: layer.id, ...(felder ? { fieldData: felder.fieldData } : {}) }
        : {};
      const ref = await addFirecallItem(
        kind === 'marker'
          ? ({
              type: 'marker',
              name,
              beschreibung: args.beschreibung as string,
              zeichen: args.zeichen as string,
              color: args.color as string,
              ...inEbene,
              ...pos,
            } as FirecallItem)
          : ({ type: kind, name, ...inEbene, ...pos } as FirecallItem)
      );
      setLastCreatedItem({ id: ref.id, type: kind });
      if (layerName && layer?.id) setActiveLayer?.(layer.id);
      return {
        success: true,
        message:
          `${label} "${name}"` +
          (layer ? ` in Ebene "${layer.name}"` : '') +
          ' erstellt' +
          (felder?.applied.length ? `: ${felder.applied.join(', ')}` : ''),
        createdItemId: ref.id,
        createdItemType: kind,
      };
    }

    case 'createVehicle': {
      const pos = await resolvePosition(args.position as any);
      const ref = await addFirecallItem({
        type: 'vehicle',
        name: (args.name as string) || 'Fahrzeug',
        fw: args.fw as string,
        // Ein unbekannter Wert bleibt liegen: `einsatzmittelKategorie()`
        // verwirft ihn und leitet die Art aus dem Namen ab.
        kategorie: args.kategorie as EinsatzmittelKategorie | undefined,
        besatzung: parseBesatzung(args.besatzung as string)
          ? String(parseBesatzung(args.besatzung as string))
          : undefined,
        ats: args.ats as number,
        alarmierung: args.alarmierung as string,
        eintreffen: args.eintreffen as string,
        ...pos,
      } as FirecallItem);
      setLastCreatedItem({ id: ref.id, type: 'vehicle' });
      return {
        success: true,
        message: `Fahrzeug "${args.name}" ${feuerwehrHinweis(args.fw)} erstellt`,
        createdItemId: ref.id,
      };
    }

    case 'createRohr': {
      const pos = await resolvePosition(args.position as any);
      const ref = await addFirecallItem({
        type: 'rohr',
        name: (args.name as string) || 'Rohr',
        art: (args.art as string) || 'C',
        durchfluss: args.durchfluss as number,
        ...pos,
      } as FirecallItem);
      setLastCreatedItem({ id: ref.id, type: 'rohr' });
      return { success: true, message: `${args.art}-Rohr "${args.name}" erstellt`, createdItemId: ref.id };
    }

    case 'createDiary': {
      const ref = await addFirecallItem({
        type: 'diary',
        name: (args.name as string) || 'Eintrag',
        beschreibung: args.beschreibung as string,
        art: (args.art as 'M' | 'B' | 'F') || 'M',
        von: args.von as string,
        an: args.an as string,
        datum: new Date().toISOString(),
      } as FirecallItem);
      setLastCreatedItem({ id: ref.id, type: 'diary' });
      return { success: true, message: `Tagebucheintrag erstellt`, createdItemId: ref.id };
    }

    case 'createGb': {
      const ref = await addFirecallItem({
        type: 'gb',
        name: (args.name as string) || 'Eintrag',
        ausgehend: args.ausgehend as boolean,
        von: args.von as string,
        an: args.an as string,
        datum: new Date().toISOString(),
      } as FirecallItem);
      setLastCreatedItem({ id: ref.id, type: 'gb' });
      return { success: true, message: `Geschäftsbucheintrag erstellt`, createdItemId: ref.id };
    }

    case 'createCircle': {
      const pos = await resolvePosition(args.position as any);
      const ref = await addFirecallItem({
        type: 'circle',
        name: (args.name as string) || 'Kreis',
        radius: (args.radius as number) || 50,
        color: args.color as string,
        ...pos,
      } as FirecallItem);
      setLastCreatedItem({ id: ref.id, type: 'circle' });
      return { success: true, message: `Kreis "${args.name}" erstellt`, createdItemId: ref.id };
    }

    case 'createTacticalUnit': {
      const pos = await resolvePosition(args.position as any);
      const ref = await addFirecallItem({
        type: 'tacticalUnit',
        name: (args.name as string) || 'Einheit',
        unitType: (args.unitType as string) || 'zug',
        fw: args.fw as string,
        mann: args.mann as number,
        fuehrung: args.fuehrung as string,
        ats: args.ats as number,
        alarmierung: args.alarmierung as string,
        eintreffen: args.eintreffen as string,
        ...pos,
      } as FirecallItem);
      setLastCreatedItem({ id: ref.id, type: 'tacticalUnit' });
      return {
        success: true,
        message: `Taktische Einheit "${args.name}" ${feuerwehrHinweis(args.fw)} erstellt`,
        createdItemId: ref.id,
      };
    }

    case 'updateItem': {
      const itemId = (args.itemId as string) || lastCreatedItem?.id;
      const itemName = args.itemName as string;
      const updates = args.updates as Record<string, unknown>;

      const targetItem = findItem(existingItems, itemId, itemName, lastCreatedItem);
      if (!targetItem) {
        return { success: false, message: 'Element nicht gefunden' };
      }

      const typ = typFelder(targetItem, updates);
      if (typ.fehler) return { success: false, message: typ.fehler };

      const drehung = neueDrehung(targetItem, updates);
      if (drehung === 'nicht drehbar') {
        return {
          success: false,
          message: `"${targetItem.name}" lässt sich nicht drehen, nur Fahrzeuge und Rohre`,
        };
      }

      // Ebene wechseln und Datenfelder: Die Werte gehören zur Ebene, in der
      // das Element danach liegt.
      const layerName = updates.layer as string | undefined;
      const zielEbene = layerName
        ? findLayer(layers, layerName)
        : layers.find((l) => l.id === targetItem.layer && !l.deleted);
      if (layerName && !zielEbene) {
        return { success: false, message: ebeneFehlt(layerName, layers) };
      }
      const values = (updates.values as SpokenFieldValue[] | undefined) ?? [];
      if (values.length > 0 && !zielEbene?.dataSchema?.length) {
        return {
          success: false,
          message: zielEbene
            ? `Die Ebene "${zielEbene.name}" hat keine Datenfelder`
            : `"${targetItem.name}" liegt in keiner Ebene mit Datenfeldern`,
        };
      }
      const felder =
        values.length > 0 && zielEbene?.dataSchema
          ? await applyFieldValues(zielEbene.dataSchema, targetItem.fieldData, values)
          : undefined;
      if (felder?.errors.length) {
        return { success: false, message: felder.errors.join('; ') };
      }

      const positionSpec = updates.position as PositionSpec | undefined;
      // Über `resolveOrigin`, damit die Antwort sagt, wohin das Element kam.
      // Ohne das hat das Modell eine verfehlte Verschiebung als gelungen
      // gemeldet.
      const origin = positionSpec
        ? await resolveOrigin({ ...positionSpec, excludeItemId: targetItem.id })
        : undefined;
      const updatedItem: FirecallItem = { ...targetItem };
      if (origin) {
        updatedItem.lat = origin.lat;
        updatedItem.lng = origin.lng;
      }
      if (updates.name) updatedItem.name = updates.name as string;
      if (updates.color) (updatedItem as any).color = updates.color as string;
      if (updates.beschreibung) updatedItem.beschreibung = updates.beschreibung as string;
      if (drehung !== undefined) updatedItem.rotation = String(drehung);
      Object.assign(updatedItem, typ.werte);
      if (layerName && zielEbene) updatedItem.layer = zielEbene.id;
      if (felder) updatedItem.fieldData = felder.fieldData;

      await updateFirecallItem(updatedItem);
      if (layerName && zielEbene?.id) setActiveLayer?.(zielEbene.id);
      const geaendert = Object.keys(typ.werte);
      const teile = [
        origin ? `${positionHinweis(positionSpec!, origin)} gesetzt` : undefined,
        drehung !== undefined ? `auf ${drehung}° gedreht` : undefined,
        layerName && zielEbene ? `in Ebene "${zielEbene.name}" verschoben` : undefined,
        felder?.applied.length ? `Werte gesetzt: ${felder.applied.join(', ')}` : undefined,
        geaendert.length ? `geändert: ${geaendert.join(', ')}` : undefined,
      ].filter(Boolean);
      return {
        success: true,
        message: teile.length
          ? `"${targetItem.name}" ${teile.join(' und ')}`
          : `"${targetItem.name}" aktualisiert`,
      };
    }

    case 'deleteItem': {
      const itemId = (args.itemId as string) || lastCreatedItem?.id;
      const itemName = args.itemName as string;

      const targetItem = findItem(existingItems, itemId, itemName, lastCreatedItem);
      if (!targetItem) {
        return { success: false, message: 'Element nicht gefunden' };
      }

      await updateFirecallItem({ ...targetItem, deleted: true });
      if (lastCreatedItem?.id === targetItem.id) {
        setLastCreatedItem(null);
      }
      return { success: true, message: `"${targetItem.name}" gelöscht` };
    }

    case 'createFahrtenbuchEntry': {
      // Durchgereicht statt umgedeutet: Welcher Zähler, welches Fahrzeug und
      // wer gefahren ist, entscheidet die Gegenseite anhand der Stammdaten der
      // Gruppe — der Browser kennt sie nicht. `createdItemId` bleibt bewusst
      // leer: Die Fahrt ist kein Kartenelement und lässt sich mit „rückgängig"
      // nicht zurücknehmen.
      const result = await createFahrtenbuchEntry(
        {
          fahrzeug: args.fahrzeug as string,
          zaehlerstaende: args.zaehlerstaende as AssistantEntryCommand['zaehlerstaende'],
          betriebsmittel: args.betriebsmittel as AssistantEntryCommand['betriebsmittel'],
          fahrer: args.fahrer as string | undefined,
          mitfahrer: args.mitfahrer as string[] | undefined,
          zweck: args.zweck as string | undefined,
          ziel: args.ziel as string | undefined,
          abfahrt: args.abfahrt as string | undefined,
          ankunft: args.ankunft as string | undefined,
          hinweise: args.hinweise as string | undefined,
        },
        { confirmDuplicate: args.trotzdemEintragen === true },
      );
      return { success: result.success, message: result.message };
    }

    case 'getFahrtenbuchCounters': {
      const result = await getFahrtenbuchCounters(args.fahrzeug as string | undefined);
      // `isAnswer`, weil es eine Auskunft ist und keine Änderung: Der Toast
      // zeigt sie als Antwort, und „Rückgängig" hat nichts zurückzunehmen.
      return {
        success: result.success,
        message: result.message,
        isAnswer: result.success,
      };
    }

    // Die drei Trupp-Werkzeuge reichen durch, ohne umzudeuten: Welcher Trupp
    // gemeint ist und ob ein Druck plausibel ist, entscheidet
    // `planTruppCommand`. `createdItemId` bleibt leer — ein Trupp ist kein
    // Kartenelement, und „rückgängig" fände ihn nie wieder.
    case 'createAtemschutzTrupp': {
      const result = await runAtemschutzTruppCommand(
        ohneLeere({
          kind: 'create',
          name: args.name as string | undefined,
          fireDepartment: args.fireDepartment as string | undefined,
          members: args.members as string[] | undefined,
          unit: args.unit as string | undefined,
          note: args.note as string | undefined,
        }),
      );
      return { success: result.success, message: result.message };
    }

    case 'setAtemschutzTruppStatus': {
      const status = args.status as TruppStatus;
      if (!TRUPP_STATUSES.includes(status)) {
        return {
          success: false,
          message: `Unbekannter Zustand „${String(args.status)}". Möglich: ${TRUPP_STATUSES.join(', ')}.`,
        };
      }
      const result = await runAtemschutzTruppCommand(
        ohneLeere({
          kind: 'status',
          trupp: args.trupp as string | undefined,
          status,
          unit: args.unit as string | undefined,
          pressure: args.pressure as number | undefined,
          mission: args.mission as string | undefined,
          target: args.target as string | undefined,
          monitoredBy: args.monitoredBy as string | undefined,
          time: args.time as string | undefined,
        }),
      );
      return { success: result.success, message: result.message };
    }

    case 'recordAtemschutzTruppReport': {
      const result = await runAtemschutzTruppCommand(
        ohneLeere({
          kind: 'report',
          trupp: args.trupp as string | undefined,
          pressure: args.pressure as number | undefined,
          atTarget: args.atTarget as boolean | undefined,
          withdrawing: args.withdrawing as boolean | undefined,
          note: args.note as string | undefined,
          logToDiary: args.logToDiary as boolean | undefined,
          recordAnyway: args.recordAnyway as boolean | undefined,
        }),
      );
      return { success: result.success, message: result.message };
    }

    case 'askClarification':
      return {
        success: false,
        message: args.question as string,
        clarification: {
          question: args.question as string,
          options: args.options as string[],
        },
      };

    case 'answerQuestion':
      return {
        success: true,
        message: args.answer as string,
        isAnswer: true,
      };

    case 'calculate': {
      const expression = args.expression as string;
      const desc = args.description as string;
      try {
        const result = evaluate(expression);
        const resultStr = typeof result === 'object' && result.toString ? result.toString() : String(result);
        const message = desc ? `${desc}: ${resultStr}` : `Ergebnis: ${resultStr}`;
        return { success: true, message, isAnswer: true, data: { result } };
      } catch (e) {
        return { success: false, message: `Rechenfehler: ${(e as Error).message}` };
      }
    }

    case 'calculateStrahlenschutz': {
      switch (args.formel) {
        case 'abstand': {
          const result = calculateInverseSquareLaw({
            d1: args.d1 as number ?? null,
            r1: args.r1 as number ?? null,
            d2: args.d2 as number ?? null,
            r2: args.r2 as number ?? null,
          });
          if (!result) return { success: false, message: 'Ungültige Parameter für Abstandsgesetz' };
          const labels: Record<string, string> = { d1: 'Abstand 1', r1: 'Dosisleistung 1', d2: 'Abstand 2', r2: 'Dosisleistung 2' };
          const unit = result.field.startsWith('d') ? 'm' : 'µSv/h';
          return { 
            success: true, 
            message: `Strahlenschutz (Abstandsgesetz): ${labels[result.field]} = ${formatValue(result.value)} ${unit}`, 
            isAnswer: true,
            data: { field: result.field, value: result.value, unit }
          };
        }

        case 'schutzwert': {
          const result = calculateSchutzwert({
            r0: args.r0 as number ?? null,
            r: args.r as number ?? null,
            s: args.s as number ?? null,
            n: args.n as number ?? null,
          });
          if (!result) return { success: false, message: 'Ungültige Parameter für Schutzwert' };
          const labels: Record<string, string> = { r0: 'DLR ohne Abschirmung', r: 'DLR mit Abschirmung', s: 'Schutzwert (S)', n: 'Anzahl Schichten' };
          const unit = result.field.startsWith('r') ? 'µSv/h' : '';
          return { 
            success: true, 
            message: `Strahlenschutz (Schutzwert): ${labels[result.field]} = ${formatValue(result.value)} ${unit}`, 
            isAnswer: true,
            data: { field: result.field, value: result.value, unit }
          };
        }

        case 'aufenthaltszeit': {
          const result = calculateAufenthaltszeit({
            t: args.t as number ?? null,
            d: args.d as number ?? null,
            r: args.r as number ?? null,
          });
          if (!result) return { success: false, message: 'Ungültige Parameter für Aufenthaltszeit' };
          const labels: Record<string, string> = { t: 'Aufenthaltszeit', d: 'Zulässige Dosis', r: 'Dosisleistung' };
          const unit = result.field === 't' ? 'h' : result.field === 'd' ? 'mSv' : 'mSv/h';
          let message = `Strahlenschutz (Aufenthaltszeit): ${labels[result.field]} = ${formatValue(result.value)} ${unit}`;
          if (result.field === 't') message += ` (${formatDuration(result.value)})`;
          return { 
            success: true, 
            message, 
            isAnswer: true,
            data: { field: result.field, value: result.value, unit, duration: result.field === 't' ? formatDuration(result.value) : undefined }
          };
        }

        case 'nuklid': {
          const nuclideName = (args.nuclide as string) ?? '';
          const nuclide = NUCLIDES.find(n => n.name.toLowerCase() === nuclideName.toLowerCase());
          if (!nuclide) return { success: false, message: `Nuklid "${nuclideName}" nicht gefunden` };

          const result = calculateDosisleistungNuklid(nuclide.gamma, {
            activity: args.activity as number ?? null,
            doseRate: args.doseRate as number ?? null,
          });
          if (!result) return { success: false, message: 'Ungültige Parameter für Nuklid-Berechnung' };
          const label = result.field === 'activity' ? 'Aktivität' : 'Dosisleistung in 1m';
          const unit = result.field === 'activity' ? 'GBq' : 'µSv/h';
          return { 
            success: true, 
            message: `Strahlenschutz (${nuclide.name}): ${label} = ${formatValue(result.value)} ${unit}`, 
            isAnswer: true,
            data: { nuclide: nuclide.name, field: result.field, value: result.value, unit }
          };
        }

        default:
          return {
            success: false,
            message: `Unbekannte Strahlenschutz-Formel "${args.formel}" (abstand, schutzwert, aufenthaltszeit, nuklid)`,
          };
      }
    }

    case 'searchWaterSupply': {
      const origin = await resolveOrigin(
        (args.position as any) || { type: 'auto' }
      );
      const center = { lat: origin.lat, lng: origin.lng };
      const limit = clamp(
        (args.limit as number) || DEFAULT_WATER_SUPPLY_RESULTS,
        1,
        MAX_WATER_SUPPLY_RESULTS
      );
      // Ein ausdrücklich genannter Radius ist eine Vorgabe, kein Startwert —
      // wer „im Umkreis von 100 m" fragt, will keine Treffer aus 2 km.
      const radii = args.radius
        ? [clamp(args.radius as number, 50, MAX_WATER_SUPPLY_RADIUS)]
        : WATER_SUPPLY_RADII;

      let candidates: WaterSupplyCandidate[] = [];
      let radius = radii[radii.length - 1];

      for (const currentRadius of radii) {
        const clusters = await findWaterSupply(center, currentRadius);
        candidates = collectWaterSupplyCandidates(clusters, center, {
          radius: currentRadius,
          kinds: args.kinds as WaterSupplyKind[] | undefined,
          hydrantType: args.hydrantType as string | undefined,
          limit,
        });
        if (candidates.length > 0) {
          radius = currentRadius;
          break;
        }
      }

      waterSupplyResults.current = candidates;

      if (candidates.length === 0) {
        return {
          success: false,
          message: `Keine Wasserentnahmestelle im Umkreis von ${radius} m um ${origin.label} gefunden`,
          data: { candidates: [], radius, origin: originInfo(origin) },
        };
      }

      // Die fertige Antwort steht schon hier, damit das Modell sie nur noch
      // weitergeben muss und keine zweite Runde für die Auswahl braucht.
      // Beschrieben wird jede zurückgegebene Entnahmestelle — wie viele das
      // sind, steuert `limit`. Eine feste Obergrenze hier machte den
      // Parameter wirkungslos: Das Modell bekäme mehr Kandidaten, könnte sie
      // aber nicht vorlesen.
      const [nearest, ...others] = candidates;
      const answerParts = [
        `Gemessen von ${origin.label}`,
        `Nächste Entnahmestelle: ${describeWaterSupplyCandidate(
          nearest,
          center
        )}`,
        ...others.map((c) => `weiter: ${describeWaterSupplyCandidate(c, center)}`),
      ];

      // Zu JEDER gefundenen Entnahmestelle wird eine Leitung eingezeichnet,
      // nicht nur zur nächsten: „Wo ist der nächste Hydrant?" zielt im Einsatz
      // auf die Wasserversorgung, und welcher Anschluss der brauchbare ist,
      // entscheidet die Lage vor Ort — nicht die Luftlinie. Wie viele es sind,
      // steuert `limit`. Es kostet nichts: Ein Entwurf ist erst nach dem
      // Bestätigen ein Element, und ungewollte verschwinden mit „Verwerfen".
      const drafts = candidates
        .filter((candidate) => candidate.distance > 0)
        .map((candidate) =>
          buildHoseLineDraft({
            source: candidate,
            target: center,
            reason: `${WATER_SUPPLY_LABELS[candidate.kind]} ${candidate.name}, ${
              candidate.distance
            } m entfernt`,
          })
        );

      if (drafts.length > 0) {
        proposeHoseLineDrafts(drafts);
        answerParts.push(
          drafts.length === 1
            ? `Leitungsvorschlag eingezeichnet: ${describeHoseLineDraft(
                drafts[0]
              )}`
            : `${drafts.length} Leitungsvorschläge eingezeichnet, kürzester: ${describeHoseLineDraft(
                drafts[0]
              )}`
        );
      }

      const answer = answerParts.join('. ');

      return {
        success: true,
        message: answer,
        data: { candidates, radius, answer, origin: originInfo(origin) },
        drafts: drafts.length > 0 ? drafts : undefined,
      };
    }

    case 'proposeHoseLine': {
      const sourceName = args.sourceName as string | undefined;
      const sourcePosition = args.sourcePosition as
        | { lat?: number; lng?: number }
        | undefined;

      let source:
        | ({ kind?: WaterSupplyKind; name?: string } & GeoPositionObject)
        | undefined;

      if (sourceName) {
        const needle = sourceName.toLocaleLowerCase('de');
        const found = waterSupplyResults.current.find((candidate) =>
          candidate.name.toLocaleLowerCase('de').includes(needle)
        );
        if (!found) {
          return {
            success: false,
            message: `"${sourceName}" ist in der letzten Umkreissuche nicht enthalten. Zuerst searchWaterSupply aufrufen.`,
          };
        }
        source = {
          kind: found.kind,
          name: found.name,
          lat: found.lat,
          lng: found.lng,
        };
      } else if (
        typeof sourcePosition?.lat === 'number' &&
        typeof sourcePosition?.lng === 'number'
      ) {
        source = { lat: sourcePosition.lat, lng: sourcePosition.lng };
      }

      if (!source) {
        return {
          success: false,
          message:
            'Keine Entnahmestelle angegeben. Zuerst searchWaterSupply aufrufen und sourceName aus dem Ergebnis verwenden.',
        };
      }

      const target = await resolveOrigin(
        (args.target as any) || { type: 'auto' }
      );

      const draft = buildHoseLineDraft({
        source,
        target,
        dimension: args.dimension as string | undefined,
        name: args.name as string | undefined,
        reason: args.reason as string | undefined,
      });

      // Ein ausdrücklich verlangter Vorschlag ersetzt die Runde aus der Suche:
      // Wer „Leitung von der Saugstelle" sagt, will nicht daneben noch fünf
      // Hydrantenleitungen liegen haben.
      proposeHoseLineDrafts([draft]);

      return {
        success: true,
        message: `Vorschlag: ${describeHoseLineDraft(draft)}`,
        drafts: [draft],
      };
    }

    case 'searchAddress': {
      const address = args.address as string;
      const shouldCreateMarker = args.createMarker !== false;

      const center = map ? map.getCenter() : defaultPosition;
      const results = await searchPlace(address, {
        position: new GeoPosition(center.lat, center.lng),
        maxResults: 1,
      });

      if (!results[0]) {
        return { success: false, message: `Adresse "${address}" nicht gefunden` };
      }

      const place = results[0];
      const lat = parseFloat(place.lat);
      const lng = parseFloat(place.lon);

      map?.panTo([lat, lng]);

      if (shouldCreateMarker) {
        const ref = await addFirecallItem({
          type: 'marker',
          name: place.name || place.display_name || address,
          beschreibung: `${place.display_name}\n${place.licence || ''}`,
          lat,
          lng,
        } as FirecallItem);
        setLastCreatedItem({ id: ref.id, type: 'marker' });
        return { success: true, message: `"${place.name || address}" gefunden und Marker erstellt`, createdItemId: ref.id };
      }

      return { success: true, message: `"${place.name || address}" gefunden` };
    }

    default:
      return { success: false, message: `Unbekannte Aktion: ${call.name}` };
  }
}

function findItem(
  existingItems: FirecallItem[],
  itemId: string | undefined,
  itemName: string | undefined,
  lastCreatedItem: { id: string; type: string } | null,
): FirecallItem | undefined {
  if (itemId) {
    return existingItems.find((i) => i.id === itemId);
  }
  if (itemName) {
    // Dieselbe Suche wie beim Bezugspunkt: „lösche das TLFA Neusiedl" muss
    // dasselbe Element finden wie „Hydranten beim TLFA Neusiedl".
    return findFirecallItemByName(existingItems, itemName);
  }
  if (lastCreatedItem) {
    return existingItems.find((i) => i.id === lastCreatedItem.id);
  }
  return undefined;
}
