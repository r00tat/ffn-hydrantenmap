import { describe, expect, it } from 'vitest';
import { GET, HEAD, dynamic } from './route';

describe('/api/ping', () => {
  it.each([
    ['GET', GET],
    ['HEAD', HEAD],
  ])('%s antwortet mit 204 ohne Inhalt', async (_method, handler) => {
    const res = handler();
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });

  it.each([
    ['GET', GET],
    ['HEAD', HEAD],
  ])('%s darf nirgends zwischengespeichert werden', (_method, handler) => {
    const res = handler();
    expect(res.headers.get('Cache-Control')).toContain('no-store');
  });

  it('wird nie statisch vorgerendert', () => {
    // Eine vorgerenderte Antwort käme aus dem CDN-/Build-Cache und meldete
    // „erreichbar", auch wenn der Server es nicht ist.
    expect(dynamic).toBe('force-dynamic');
  });
});
