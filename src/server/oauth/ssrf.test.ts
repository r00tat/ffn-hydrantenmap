import { describe, expect, it } from 'vitest';
import { isBlockedAddress, isBlockedHostname } from './ssrf';

describe('isBlockedAddress', () => {
  it('sperrt den Metadaten-Server', () => {
    expect(isBlockedAddress('169.254.169.254')).toBe(true);
  });

  it('sperrt Loopback und private Bereiche', () => {
    expect(isBlockedAddress('127.0.0.1')).toBe(true);
    expect(isBlockedAddress('10.1.2.3')).toBe(true);
    expect(isBlockedAddress('172.16.0.1')).toBe(true);
    expect(isBlockedAddress('172.31.255.255')).toBe(true);
    expect(isBlockedAddress('192.168.1.1')).toBe(true);
    expect(isBlockedAddress('100.64.0.1')).toBe(true);
    expect(isBlockedAddress('0.0.0.0')).toBe(true);
    expect(isBlockedAddress('255.255.255.255')).toBe(true);
  });

  it('lässt öffentliche Adressen durch', () => {
    expect(isBlockedAddress('8.8.8.8')).toBe(false);
    expect(isBlockedAddress('172.32.0.1')).toBe(false);
    expect(isBlockedAddress('1.1.1.1')).toBe(false);
  });

  it('sperrt IPv6-Loopback, ULA, Link-local und Multicast', () => {
    expect(isBlockedAddress('::1')).toBe(true);
    expect(isBlockedAddress('fd00::1')).toBe(true);
    expect(isBlockedAddress('fe80::1')).toBe(true);
    expect(isBlockedAddress('ff02::1')).toBe(true);
  });

  it('sperrt IPv4-mapped Loopback', () => {
    expect(isBlockedAddress('::ffff:127.0.0.1')).toBe(true);
  });

  it('lässt öffentliches IPv6 durch', () => {
    expect(isBlockedAddress('2606:4700:4700::1111')).toBe(false);
  });

  it('sperrt alles, was keine IP ist', () => {
    expect(isBlockedAddress('example.com')).toBe(true);
  });
});

describe('isBlockedHostname', () => {
  it('sperrt localhost und interne Suffixe', () => {
    expect(isBlockedHostname('localhost')).toBe(true);
    expect(isBlockedHostname('foo.localhost')).toBe(true);
    expect(isBlockedHostname('metadata.google.internal')).toBe(true);
    expect(isBlockedHostname('db.internal')).toBe(true);
    expect(isBlockedHostname('nas.local')).toBe(true);
  });

  it('sperrt IP-Literale aus gesperrten Bereichen', () => {
    expect(isBlockedHostname('169.254.169.254')).toBe(true);
    expect(isBlockedHostname('[::1]')).toBe(true);
  });

  it('lässt normale Namen durch', () => {
    expect(isBlockedHostname('claude.ai')).toBe(false);
    expect(isBlockedHostname('example.com.')).toBe(false);
  });
});
