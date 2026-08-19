import { FirecallItem } from '../../components/firebase/firestore';

const lower = (value: string) => value.toLocaleLowerCase('de');

/**
 * Ein Element auf der Karte über den gesprochenen Namen finden.
 *
 * Zuerst über den Namen selbst. Findet das nichts, werden alle Wörter der
 * Anfrage gegen Name und Feuerwehr zusammen geprüft: Ein Fahrzeug heißt
 * „TLFA 4000" und gehört der Wehr „Neusiedl am See" — gesagt wird aber
 * „TLFA Neusiedl", und das steht so an keinem einzelnen Feld.
 *
 * Alle Wörter müssen treffen. „TLFA Weiden" darf nicht das Neusiedler
 * Fahrzeug liefern, nur weil „TLFA" passt.
 */
export function findFirecallItemByName(
  items: FirecallItem[],
  query: string | undefined
): FirecallItem | undefined {
  const needle = query?.trim();
  if (!needle) return undefined;

  const candidates = items.filter((i) => !i.deleted);
  const byName = candidates.find((i) =>
    i.name ? lower(i.name).includes(lower(needle)) : false
  );
  if (byName) return byName;

  const words = lower(needle).split(/\s+/).filter(Boolean);
  return candidates.find((item) => {
    const haystack = lower(
      [item.name, (item as { fw?: string }).fw].filter(Boolean).join(' ')
    );
    return words.every((word) => haystack.includes(word));
  });
}
