import type { useFormatter } from 'next-intl';
import type { ExpiryStatus } from '../../../common/geraetCharge';

/** Das heutige Datum als `YYYY-MM-DD` in der Ortszeit des Geräts. */
export function localTodayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Textfarbe eines Ablaufstatus: abgelaufen rot, bald orange, sonst keine. */
export function expiryColor(status: ExpiryStatus): string | undefined {
  if (status === 'abgelaufen') return 'error.main';
  if (status === 'bald') return 'warning.main';
  return undefined;
}

/**
 * Ein Datum `YYYY-MM-DD` für die Anzeige. Als UTC-Mitternacht gelesen — in
 * der Zeitzone der App (Europa) bleibt das derselbe Kalendertag.
 */
export function formatIsoDate(
  format: ReturnType<typeof useFormatter>,
  iso: string | undefined,
): string {
  if (!iso) return '';
  const date = new Date(iso.slice(0, 10));
  if (Number.isNaN(date.getTime())) return iso;
  return format.dateTime(date, { dateStyle: 'medium' });
}
