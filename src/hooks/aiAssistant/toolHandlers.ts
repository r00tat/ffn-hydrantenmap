import { FunctionCall } from 'firebase/ai';
import { evaluate } from 'mathjs';
import { FirecallItem } from '../../components/firebase/firestore';
import { searchPlace } from '../../components/actions/maps/places';
import { GeoPosition } from '../../common/geo';
import { AiAssistantResult } from './types';
import {
  calculateInverseSquareLaw,
  calculateSchutzwert,
  calculateAufenthaltszeit,
  calculateDosisleistungNuklid,
  NUCLIDES,
  ActivityUnit,
} from '../../common/strahlenschutz';

type ResolvePositionFn = (
  positionSpec: { type: string; itemName?: string; address?: string; lat?: number; lng?: number } | undefined
) => Promise<{ lat: number; lng: number }>;

type AddFirecallItemFn = (item: FirecallItem) => Promise<{ id: string }>;
type UpdateFirecallItemFn = (item: FirecallItem) => Promise<void>;

export interface ToolHandlerDeps {
  resolvePosition: ResolvePositionFn;
  addFirecallItem: AddFirecallItemFn;
  updateFirecallItem: UpdateFirecallItemFn;
  existingItems: FirecallItem[];
  lastCreatedItem: { id: string; type: string } | null;
  setLastCreatedItem: (item: { id: string; type: string } | null) => void;
  map: { getCenter: () => { lat: number; lng: number }; panTo: (latlng: [number, number]) => void } | null;
  defaultPosition: { lat: number; lng: number };
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

export async function executeToolCall(
  call: FunctionCall,
  deps: ToolHandlerDeps,
): Promise<AiAssistantResult> {
  const args = call.args as Record<string, unknown>;
  const {
    resolvePosition,
    addFirecallItem,
    updateFirecallItem,
    existingItems,
    lastCreatedItem,
    setLastCreatedItem,
    map,
    defaultPosition,
  } = deps;

  switch (call.name) {
    case 'createMarker': {
      const pos = await resolvePosition(args.position as any);
      const ref = await addFirecallItem({
        type: 'marker',
        name: (args.name as string) || 'Marker',
        beschreibung: args.beschreibung as string,
        zeichen: args.zeichen as string,
        color: args.color as string,
        ...pos,
      } as FirecallItem);
      setLastCreatedItem({ id: ref.id, type: 'marker' });
      return { success: true, message: `Marker "${args.name}" erstellt`, createdItemId: ref.id };
    }

    case 'createVehicle': {
      const pos = await resolvePosition(args.position as any);
      const ref = await addFirecallItem({
        type: 'vehicle',
        name: (args.name as string) || 'Fahrzeug',
        fw: args.fw as string,
        besatzung: args.besatzung as string,
        ats: args.ats as number,
        alarmierung: args.alarmierung as string,
        eintreffen: args.eintreffen as string,
        ...pos,
      } as FirecallItem);
      setLastCreatedItem({ id: ref.id, type: 'vehicle' });
      return { success: true, message: `Fahrzeug "${args.name}" erstellt`, createdItemId: ref.id };
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

    case 'createEl': {
      const pos = await resolvePosition(args.position as any);
      const ref = await addFirecallItem({
        type: 'el',
        name: (args.name as string) || 'Einsatzleitung',
        ...pos,
      });
      setLastCreatedItem({ id: ref.id, type: 'el' });
      return { success: true, message: `Einsatzleitung "${args.name}" erstellt`, createdItemId: ref.id };
    }

    case 'createAssp': {
      const pos = await resolvePosition(args.position as any);
      const ref = await addFirecallItem({
        type: 'assp',
        name: (args.name as string) || 'ASSP',
        ...pos,
      });
      setLastCreatedItem({ id: ref.id, type: 'assp' });
      return { success: true, message: `ASSP "${args.name}" erstellt`, createdItemId: ref.id };
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
      return { success: true, message: `Taktische Einheit "${args.name}" erstellt`, createdItemId: ref.id };
    }

    case 'updateItem': {
      const itemId = (args.itemId as string) || lastCreatedItem?.id;
      const itemName = args.itemName as string;
      const updates = args.updates as Record<string, unknown>;

      const targetItem = findItem(existingItems, itemId, itemName, lastCreatedItem);
      if (!targetItem) {
        return { success: false, message: 'Element nicht gefunden' };
      }

      const pos = updates.position ? await resolvePosition(updates.position as any) : {};
      const updatedItem: FirecallItem = {
        ...targetItem,
        ...pos,
      };
      if (updates.name) updatedItem.name = updates.name as string;
      if (updates.color) (updatedItem as any).color = updates.color as string;
      if (updates.beschreibung) updatedItem.beschreibung = updates.beschreibung as string;
      await updateFirecallItem(updatedItem);
      return { success: true, message: `"${targetItem.name}" aktualisiert` };
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

    case 'calculateStrahlenschutzAbstand': {
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

    case 'calculateStrahlenschutzSchutzwert': {
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

    case 'calculateStrahlenschutzAufenthaltszeit': {
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

    case 'calculateStrahlenschutzNuklid': {
      const nuclideName = args.nuclide as string;
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
    return existingItems.find((i) =>
      i.name?.toLowerCase().includes(itemName.toLowerCase())
    );
  }
  if (lastCreatedItem) {
    return existingItems.find((i) => i.id === lastCreatedItem.id);
  }
  return undefined;
}
