import { FunctionCall } from 'firebase/ai';
import { evaluate } from 'mathjs';
import { FirecallItem } from '../../components/firebase/firestore';
import { searchPlace } from '../../components/actions/maps/places';
import { GeoPosition } from '../../common/geo';
import { AiAssistantResult } from './types';

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
        return { success: true, message, isAnswer: true };
      } catch (e) {
        return { success: false, message: `Rechenfehler: ${(e as Error).message}` };
      }
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
