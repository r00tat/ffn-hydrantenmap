import moment from 'moment';
import { useTranslations } from 'next-intl';
import {
  dateTimeFormat,
  formatTimestamp,
  parseTimestamp,
} from '../../common/time-format';
import {
  countCrewByVehicle,
  einsatzmittelKategorie,
  formatBesatzung,
  getEffectiveAts,
  getEffectiveBesatzung,
} from '../../common/vehicle-utils';
import { Diary, FirecallItem, Fzg, TacticalUnit } from '../firebase/firestore';
import { compareDiaryChronological } from './diary-order';

type DiaryTranslator = ReturnType<typeof useTranslations<'tagebuch'>>;

/**
 * Baut die Zeilen des Einsatztagebuchs: die gespeicherten Einträge plus die
 * aus den Zeiten der Fahrzeuge und taktischen Einheiten abgeleiteten
 * (alarmiert, eingetroffen, abgerückt) — chronologisch nummeriert und in der
 * gewünschten Richtung sortiert.
 */
export function buildDiaries(
  firecallItems: FirecallItem[],
  crewAssignments: Parameters<typeof countCrewByVehicle>[0],
  t: DiaryTranslator,
  sortAscending: boolean,
): Diary[] {
  // Taktische Einheiten tragen dieselben Zeitfelder wie Fahrzeuge und
  // gehören genauso ins Tagebuch.
  const cars = firecallItems.filter(
    (item: FirecallItem) =>
      item.type === 'vehicle' || item.type === 'tacticalUnit'
  ) as (Fzg | TacticalUnit)[];

  const { crewCount: crewCountMap, atsCount: atsCountMap } =
    countCrewByVehicle(crewAssignments);

  const getBesatzungText = (item: Fzg | TacticalUnit) => {
    // `mann` ist bei der Einheit schon die Gesamtstärke.
    if (item.type === 'tacticalUnit') {
      return item.mann ? String(item.mann) : '';
    }
    const kategorie = einsatzmittelKategorie(item);
    const bes = getEffectiveBesatzung(
      item.besatzung,
      crewCountMap.get(item.id || '') ?? 0,
      kategorie
    );
    return bes > 0 ? formatBesatzung(bes, kategorie) : '';
  };

  const fmtBesatzung = (item: Fzg | TacticalUnit) => {
    const bt = getBesatzungText(item);
    if (!bt) return '';
    return (item.type === 'tacticalUnit' ? 'Stärke ' : 'Besatzung ') + bt;
  };
  const fmtAts = (item: Fzg | TacticalUnit) => {
    const ats = getEffectiveAts(
      item.ats,
      atsCountMap.get(item.id || '') ?? 0
    );
    return ats > 0 ? 'ATS ' + ats : '';
  };

  // Beschriftet, damit im Tagebuch nicht nur eine nackte Zahl steht:
  // „Stärke 14, ATS 3" bzw. „Besatzung 1:8, ATS 2".
  const fmtBeschreibung = (item: Fzg | TacticalUnit) =>
    [fmtBesatzung(item), fmtAts(item)].filter(Boolean).join(', ');

  const firecallEntries: Diary[] = [
    cars
      .filter((item) => item.alarmierung)
      .map(
        (item) =>
          ({
            id: 'alarmierung' + item.id,
            datum: item.alarmierung,
            type: 'diary',
            name: t('vehicleAlerted', {
              name: item.name,
              fw: item.fw || '',
            }),
            beschreibung: fmtBeschreibung(item),
            editable: false,
            original: item,
            textRepresenation: t('vehicleTextAlerted', {
              name: item.name,
              fw: item.fw || '',
              besatzung: fmtBesatzung(item),
              ats: fmtAts(item),
              alarmiert: item.alarmierung
                ? formatTimestamp(item.alarmierung)
                : '',
              eintreffen: item.eintreffen
                ? formatTimestamp(item.eintreffen)
                : '',
              abruecken: item.abruecken
                ? formatTimestamp(item.abruecken)
                : '',
              lat: item.lat ?? '',
              lng: item.lng ?? '',
            }),
          } as Diary)
      ),
    cars
      .filter((item) => item.eintreffen)
      .map(
        (item) =>
          ({
            id: 'eintreffen' + item.id,
            datum: item.eintreffen,
            type: 'diary',
            name: t('vehicleArrived', {
              name: item.name,
              fw: item.fw || '',
            }),
            beschreibung: fmtBeschreibung(item),
            editable: false,
            original: item,
            textRepresenation: t('vehicleTextArrived', {
              name: item.name,
              fw: item.fw || '',
              besatzung: fmtBesatzung(item),
              ats: fmtAts(item),
              eintreffen: item.eintreffen
                ? formatTimestamp(item.eintreffen)
                : '',
              lat: item.lat ?? '',
              lng: item.lng ?? '',
            }),
          } as Diary)
      ),
    cars
      .filter((item) => item.abruecken)
      .map(
        (item) =>
          ({
            id: 'abruecken' + item.id,
            datum: item.abruecken,
            type: 'diary',
            name: t('vehicleDeparted', {
              name: item.name,
              fw: item.fw || '',
            }),
            beschreibung: fmtBeschreibung(item),
            editable: false,
            original: item,
            textRepresenation: t('vehicleTextDeparted', {
              name: item.name,
              fw: item.fw || '',
              besatzung: fmtBesatzung(item),
              ats: fmtAts(item),
              abruecken: item.abruecken
                ? formatTimestamp(item.abruecken)
                : '',
              lat: item.lat ?? '',
              lng: item.lng ?? '',
            }),
          } as Diary)
      ),
    // firecallItems
    //   .filter(
    //     (item: FirecallItem) =>
    //       ['vehicle', 'diary'].indexOf(item.type) < 0 && item.datum
    //   )
    //   .map(
    //     (item: FirecallItem) =>
    //       ({
    //         ...item,
    //         type: 'diary',
    //         editable: true,
    //         original: item,
    //       } as Diary)
    //   ),
    firecallItems
      .filter((item: FirecallItem) => item.type === 'diary')
      .map((item: FirecallItem) => item as Diary)
      .map(
        (item: Diary) =>
          ({
            ...item,
            original: item,
            editable: true,
            textRepresenation: `${formatTimestamp(item.datum)} ${
              item.art === 'B'
                ? t('type.B')
                : item.art === 'F'
                  ? t('type.F')
                  : t('type.M')
            } ${item.von ? 'von ' + item.von : ''} ${
              item.an ? 'an ' + item.an : ''
            }: ${item.name} ${item.beschreibung} ${
              item.erledigt
                ? 'erledigt ' + formatTimestamp(item.erledigt)
                : ''
            }`,
          } as Diary)
      ),
  ].flat();
  const diaries = firecallEntries
    // Chronologisch nummerieren — millisekundengenau, bevor der Zeitstempel
    // auf Sekunden gekürzt wird (siehe diary-order.ts).
    .sort(compareDiaryChronological)
    .map((a, index) => ({
      ...a,
      datum: parseTimestamp(a.datum)?.format() ?? new Date().toISOString(),
      nummer: index + 1,
    }))
    // apply requested display sort order; die Nummer ist die Zeitfolge
    .sort((a, b) =>
      sortAscending ? a.nummer - b.nummer : b.nummer - a.nummer
    )
    .map((a) => ({
      ...a,
      datum: moment(a.datum).format(dateTimeFormat),
      erledigt: a.erledigt
        ? moment(a.erledigt).format(dateTimeFormat)
        : undefined,
    }));
  return diaries;
}
