'use client';

import { useTranslations } from 'next-intl';
import { CSSProperties } from 'react';
import { Diary } from '../firebase/firestore';
import { formatSybosTime } from './sybos/sybosReport';

const th: CSSProperties = {
  textAlign: 'left',
  borderBottom: '2px solid #333',
  padding: '4px 8px',
  whiteSpace: 'nowrap',
};

const td: CSSProperties = {
  borderBottom: '1px solid #ccc',
  padding: '4px 8px',
  verticalAlign: 'top',
};

/**
 * Das Einsatztagebuch als Tabelle mit nur vier Spalten.
 *
 * Mit je einer Spalte für Von, An, Information, Anmerkung und Erledigt blieb
 * dem eigentlichen Text auf A4 kaum Breite. Deshalb steht Von/An in einer
 * Spalte, und Titel, Beschreibung und der Erledigt-Vermerk teilen sich eine
 * Zelle: der Titel fett, darunter die Beschreibung, darunter „✓ erledigt".
 */
export default function DiaryTable({ diaries }: { diaries: Diary[] }) {
  const t = useTranslations('print');

  return (
    <table
      className="print-table"
      style={{ width: '100%', borderCollapse: 'collapse' }}
    >
      <thead>
        <tr>
          <th style={th}>{t('cols.numberShort')}</th>
          <th style={th}>{t('cols.time')}</th>
          <th style={th}>{t('cols.fromTo')}</th>
          <th style={{ ...th, width: '100%' }}>{t('cols.entry')}</th>
        </tr>
      </thead>
      <tbody>
        {diaries.map((item) => {
          const fromTo = [item.von, item.an].filter(Boolean).join(' → ');
          const done = item.erledigt
            ? formatSybosTime(item.erledigt) || item.erledigt
            : '';
          return (
            <tr key={item.id} style={{ breakInside: 'avoid' }}>
              <td style={td}>{item.nummer}</td>
              <td style={{ ...td, whiteSpace: 'nowrap' }}>
                {formatSybosTime(item.datum) || item.datum}
              </td>
              <td style={td}>{fromTo}</td>
              <td style={td}>
                <strong>{item.name}</strong>
                {item.beschreibung && (
                  <div style={{ whiteSpace: 'pre-wrap' }}>
                    {item.beschreibung}
                  </div>
                )}
                {item.erledigt && (
                  <div style={{ fontStyle: 'italic' }}>
                    {t('doneAt', { time: done })}
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
