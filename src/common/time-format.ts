import moment from 'moment';

export const dateTimeFormat = 'DD.MM.YYYY HH:mm:ss';
export const dateFormat = 'DD.MM.YYYY';

export function formatTimestamp(timestamp?: string | Date) {
  return moment(timestamp).locale('de').format(dateTimeFormat);
}
export const timeFormats = [
  moment.ISO_8601,
  'DD.MM.YYYY HH:mm:ss',
  'DD.MM.YYYY, HH:mm:ss',
  'DD.MM.YYYYTHH:mm:ss',
  moment.HTML5_FMT.DATETIME_LOCAL,
  moment.HTML5_FMT.DATETIME_LOCAL_SECONDS,
  'DD.MM.YYYY',
  'DD.MM',
  'HH:mm',
  'HH:mm:ss',
];

export function parseTimestamp(timestamp?: string): moment.Moment | undefined {
  if (!timestamp) {
    return undefined;
  }
  const m = moment(timestamp, timeFormats, 'de');
  if (m.isValid()) {
    return m;
  }
  return undefined;
}
