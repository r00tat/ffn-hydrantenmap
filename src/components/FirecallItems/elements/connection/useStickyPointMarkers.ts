import type { LeafletMouseEvent } from 'leaflet';
import { useCallback, useRef, useState } from 'react';
import { useMapEvent } from 'react-leaflet';

/**
 * Sichtbarkeit der Eckpunkte einer fertigen Linie oder Fläche.
 *
 * Die Punkte gehen mit dem Popup des Elements auf, schließen aber **nicht** mit
 * ihm: Das Popup liegt über den Punkten, und wer einen davon greifen will, muss
 * es erst wegklicken können. Ausgeblendet wird erst beim Klick woanders auf die
 * Karte.
 *
 * Leaflet reicht den Klick auf einen Pfad an die Karte weiter
 * (`bubblingMouseEvents`). Der Klick aufs eigene Element wird deshalb über
 * `markOwnClick` vermerkt und am Kartenklick an seinem DOM-Ereignis erkannt.
 * Punkte und Popups geben ihren Klick nicht weiter und brauchen das nicht.
 */
export function useStickyPointMarkers() {
  const [visible, setVisible] = useState(false);
  const ownClick = useRef<Event | undefined>(undefined);

  useMapEvent('click', (event: LeafletMouseEvent) => {
    if (event.originalEvent === ownClick.current) return;
    setVisible(false);
  });

  const show = useCallback(() => setVisible(true), []);
  const markOwnClick = useCallback((event: LeafletMouseEvent) => {
    ownClick.current = event.originalEvent;
  }, []);

  return { visible, show, markOwnClick };
}
