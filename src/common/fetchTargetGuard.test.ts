import { describe, expect, it } from 'vitest';
import { isPublicHttpsUrl } from './fetchTargetGuard';

describe('isPublicHttpsUrl', () => {
  it('lässt einen öffentlichen Dienst zu', () => {
    expect(
      isPublicHttpsUrl(
        'https://gisenterprise.bgld.gv.at/arcgis/services/public/Orthofoto/MapServer/WMSServer?'
      )
    ).toBe(true);
    expect(isPublicHttpsUrl('https://tiles.lfrz.gv.at/wisa_hw_risiko?')).toBe(
      true
    );
  });

  it('verlangt https', () => {
    expect(isPublicHttpsUrl('http://example.org/wms')).toBe(false);
    expect(isPublicHttpsUrl('file:///etc/passwd')).toBe(false);
    expect(isPublicHttpsUrl('gopher://example.org/')).toBe(false);
  });

  it('lehnt eingebettete Zugangsdaten ab', () => {
    expect(isPublicHttpsUrl('https://user:pass@example.org/wms')).toBe(false);
  });

  it('lehnt das Metadaten-Endpoint der Cloud ab', () => {
    // Der Weg zu den Zugangsdaten der Cloud-Run-Instanz.
    expect(
      isPublicHttpsUrl('https://metadata.google.internal/computeMetadata/v1/')
    ).toBe(false);
    expect(isPublicHttpsUrl('https://169.254.169.254/latest/meta-data/')).toBe(
      false
    );
  });

  it('lehnt Loopback und private Netze ab', () => {
    for (const host of [
      'localhost',
      '127.0.0.1',
      '127.1.2.3',
      '0.0.0.0',
      '10.0.0.5',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '100.64.0.1',
      '198.18.0.1',
      '224.0.0.1',
    ]) {
      expect(isPublicHttpsUrl(`https://${host}/wms`), host).toBe(false);
    }
  });

  it('lässt öffentliche Adressen im 172er-Bereich zu', () => {
    // 172.16/12 ist privat, 172.32 nicht mehr.
    expect(isPublicHttpsUrl('https://172.32.0.1/wms')).toBe(true);
    expect(isPublicHttpsUrl('https://172.15.0.1/wms')).toBe(true);
  });

  it('lehnt interne Namensräume ab', () => {
    for (const host of [
      'gis.internal',
      'drucker.local',
      'foo.localhost',
      'router.home.arpa',
    ]) {
      expect(isPublicHttpsUrl(`https://${host}/wms`), host).toBe(false);
    }
  });

  it('lehnt einteilige Namen ab', () => {
    // Wird über die Suchdomäne des Netzes aufgelöst und zeigt nach innen.
    expect(isPublicHttpsUrl('https://intranet/wms')).toBe(false);
  });

  it('lehnt IPv6-Literale ab', () => {
    expect(isPublicHttpsUrl('https://[::1]/wms')).toBe(false);
    expect(isPublicHttpsUrl('https://[fd00::1]/wms')).toBe(false);
    expect(isPublicHttpsUrl('https://[2606:4700::1]/wms')).toBe(false);
  });

  it('lässt sich nicht über Groß-/Kleinschreibung oder einen Punkt am Ende täuschen', () => {
    expect(isPublicHttpsUrl('https://LOCALHOST/wms')).toBe(false);
    expect(isPublicHttpsUrl('https://localhost./wms')).toBe(false);
    expect(
      isPublicHttpsUrl('https://Metadata.Google.Internal/computeMetadata/v1/')
    ).toBe(false);
  });

  it('lehnt Unsinn ab', () => {
    expect(isPublicHttpsUrl('')).toBe(false);
    expect(isPublicHttpsUrl('keine url')).toBe(false);
  });
});
