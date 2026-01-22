import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../auth';
import { gk34ToWgs84 } from '../../../../common/wgs-convert';
import { GisObject, WgsObject } from '../../../../common/gis-objects';
import { writeBatches } from '../../../../server/firebase/import';

interface Metadata {
  id_attr: number;
  name: string;
  columnsize: number;
  type: string;
}

interface Datapoint {
  jsxid: string;
  oid: string;
  syn_relate: string;
  c0?: string;
  syn_centroid: string;
  c_x: string;
  c_y: string;
  e_xmin: string;
  e_ymin: string;
  e_xmax: string;
  e_ymax: string;
  syn_nodename: string;
  [cValue: string]: string | undefined;
}

interface GisWgsImportObject extends WgsObject {
  ortschaft: string;
}

function createProgressStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });

  const send = (data: Record<string, unknown>) => {
    if (controller) {
      controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
    }
  };

  const close = () => {
    if (controller) {
      controller.close();
    }
  };

  return { stream, send, close };
}

function parseHarContent(harText: string, ortschaft: string): WgsObject[] {
  const har = JSON.parse(harText);
  const reqs = har.log.entries;

  const validRequests: { request: { method: string }; response: { content: { mimeType: string; text: string }; status: number } }[] = reqs.filter(
    ({ request, response }: { request: { method: string }; response: { content: { mimeType: string }; status: number } }) =>
      request.method === 'POST' &&
      response.content.mimeType === 'application/json' &&
      response.status === 200
  );

  type ResponseObject = { RECORD_METADATA?: { ATTR?: Metadata[] }; data?: { anies?: Datapoint[] } };
  type ParsedResult = { RES?: { RESULTS?: ResponseObject }[] } | null;

  const responseObjects: ResponseObject[] = validRequests
    .map(({ response }) => {
      try {
        return JSON.parse(response.content.text) as ParsedResult;
      } catch {
        return null;
      }
    })
    .filter((results): results is NonNullable<ParsedResult> => Boolean(results?.RES?.[0]?.RESULTS))
    .map((result) => result.RES![0].RESULTS as ResponseObject);

  const gisObjects: GisObject[] = responseObjects
    .map((result) => {
      const metadata: Metadata[] = result?.RECORD_METADATA?.ATTR || [];
      const records: Datapoint[] = result?.data?.anies || [];
      return records
        .map((record) => {
          const g: GisObject = {
            name: record.syn_relate,
            c_y: Number.parseFloat(record.c_y),
            c_x: Number.parseFloat(record.c_x),
          };
          metadata.forEach((md, mdI) => {
            g[md.name] = record[`c${mdI}`] || '';
          });
          return g;
        })
        .filter((g) => g.name && !Number.isNaN(g.c_x) && !Number.isNaN(g.c_y));
    })
    .flat();

  // Deduplicate by name
  const filteredGisObjects: { [key: string]: GisObject } = {};
  gisObjects.forEach((g) => (filteredGisObjects[g.name] = g));
  const filtered = Object.values(filteredGisObjects).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  // Convert to WGS84
  const wgsGisObjects: WgsObject[] = filtered.map((g) => {
    const wgs = gk34ToWgs84(g.c_x, g.c_y);
    return {
      ...g,
      lat: wgs.y,
      lng: wgs.x,
      ortschaft,
    } as WgsObject;
  });

  return wgsGisObjects;
}

const convertValuesToNumber = (record: WgsObject): GisWgsImportObject => {
  const data: Record<string, unknown> = {};
  Object.entries(record).forEach(([key, value]) => {
    const n = Number.parseFloat(String(value));
    data[key] = Number.isNaN(n) ? value : n;
  });
  return data as GisWgsImportObject;
};

function createRecordMap(records: WgsObject[]): { [key: string]: GisWgsImportObject } {
  return records.map(convertValuesToNumber).reduce((p, c) => {
    const key = c.name.startsWith(c.ortschaft.toLowerCase())
      ? c.name.toLowerCase()
      : `${c.ortschaft}${c.name}`.toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
    p[key] = c;
    return p;
  }, {} as { [key: string]: GisWgsImportObject });
}

export async function POST(request: NextRequest) {
  // Check admin auth
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const contentType = request.headers.get('content-type') || '';

  // Handle continue action (JSON body)
  if (contentType.includes('application/json')) {
    const body = await request.json();
    if (body.action === 'continue') {
      const { collectionName, data } = body;

      const { stream, send, close } = createProgressStream();

      // Process in background
      (async () => {
        try {
          send({ step: 3, status: 'in_progress', message: 'Importing to Firestore...' });

          const recordMap = createRecordMap(data);
          await writeBatches(collectionName, recordMap, { merge: true });

          send({ step: 3, status: 'completed', count: Object.keys(recordMap).length });
        } catch (err) {
          send({ step: 3, status: 'error', error: err instanceof Error ? err.message : 'Unknown error' });
        } finally {
          close();
        }
      })();

      return new Response(stream, {
        headers: { 'Content-Type': 'application/x-ndjson' },
      });
    }
  }

  // Handle initial HAR file upload (multipart/form-data)
  const formData = await request.formData();
  const harFile = formData.get('harFile') as File | null;
  const ortschaft = (formData.get('ortschaft') as string) || 'ND';
  const collectionName = formData.get('collectionName') as string;

  if (!harFile || !collectionName) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const { stream, send, close } = createProgressStream();

  // Process in background
  (async () => {
    try {
      // Step 1: Parse HAR
      send({ step: 0, status: 'in_progress', message: 'Parsing HAR file...' });
      const harText = await harFile.text();
      send({ step: 0, status: 'completed' });

      // Step 2: Convert coordinates
      send({ step: 1, status: 'in_progress', message: 'Converting coordinates...' });
      const wgsObjects = parseHarContent(harText, ortschaft);
      send({ step: 1, status: 'completed', count: wgsObjects.length });

      // Step 3: Preview - pause for user review
      // Send all data to client (preview slice is for display only)
      const preview = wgsObjects.slice(0, 20);
      send({ step: 2, status: 'paused', preview, data: wgsObjects, total: wgsObjects.length });
    } catch (err) {
      send({ step: 0, status: 'error', error: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      close();
    }
  })();

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}
