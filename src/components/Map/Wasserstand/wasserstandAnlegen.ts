'use client';

import type { LatLngPosition } from '../../../common/geo';
import { terrainClient } from '../../../common/terrain/terrainClient';
import type { Wasserstand } from '../../firebase/firestore';

/**
 * Was beim Anlegen einer Wasserausbreitung passieren muss.
 *
 * Zwei Dinge, die an mehreren Stellen gebraucht werden — auf der Karte, auf der
 * Seite „Hochwasser" und beim Verschieben des Markers. Sie stehen hier
 * gemeinsam, weil sie zusammen die Antwort auf „ein Punkt ist gesetzt, was
 * jetzt?" bilden.
 */

/** Die Felder, mit denen die Basishöhe am Element steht. */
export type WasserstandBasis = Pick<
  Wasserstand,
  'wasserBasisHoehe' | 'wasserBasisStufe'
>;

/**
 * Die Geländehöhe an einem Punkt, als Feldsatz für das Element.
 *
 * `undefined`, wenn das Höhenmodell dort nichts liefert — offline, jenseits der
 * Landesgrenze, Kachel nicht ladbar. Das Element wird dann trotzdem angelegt:
 * der Rechner bietet „Basishöhe neu bestimmen" an, sobald das Modell da ist.
 * Es gar nicht anzulegen wäre der schlechtere Tausch.
 *
 * **Beim Anlegen abgetastet und nicht erst im Rechner:** ohne die Basishöhe
 * steht im Rechner „Für den Saatpunkt liegt keine Geländehöhe vor", und das
 * ist als erste Rückmeldung auf einen gerade gesetzten Punkt schlicht falsch —
 * die Höhe liegt vor, sie wurde nur niemandem abgefragt.
 */
export async function wasserstandBasis(
  position: LatLngPosition
): Promise<WasserstandBasis | undefined> {
  try {
    const [sample] = await terrainClient().sample([position]);
    if (!sample) return undefined;
    return {
      wasserBasisHoehe: sample.heightM,
      wasserBasisStufe: sample.level,
    };
  } catch (err) {
    console.warn('Basishöhe nicht verfügbar', err);
    return undefined;
  }
}

/**
 * Elemente, die **dieser** Client gerade angelegt hat.
 *
 * Damit öffnet sich der Rechner von selbst und rechnet gleich — ohne dass man
 * den eben gesetzten Marker erst anklicken und dann noch das Symbol im Popup
 * treffen muss.
 *
 * Bewusst clientlokal und **verbrauchend**: Ein Merkmal am Element würde auf
 * jedem Gerät, das die Karte öffnet, einen Lauf auslösen und dabei Kacheln
 * laden. Gerechnet wird beim Anlegen, und zwar dort, wo angelegt wurde.
 */
const frischAngelegt = new Set<string>();

export const merkeFrischAngelegt = (id: string): void => {
  frischAngelegt.add(id);
};

/**
 * Ob dieses Element gerade angelegt wurde. **Fragt nur, ändert nichts.**
 *
 * Getrennt von `vergissFrischAngelegt`, weil die Frage beim Rendern gestellt
 * wird: Eine Antwort, die dabei etwas verbraucht, wäre bei doppelt
 * aufgerufenem Rendern (React im Strict-Modus) beim zweiten Mal eine andere.
 */
export const istFrischAngelegt = (id?: string): boolean =>
  id !== undefined && frischAngelegt.has(id);

/** Das Merkmal abräumen — gehört in einen Effekt, nicht ins Rendern. */
export const vergissFrischAngelegt = (id: string): void => {
  frischAngelegt.delete(id);
};
