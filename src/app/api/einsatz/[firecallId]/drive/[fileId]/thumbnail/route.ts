import { NextRequest, NextResponse } from 'next/server';
import { DRIVE_THUMBNAIL_SIZE } from '../../../../../../../common/drive';
import { driveAccessToken } from '../../../../../../../server/auth/driveAuth';
import { driveClient } from '../../../../../../../server/drive/driveClient';
import { actionUserAuthorizedForFirecall } from '../../../../../../auth';

/**
 * Vorschaubild einer Drive-Datei.
 *
 * Nötig, weil die `thumbnailLink` der Drive-API voraussetzt, dass der im
 * Browser angemeldete Google-Nutzer Zugriff auf die Datei hat — unsere Nutzer
 * sind aber in der App angemeldet, nicht in Drive.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ firecallId: string; fileId: string }> },
) {
  try {
    const { firecallId, fileId } = await params;
    const firecall = await actionUserAuthorizedForFirecall(firecallId);
    if (!firecall.driveFolderId) {
      return NextResponse.json({ error: 'no drive folder' }, { status: 404 });
    }

    const drive = driveClient();
    const file = await drive.files.get({
      fileId,
      fields: 'id,parents,thumbnailLink,trashed',
      supportsAllDrives: true,
    });

    // Ohne diese Prüfung wäre der Handler ein Leseproxy auf das gesamte Shared
    // Drive für jeden, der eine beliebige Datei-ID kennt.
    if (
      file.data.trashed ||
      !file.data.parents?.includes(firecall.driveFolderId)
    ) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    if (!file.data.thumbnailLink) {
      return NextResponse.json({ error: 'no thumbnail' }, { status: 404 });
    }

    const url = file.data.thumbnailLink.replace(
      /=s\d+$/,
      `=s${DRIVE_THUMBNAIL_SIZE}`,
    );
    const token = await driveAccessToken();
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok || !res.body) {
      return NextResponse.json({ error: 'thumbnail failed' }, { status: 502 });
    }

    return new NextResponse(res.body, {
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'image/jpeg',
        // Privat, weil das Bild an die Einsatz-Berechtigung gebunden ist.
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err) {
    console.error('drive thumbnail failed', err);
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
}
