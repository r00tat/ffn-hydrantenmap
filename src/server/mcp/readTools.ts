import 'server-only';

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import {
  collectWaterSupplyCandidates,
  describeWaterSupplyCandidate,
  WATER_SUPPLY_KINDS,
  type WaterSupplyKind,
} from '../../common/waterSupply';
import { GeoPosition } from '../../common/geo';
import { searchPlace } from '../../components/actions/maps/places';
import { authorizationMessage, authorizeFirecall } from './authorizeFirecall';
import { queryClustersAdmin } from './clusterQuery';
import {
  getFirecall,
  getFirecallContext,
  listDiaryEntries,
  listFirecalls,
  listGeschaeftsbuchEntries,
  listItems,
  listLayers,
} from './firecallData';
import { errorResult, jsonResult } from './toolResult';
import type { McpUser } from './userAccess';

/**
 * Lesende Tools.
 *
 * Alle sind mit `readOnlyHint: true` gekennzeichnet, damit ein Client sie ohne
 * Rückfrage ausführen darf; `openWorldHint` steht nur dort, wo ein fremder
 * Dienst befragt wird (Geocoding).
 *
 * Jedes Tool mit Einsatzbezug verlangt `firecallId` und läuft über
 * `authorizeFirecall` — es gibt keinen Weg an der Gruppenprüfung vorbei.
 */

const firecallId = z
  .string()
  .min(1)
  .describe('ID des Einsatzes, wie sie list_einsaetze liefert');

