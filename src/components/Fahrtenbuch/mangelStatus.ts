import type { MangelStatus } from '../../common/mangel';

/**
 * Die Farbe eines Status-Chips.
 *
 * Steht als eigenes Modul neben den Komponenten, weil Liste, Dialog und
 * Fahrzeugkarte dieselbe Zuordnung brauchen: Ein offener Mangel, der in der
 * Liste rot und auf der Karte grau erschiene, wäre ein Fehler in einem
 * sicherheitsrelevanten Hinweis.
 */
export function mangelStatusColor(
  status: MangelStatus,
): 'error' | 'warning' | 'success' {
  switch (status) {
    case 'resolved':
      return 'success';
    case 'inProgress':
      return 'warning';
    default:
      return 'error';
  }
}
