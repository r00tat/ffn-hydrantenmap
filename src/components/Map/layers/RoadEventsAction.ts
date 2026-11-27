'use server';

import { actionUserRequired } from '../../../app/auth';
import { BoundingBox, RoadEventsResult } from '../../../common/roadEvents';
import { filterEventsByBounds } from '../../../common/roadEventsBounds';
import { fetchAsfinagXml } from '../../../server/roadEvents/asfinagHttp';
import { evisClient } from '../../../server/roadEvents/evisHttp';
import {
  buildMotorwayGraph,
  findMotorwayPath,
  MotorwayNetworkFile,
} from '../../../server/roadEvents/motorwayPath';
import {
  asfinagFeedsFromEnv,
  createRoadEventsSource,
  evisFeedsFromEnv,
} from '../../../server/roadEvents/roadEventsSource';

let source: ReturnType<typeof createRoadEventsSource> | undefined;

function roadEventsSource() {
  source ??= createRoadEventsSource({
    feeds: [
      ...asfinagFeedsFromEnv(process.env, fetchAsfinagXml),
      ...evisFeedsFromEnv(process.env, evisClient),
    ],
    loadGraph: async () => {
      const network =
        await import('../../../server/roadEvents/data/gip-motorways.json');
      return buildMotorwayGraph(
        (network.default ?? network) as unknown as MotorwayNetworkFile
      );
    },
    findPath: (graph, from, to) => findMotorwayPath(graph, from, to),
  });
  return source;
}

function isValidBounds(bounds: BoundingBox): boolean {
  const values = [bounds?.south, bounds?.west, bounds?.north, bounds?.east];
  return (
    values.every((v) => typeof v === 'number' && Number.isFinite(v)) &&
    bounds.south <= bounds.north &&
    bounds.west <= bounds.east
  );
}

/**
 * Verkehrsmeldungen im Bereich: Autobahnen vom ASFINAG-Content-Portal,
 * Landesstraßen von EVIS.AT. Siehe docs/verkehrsmeldungen.md.
 */
export async function fetchRoadEvents(
  bounds: BoundingBox
): Promise<RoadEventsResult> {
  await actionUserRequired();
  if (!isValidBounds(bounds)) {
    return { configured: true, events: [], failedFeeds: [] };
  }
  const result = await roadEventsSource().get();
  return { ...result, events: filterEventsByBounds(result.events, bounds) };
}
