'use server';

import { actionUserRequired } from '../../../app/auth';
import { BoundingBox, RoadEventsResult } from '../../../common/roadEvents';
import { filterEventsByBounds } from '../../../common/roadEventsBounds';
import { evisClient } from '../../../server/roadEvents/evisHttp';
import {
  createRoadEventsSource,
  evisFeedsFromEnv,
} from '../../../server/roadEvents/roadEventsSource';

let source: ReturnType<typeof createRoadEventsSource> | undefined;

function roadEventsSource() {
  source ??= createRoadEventsSource({
    feeds: evisFeedsFromEnv(process.env, evisClient),
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
 * Verkehrsmeldungen von EVIS.AT im Bereich, Autobahnen wie Landesstraßen.
 * Siehe docs/verkehrsmeldungen.md.
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
