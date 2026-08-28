import { describe, expect, it } from 'vitest';
import { isPublicHttpsUrl } from './fetchTargetGuard';
import {
  KNOWN_WMS_SERVICES,
  knownWmsServiceByUrl,
} from './knownWmsServices';
import { capabilitiesUrl } from './wmsCapabilities';

describe('KNOWN_WMS_SERVICES', () => {
  it('vergibt eindeutige Schlüssel', () => {
    const ids = KNOWN_WMS_SERVICES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('führt nur Adressen, die der Server auch abrufen darf', () => {
    // Ein hier eingetragenes `http://` oder ein Name im eigenen Netz würde von
    // `loadWmsCapabilities` wortlos abgewiesen — die Auswahl täte dann nichts.
    KNOWN_WMS_SERVICES.forEach((service) => {
      expect(
        isPublicHttpsUrl(service.capabilitiesUrl),
        `${service.id}: ${service.capabilitiesUrl}`
      ).toBe(true);
    });
  });

  it('führt Adressen, aus denen sich eine Capabilities-Anfrage bauen lässt', () => {
    KNOWN_WMS_SERVICES.forEach((service) => {
      const url = capabilitiesUrl(service.capabilitiesUrl);
      expect(url).toContain('REQUEST=GetCapabilities');
      expect(url).toContain('SERVICE=WMS');
    });
  });

  it('gibt jedem Dienst einen Namen und eine Beschreibung', () => {
    KNOWN_WMS_SERVICES.forEach((service) => {
      expect(service.name.trim()).not.toBe('');
      expect(service.beschreibung.trim()).not.toBe('');
    });
  });
});

describe('knownWmsServiceByUrl', () => {
  it('erkennt einen bekannten Dienst wieder', () => {
    const [service] = KNOWN_WMS_SERVICES;
    expect(knownWmsServiceByUrl(service.capabilitiesUrl)?.id).toBe(service.id);
    expect(knownWmsServiceByUrl(` ${service.capabilitiesUrl} `)?.id).toBe(
      service.id
    );
  });

  it('kennt eine fremde oder leere Adresse nicht', () => {
    expect(knownWmsServiceByUrl('https://fremd.example.at/wms?')).toBeUndefined();
    expect(knownWmsServiceByUrl('')).toBeUndefined();
    expect(knownWmsServiceByUrl(undefined)).toBeUndefined();
  });
});