export function registerReadTools(server: McpServer, user: McpUser): void {
  server.registerTool(
    'list_einsaetze',
    {
      title: 'Einsätze auflisten',
      description:
        'Listet die Einsätze auf, für die der angemeldete Benutzer berechtigt ist. ' +
        'Standardmäßig nur laufende Einsätze (ohne Abrücken-Zeitpunkt), neueste zuerst.',
      inputSchema: z.object({
        group: z
          .string()
          .optional()
          .describe('Nur Einsätze dieser Feuerwehr-Gruppe'),
        includeFinished: z
          .boolean()
          .optional()
          .describe('Auch abgeschlossene Einsätze einschließen'),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ group, includeFinished, limit }) =>
      jsonResult(await listFirecalls(user, { group, includeFinished, limit })),
  );

  server.registerTool(
    'get_einsatz',
    {
      title: 'Einsatz-Stammdaten',
      description:
        'Stammdaten eines Einsatzes: Name, Feuerwehr, Datum, Beschreibung, Einsatzort.',
      inputSchema: z.object({ firecallId }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ firecallId: id }) => {
      try {
        await authorizeFirecall(user, id);
      } catch (err) {
        return errorResult(authorizationMessage(err));
      }
      return jsonResult(await getFirecall(id));
    },
  );

  server.registerTool(
    'list_items',
    {
      title: 'Elemente eines Einsatzes',
      description:
        'Elemente der Einsatzkarte: Fahrzeuge (fzg/vehicle), Marker, Rohre, Leitungen ' +
        '(connection), Flächen (area), Linien (line), Kreise (circle), Einsatzleitung (el), ' +
        'ASSP, taktische Einheiten (tacticalUnit). Tagebuch (diary) und Geschäftsbuch (gb) ' +
        'haben eigene Tools.',
      inputSchema: z.object({
        firecallId,
        types: z
          .array(z.string())
          .optional()
          .describe('Nur diese Elementtypen'),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ firecallId: id, types, limit }) => {
      try {
        await authorizeFirecall(user, id);
      } catch (err) {
        return errorResult(authorizationMessage(err));
      }
      return jsonResult(await listItems(id, { types, limit }));
    },
  );

  server.registerTool(
    'list_ebenen',
    {
      title: 'Ebenen eines Einsatzes',
      description: 'Die Karten-Ebenen (Layer) eines Einsatzes.',
      inputSchema: z.object({ firecallId }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ firecallId: id }) => {
      try {
        await authorizeFirecall(user, id);
      } catch (err) {
        return errorResult(authorizationMessage(err));
      }
      return jsonResult(await listLayers(id));
    },
  );

  server.registerTool(
    'get_tagebuch',
    {
      title: 'Einsatztagebuch',
      description:
        'Einträge des Einsatztagebuchs, neueste zuerst. Für die nächste Seite `before` ' +
        'auf das `datum` des ältesten gelieferten Eintrags setzen.',
      inputSchema: z.object({
        firecallId,
        limit: z.number().int().min(1).max(100).optional(),
        before: z
          .string()
          .optional()
          .describe('Nur Einträge vor diesem ISO-Zeitstempel'),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ firecallId: id, limit, before }) => {
      try {
        await authorizeFirecall(user, id);
      } catch (err) {
        return errorResult(authorizationMessage(err));
      }
      return jsonResult(await listDiaryEntries(id, { limit, before }));
    },
  );

  server.registerTool(
    'get_geschaeftsbuch',
    {
      title: 'Geschäftsbuch',
      description:
        'Einträge des Geschäftsbuchs, neueste zuerst. Seitenweise wie beim Tagebuch.',
      inputSchema: z.object({
        firecallId,
        limit: z.number().int().min(1).max(100).optional(),
        before: z.string().optional(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ firecallId: id, limit, before }) => {
      try {
        await authorizeFirecall(user, id);
      } catch (err) {
        return errorResult(authorizationMessage(err));
      }
      return jsonResult(await listGeschaeftsbuchEntries(id, { limit, before }));
    },
  );

  server.registerTool(
    'get_einsatz_kontext',
    {
      title: 'Einsatz-Gesamtkontext',
      description:
        'Verdichteter Gesamtkontext eines Einsatzes: Stammdaten, Anzahl je Elementtyp, ' +
        'die Elemente der Lage, die Ebenen und die letzten Tagebucheinträge. Der beste ' +
        'erste Aufruf, um sich einen Überblick zu verschaffen.',
      inputSchema: z.object({ firecallId }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ firecallId: id }) => {
      try {
        await authorizeFirecall(user, id);
      } catch (err) {
        return errorResult(authorizationMessage(err));
      }
      return jsonResult(await getFirecallContext(id));
    },
  );
}

/** Tools des Scopes `hydranten:read`. */
export function registerWaterSupplyTools(
  server: McpServer,
  user: McpUser,
): void {
  server.registerTool(
    'search_wasserversorgung',
    {
      title: 'Wasserentnahmestellen suchen',
      description:
        'Umkreissuche über Hydranten, Saugstellen, Löschteiche und Behälter. Entweder ' +
        'Koordinaten angeben oder einen Einsatz — dann wird vom Einsatzort gemessen.',
      inputSchema: z.object({
        firecallId: z
          .string()
          .optional()
          .describe('Vom Einsatzort dieses Einsatzes aus messen'),
        lat: z.number().optional(),
        lng: z.number().optional(),
        radius: z
          .number()
          .int()
          .min(50)
          .max(2500)
          .optional()
          .describe('Suchradius in Metern (Vorgabe 600)'),
        kinds: z
          .array(z.enum(WATER_SUPPLY_KINDS))
          .optional()
          .describe('Nur diese Arten von Entnahmestellen'),
        hydrantType: z
          .string()
          .optional()
          .describe('Hydrantenart, z.B. "Überflurhydrant"'),
        limit: z.number().int().min(1).max(20).optional(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ firecallId: id, lat, lng, radius, kinds, hydrantType, limit }) => {
      let center: { lat: number; lng: number } | undefined;
      let origin = 'den angegebenen Koordinaten';

      if (typeof lat === 'number' && typeof lng === 'number') {
        center = { lat, lng };
      } else if (id) {
        try {
          const firecall = await authorizeFirecall(user, id);
          if (firecall.lat && firecall.lng) {
            center = { lat: firecall.lat, lng: firecall.lng };
            origin = `dem Einsatzort von "${firecall.name}"`;
          }
        } catch (err) {
          return errorResult(authorizationMessage(err));
        }
      }

      if (!center) {
        return errorResult(
          'Weder Koordinaten noch ein Einsatz mit gesetztem Einsatzort angegeben.',
        );
      }

      const effectiveRadius = radius ?? 600;
      const clusters = await queryClustersAdmin(center, effectiveRadius);
      const candidates = collectWaterSupplyCandidates(clusters, center, {
        radius: effectiveRadius,
        kinds: kinds as WaterSupplyKind[] | undefined,
        hydrantType,
        limit: limit ?? 5,
      });

      return jsonResult({
        origin,
        radius: effectiveRadius,
        candidates,
        beschreibung: candidates.map((candidate) =>
          describeWaterSupplyCandidate(candidate, center),
        ),
      });
    },
  );

  server.registerTool(
    'search_address',
    {
      title: 'Adresse suchen',
      description:
        'Geocoding einer Adresse über OpenStreetMap/Nominatim. Legt nichts an, liefert ' +
        'nur Koordinaten.',
      inputSchema: z.object({
        address: z.string().min(1),
        lat: z
          .number()
          .optional()
          .describe('Bezugspunkt für die Sortierung der Treffer'),
        lng: z.number().optional(),
      }),
      // Ein fremder Dienst wird befragt — genau dafür ist `openWorldHint` da.
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ address, lat, lng }) => {
      const results = await searchPlace(address, {
        position:
          typeof lat === 'number' && typeof lng === 'number'
            ? new GeoPosition(lat, lng)
            : undefined,
        maxResults: 3,
      });
      if (results.length === 0) {
        return errorResult(`Adresse "${address}" nicht gefunden`);
      }
      return jsonResult(
        results.map((place) => ({
          name: place.name || place.display_name,
          display_name: place.display_name,
          lat: parseFloat(place.lat),
          lng: parseFloat(place.lon),
        })),
      );
    },
  );
}
