import * as fs from 'fs';
import { stringify } from 'csv-stringify/sync';
import { Coordinates, GisObject, WgsObject } from '../common/gis-objects';
import { gk34ToWgs84 } from '../common/wgs-convert';

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
  [cValue: string]: any;
}

const harparser = async (inputFile: string, ortschaft = 'ND') => {
  console.info(`start`);
  const har = JSON.parse(fs.readFileSync(inputFile, { encoding: 'utf8' }));

  const reqs = har.log.entries;
  console.info(`${reqs.length} requests`);
  // console.info(`request 0: ${JSON.stringify(reqs[0], undefined, 2)}`);
  const validRequests: any[] = reqs.filter(
    ({ request, response }: any) =>
      request.method === 'POST' &&
      // request.url.indexOf('https://gis.bgld.gv.at/Datenerhebung/synserver') >=
      //   0 &&
      response.content.mimeType === 'application/json' &&
      response.status === 200
  );
  console.info(`${validRequests.length} matching requests`);

  fs.writeFileSync(
    'output/requests.jsonl',
    validRequests.map((o) => JSON.stringify(o)).join('\n')
  );

  const responseObjects: any[] = validRequests
    .map(({ response }: any) => JSON.parse(response.content.text))
    .filter((results: any) => results?.RES[0]?.RESULTS)
    .map((result: any) => result?.RES[0]?.RESULTS);

  fs.writeFileSync(
    'output/responses.jsonl',
    responseObjects.map((o) => JSON.stringify(o)).join('\n')
  );
  console.info(`${responseObjects.length} responses`);

  const gisObjects: GisObject[] = responseObjects

    .map((result: any) => {
      // get metadata
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
        .filter((g) => g.name && g.c_x !== null && g.c_y !== null);
    })
    .flat();
  // .filter(
  //   (value: GisObject, index: number, self: GisObject[]) =>
  //     self.indexOf(value) === index
  // );

  console.info(`got ${gisObjects.length} gis objects`);

  fs.writeFileSync(
    'output/records.jsonl',
    gisObjects.map((o) => JSON.stringify(o)).join('\n')
  );

  const filteredGisObjects: { [key: string]: GisObject } = {};
  gisObjects.forEach((g) => (filteredGisObjects[g.name] = g));
  const filtered: GisObject[] = Object.values(filteredGisObjects).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  console.info(`got ${filtered.length} final results`);
  fs.writeFileSync(
    'output/filtered.jsonl',
    filtered.map((o) => JSON.stringify(o)).join('\n')
  );

  console.info(`converting to GPS WGS84`);
  const wgsGisObjects: WgsObject[] = filtered.map((g) => {
    const wgs = gk34ToWgs84(g.c_x, g.c_y);
    return {
      ...g,
      lat: wgs.y,
      lng: wgs.x,
      ortschaft,
    } as WgsObject;
  });
  fs.writeFileSync(
    'output/wgs.jsonl',
    wgsGisObjects.map((o) => JSON.stringify(o)).join('\n')
  );
  fs.writeFileSync(
    'output/wgs.csv',
    stringify(wgsGisObjects, {
      header: true,
    })
  );
  console.info(`wrote ${wgsGisObjects.length} converted objects`);

  return 'output/wgs.csv';
};

if (require.main === module) {
  console.info(`main harparser`);
  harparser(process.argv[2], process.argv[3] || 'ND');
}

export default harparser;
