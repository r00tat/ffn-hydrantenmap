import { DEFAULT_EINSATZ_FW } from '../components/FirecallItems/einsatzDefaults';
import { useFirecall } from './useFirecall';

/**
 * Die eigene Feuerwehr im aktuellen Einsatz: die des Einsatzes, sonst die
 * Vorgabe. Maßstab dafür, welche Fahrzeuge in Listen vorne stehen.
 */
export default function useOwnFw(): string {
  const firecall = useFirecall();
  return firecall?.fw?.trim() || DEFAULT_EINSATZ_FW;
}
