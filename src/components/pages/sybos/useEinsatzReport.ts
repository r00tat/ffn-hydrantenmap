'use client';

import { useEffect, useMemo, useState } from 'react';
import { getBlaulichtSmsAlarmById } from '../../../app/blaulicht-sms/actions';
import type { BlaulichtSmsAlarm } from '../../../common/blaulichtsms';
import { vorgabeGeraetesatz } from '../../../common/atemschutzUeberwachung';
import useAtemschutzEinsatzdaten from '../../../hooks/useAtemschutzEinsatzdaten';
import useAtemschutzGeraete from '../../../hooks/useAtemschutzGeraete';
import { firecallAlarmIds, type Firecall } from '../../firebase/firestore';
import {
  buildAusgabeRows,
  buildGeraeteRows,
  buildTruppProtokolle,
  buildTruppRows,
} from './sybosExtras';

/** Die Alarmierungen aus BlaulichtSMS, die dem Einsatz zugeordnet sind. */
export function useFirecallAlarms(firecall: Firecall) {
  const [alarms, setAlarms] = useState<BlaulichtSmsAlarm[]>([]);
  const idsKey = firecallAlarmIds(firecall).join(',');
  const group = firecall.group;
  useEffect(() => {
    let active = true;
    (async () => {
      if (!idsKey || !group) {
        if (active) setAlarms([]);
        return;
      }
      try {
        const results = await Promise.all(
          idsKey.split(',').map((id) => getBlaulichtSmsAlarmById(group, id)),
        );
        if (active) setAlarms(results.filter((a): a is BlaulichtSmsAlarm => a !== null));
      } catch (err) {
        console.error('failed to load BlaulichtSMS alarms', err);
        if (active) setAlarms([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [group, idsKey]);
  return alarms;
}

/** Der Alarmierungstext aller zugeordneten Alarmierungen. */
export function useFirecallAlarmText(firecall: Firecall) {
  const alarms = useFirecallAlarms(firecall);
  return useMemo(
    () =>
      alarms
        .map((a) => a.alarmText?.trim())
        .filter(Boolean)
        .join('\n\n'),
    [alarms],
  );
}

/**
 * Der Atemschutz eines Einsatzes, aufbereitet für Sybos-Übertrag und
 * Druckseite: Trupps, Geräte, Ausgabe und das Protokoll je Bereitstellung.
 */
export function useAtemschutzReport(firecall: Firecall) {
  const { trupps, ausgaben } = useAtemschutzEinsatzdaten(firecall.id);
  // Gerätesatz für die Druckkurve, wenn am Trupp keiner steht — wie auf der
  // Überwachungsseite aus dem Flaschenbestand der Gruppe.
  const { flaschen } = useAtemschutzGeraete(firecall.group);
  const vorgabe = useMemo(() => vorgabeGeraetesatz(flaschen), [flaschen]);

  const truppRows = useMemo(() => buildTruppRows(trupps.protokoll), [trupps.protokoll]);
  const truppsById = useMemo(
    () => new Map(trupps.protokoll.map((tr) => [tr.id, tr])),
    [trupps.protokoll],
  );
  // Nur Bereitstellungen, die mehr erlebt haben als die Bereitstellung selbst.
  const protokolle = useMemo(
    () => buildTruppProtokolle(trupps.protokoll).filter((pr) => pr.ereignisse.length > 1),
    [trupps.protokoll],
  );
  const geraeteRows = useMemo(() => buildGeraeteRows(trupps.protokoll), [trupps.protokoll]);
  const ausgabeRows = useMemo(() => buildAusgabeRows(ausgaben), [ausgaben]);

  return { vorgabe, truppRows, truppsById, protokolle, geraeteRows, ausgabeRows };
}
