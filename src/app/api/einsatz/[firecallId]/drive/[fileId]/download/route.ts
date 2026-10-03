import { NextRequest, NextResponse } from 'next/server';
import { driveAccessToken } from '../../../../../../../server/auth/driveAuth';
import { driveClient } from '../../../../../../../server/drive/driveClient';
import { actionUserAuthorizedForFirecall } from '../../../../../../auth';

/**
 * `Content-Disposition` mit dem Originalnamen. `filename*` trägt Umlaute,
 * `filename` ist der ASCII-Rückfall für ältere Clients.
 */
function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * Eine Drive-Datei des Einsatzes in voller Größe herunterladen — für die
 * Sybos-Seite, von der die Fotos in den Einsatzbericht hochgeladen werden.
 *
 * Wie beim Vorschaubild über den Server: Die `webViewLink` öffnet nur, wer im
 * Shared Drive Mitglied ist, unsere Nutzer sind aber in der App angemeldet.
 * Gestreamt statt gepuffert, ein Video kann einige hundert MB haben.
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
      fields: 'id,name,mimeType,parents,trashed',
      supportsAllDrives: true,
    });

    // Dieselbe Prüfung wie beim Vorschaubild: Ohne sie wäre der Handler ein
    // Download-Proxy auf das gesamte Shared Drive.
    if (file.data.trashed || !file.data.parents?.includes(firecall.driveFolderId)) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    // Google-Dokumente haben keinen Inhalt für `alt=media`, nur einen Export.
    if (file.data.mimeType?.startsWith('application/vnd.google-apps.')) {
      return NextResponse.json({ error: 'not downloadable' }, { status: 415 });
    }

    const token = await driveAccessToken();
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok || !res.body) {
      return NextResponse.json({ error: 'download failed' }, { status: 502 });
    }

    const headers: Record<string, string> = {
      'Content-Type':
        file.data.mimeType || res.headers.get('content-type') || 'application/octet-stream',
      'Content-Disposition': contentDisposition(file.data.name || fileId),
      'Cache-Control': 'private, no-store',
    };
    const length = res.headers.get('content-length');
    if (length) headers['Content-Length'] = length;

    return new NextResponse(res.body, { headers });
  } catch (err) {
    console.error('drive download failed', err);
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
}
