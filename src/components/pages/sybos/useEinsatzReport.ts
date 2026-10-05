'use client';

import { useEffect, useMemo, useState } from 'react';
import { getBlaulichtSmsAlarmById } from '../../../app/blaulicht-sms/actions';
import type { BlaulichtSmsAlarm } from '../../../common/blaulichtsms';
import { vorgabeGeraetesatz } from '../../../common/atemschutzUeberwachung';
import useAtemschutzEinsatzdaten from '../../../hooks/useAtemschutzEinsatzdaten';
import useAtemschutzGeraete from '../../../hooks/useAtemschutzGeraete';
import useFirebaseLogin from '../../../hooks/useFirebaseLogin';
import useGeraete from '../../../hooks/useGeraete';
import useOnline from '../../../hooks/useOnline';
import { firecallAlarmIds, type Firecall } from '../../firebase/firestore';
import useGeraetEinsatz from '../../Geraete/einsatz/useGeraetEinsatz';
import {
  buildAusgabeRows,
  buildEinsatzGeraetRows,
  buildGeraeteRows,
  buildTruppProtokolle,
  buildTruppRows,
} from './sybosExtras';

/**
 * Die Alarmierungen aus BlaulichtSMS, die dem Einsatz zugeordnet sind.
 *
 * Kommen über eine Server Action — offline wird nicht angefragt (die
 * bisherigen bleiben stehen) und nach dem Reconnect nachgeholt.
 */
export function useFirecallAlarms(firecall: Firecall) {
  const [alarms, setAlarms] = useState<BlaulichtSmsAlarm[]>([]);
  const idsKey = firecallAlarmIds(firecall).join(',');
  const group = firecall.group;
  const online = useOnline();
  useEffect(() => {
    let active = true;
    (async () => {
      if (!idsKey || !group) {
        if (active) setAlarms([]);
        return;
      }
      if (!online) return;
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
  }, [group, idsKey, online]);
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

/**
 * Geräte und Verbrauchsmaterial des Einsatzes, eine Zeile je Artikel und Art —
 * für Sybos-Seite und Ausdruck gleich. Die Stammdaten liest nur ein Mitglied
 * der Gruppe; ein Einsatz-Gast sieht die Einträge mit ihrem kopierten Namen.
 */
export function useEinsatzGeraetRows(firecall: Firecall) {
  const { groups } = useFirebaseLogin();
  const isGroupMember = !!firecall.group && (groups ?? []).includes(firecall.group);
  const { geraete, bestandById } = useGeraete(isGroupMember ? firecall.group : undefined);
  const { entries } = useGeraetEinsatz(firecall.id);
  return useMemo(
    () => buildEinsatzGeraetRows(entries, new Map(geraete.map((g) => [g.id, g])), bestandById),
    [bestandById, entries, geraete],
  );
}
