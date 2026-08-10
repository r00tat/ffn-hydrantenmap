'use server';

import { actionUserRequired } from '../../../app/auth';
import { parsePowerOutageResponse, PowerOutage } from './powerOutageUtils';

export type { PowerOutage };

export async function fetchPowerOutageData(): Promise<PowerOutage[]> {
  await actionUserRequired();

  try {
    const response = await fetch(
      'https://analytics.netzburgenland.at/mapviewer/dataserver/nommaps',
      {
        method: 'POST',
        headers: {
          Accept: 'text/plain, */*; q=0.01',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Origin: 'https://analytics.netzburgenland.at',
          Referer: 'https://analytics.netzburgenland.at/stoerungsinfo',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: 't=THEME_STOERUNGEN&bbox=1511790.3047901045%2C5588775.918707911%2C2177709.6952098957%2C6451224.081292088&include_label_box=true&to_srid=3857&bbox_srid=3857&refresh=20079',
        next: { revalidate: 120 },
      }
    );

    if (!response.ok) {
      console.error(
        `Failed to fetch power outage data: ${response.status} ${response.statusText}`
      );
      return [];
    }

    return parsePowerOutageResponse(await response.json());
  } catch (err) {
    console.error('Failed to fetch power outage data', err);
    return [];
  }
}
