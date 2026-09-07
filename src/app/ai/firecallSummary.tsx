import { useContext, useMemo } from 'react';
import { formatTimestamp } from '../../common/time-format';
import {
  countCrewByVehicle,
  einsatzmittelKategorie,
  EINSATZMITTEL_KATEGORIE_LABELS,
  formatBesatzung,
  getEffectiveBesatzung,
} from '../../common/vehicle-utils';
import {
  Diary,
  FirecallItem,
  Fzg,
  GeschaeftsbuchEintrag,
} from '../../components/firebase/firestore';
import { useFirecallItems } from '../../components/firebase/firestoreHooks';
import useFirecall, { FirecallContext } from '../../hooks/useFirecall';

/**
 * Die Besatzung für die Zusammenfassung — dieselbe Ableitung wie auf der Karte.
 *
 * Bewusst nicht der Rohwert des Feldes mit einem festen „1:" davor: Ohne
 * gepflegte Besatzung zählen die zugeordneten Personen, und am Aufbau steht
 * keine Führungskraft an.
 */
function besatzungText(v: Fzg, crewCountMap: Map<string, number>): string {
  const kategorie = einsatzmittelKategorie(v);
  const bes = getEffectiveBesatzung(
    v.besatzung,
    crewCountMap.get(v.id || '') ?? 0,
    kategorie
  );
  if (bes <= 0) return '';
  return `Besatzung ${formatBesatzung(bes, kategorie)}`;
}

const firecallItemTextFormatters: {
  [key: string]: <T extends FirecallItem>(
    item: T,
    crewCountMap: Map<string, number>
  ) => string;
} = {
  default: (item: FirecallItem) =>
    `${item.name} ${item.beschreibung || ''} ${formatTimestamp(
      item.datum
    )} Position: ${item.lat},${item.lng}`,
  vehicle: (item: FirecallItem, crewCountMap: Map<string, number>) => {
    const v = item as Fzg;
    return `${EINSATZMITTEL_KATEGORIE_LABELS[einsatzmittelKategorie(v)]} ${
      v.name
    } ${v.fw || ''} ${
      v.beschreibung ? v.beschreibung?.replace('\n', ' ') : ''
    } ${besatzungText(v, crewCountMap)} ${
      v.ats ? 'Atemschutzträger ' + v.ats : ''
    }  ${
      v.alarmierung ? 'alarmierung ' + formatTimestamp(v.alarmierung) : ''
    } ${v.eintreffen ? 'eintreffen ' + formatTimestamp(v.eintreffen) : ''} ${
      v.abruecken ? 'abruecken ' + formatTimestamp(v.abruecken) : ''
    } Position ${v.lat},${v.lng}`;
  },
  diary: (i: FirecallItem) => {
    const item = i as Diary;
    return `Tagebucheintrag: ${formatTimestamp(item.datum)} ${
      item.art === 'B' ? 'Befehl' : item.art === 'F' ? 'Frage' : 'Meldung'
    } ${item.von ? 'von ' + item.von : ''} ${item.an ? 'an ' + item.an : ''}: ${
      item.name
    } ${item.beschreibung?.replace('\n', ' ') || ''} ${
      item.erledigt ? 'erledigt ' + formatTimestamp(item.erledigt) : ''
    }`;
  },
  gb: (i: FirecallItem) => {
    const item = i as GeschaeftsbuchEintrag;
    return `Geschäftsbucheintrag: ${item.nummer || ''} ${formatTimestamp(
      item.datum
    )} ${item.ausgehend ? 'ausgehend' : 'eingehend'} ${
      item.von ? 'von ' + item.von : ''
    } ${item.an ? 'an ' + item.an : ''}: ${item.name} ${
      item.beschreibung?.replace('\n', ' ') || ''
    } ${item.weiterleitung ? 'weiterleitung an' + item.weiterleitung : ''}`;
  },
};

export default function useFirecallSummary() {
  const firecall = useFirecall();
  const firecallItems = useFirecallItems();
  const { crewAssignments } = useContext(FirecallContext);
  const { crewCount: crewCountMap } = useMemo(
    () => countCrewByVehicle(crewAssignments),
    [crewAssignments]
  );

  const summary = useMemo(() => {
    const sum = `Einsatz ${firecall.name} am ${formatTimestamp(
      firecall.date
    )}

    ${firecall.beschreibung || ''}}

    ${firecallItems
      .filter((i) => i.deleted !== true)
      .map((i) => {
        const formatter =
          firecallItemTextFormatters[i.type] ||
          firecallItemTextFormatters.default;
        return formatter(i, crewCountMap);
      })
      .join('\n')}
    `;
    return sum;
  }, [firecall, firecallItems, crewCountMap]);

  return summary;
}
