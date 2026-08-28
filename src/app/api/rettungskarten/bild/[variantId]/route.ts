import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { loadRescueCatalog } from '../../../../../server/rescue/euroRescueCatalog';
import { fetchRescuePicture } from '../../../../../server/rescue/rescuePicture';

/**
 * Das Fahrzeugbild einer Katalogvariante, über den eigenen Origin.
 *
 * Warum überhaupt ein Umweg: Euro NCAP liefert die PNGs mit
 * `Content-Type: application/pdf`, und Chrome verwirft eine solche
 * cross-origin-Antwort per ORB, ohne die Bytes anzusehen. Siehe
 * `rescuePicture.ts` und docs/rettungskarten.md.
 *
 * Der Aufrufer nennt eine **Varianten-ID**, keine URL: die Adresse kommt aus
 * dem Katalog, damit hier kein offener Proxy entsteht.
 *
 * Angemeldet wird über die Session-Cookie und nicht über `userRequired`: ein
 * `<img src>` schickt keinen Authorization-Header.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ variantId: string }> },
) {
  const session = await auth();
  if (!session?.user?.isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { variantId } = await params;

  let pictureUrl: string | undefined;
  try {
    const catalog = await loadRescueCatalog();
    pictureUrl = catalog.find((variant) => variant.id === variantId)?.pictureUrl;
  } catch (err) {
    console.error('Euro Rescue catalog unavailable for picture:', err);
    return NextResponse.json({ error: 'Upstream unavailable' }, { status: 502 });
  }

  if (!pictureUrl) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let picture;
  try {
    picture = await fetchRescuePicture(pictureUrl);
  } catch (err) {
    console.error('Euro Rescue picture request failed:', err);
    return NextResponse.json({ error: 'Upstream unavailable' }, { status: 502 });
  }
  if (!picture) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return new NextResponse(picture.body as unknown as BodyInit, {
    headers: {
      'Content-Type': picture.contentType,
      // Das Bild einer Variante ändert sich praktisch nie; der Katalog wird
      // ohnehin nur einmal täglich neu geladen. `private`, weil die Route
      // hinter der Anmeldung liegt.
      'Cache-Control': 'private, max-age=86400',
      // Jetzt trägt die Antwort den richtigen Typ — also darf der Browser
      // auch nicht mehr raten.
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
