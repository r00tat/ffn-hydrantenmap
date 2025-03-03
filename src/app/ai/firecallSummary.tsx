import { useEffect, useState } from 'react';
import { formatTimestamp } from '../../common/time-format';
import { Diary, FirecallItem, Fzg } from '../../components/firebase/firestore';
import { useFirecallItems } from '../../components/firebase/firestoreHooks';
import useFirecall from '../../hooks/useFirecall';

const firecallItemTextFormatters: {
  [key: string]: <T extends FirecallItem>(item: T) => string;
} = {
  default: (item: FirecallItem) =>
    `${item.name} ${item.beschreibung || ''} ${formatTimestamp(
      item.datum
    )} Position: ${item.lat},${item.lng}`,
  vehicle: (item: FirecallItem) => {
    const v = item as Fzg;
    return `Fahrzeug ${v.name} ${v.fw || ''} ${
      v.beschreibung ? v.beschreibung?.replace('\n', ' ') : ''
    } ${v.besatzung ? 'Besatzung 1:' + v.besatzung : ''} ${
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
  // TODO extend to more items
};

export default function useFirecallSummary() {
  const firecall = useFirecall();
  const firecallItems = useFirecallItems();
  const [summary, setSummary] = useState('');

  useEffect(() => {
    const sum = `Einsatz ${firecall.name} am ${formatTimestamp(
      firecall.alarmierung || firecall.datum
    )}
    
    ${firecall.beschreibung || ''}}

    ${firecallItems
      .filter((i) => i.deleted !== true)
      .map((i) => {
        const formatter =
          firecallItemTextFormatters[i.type] ||
          firecallItemTextFormatters.default;
        return formatter(i);
      })
      .join('\n')}
    `;
    setSummary(sum);
  }, [firecall, firecallItems]);

  return summary;
}
