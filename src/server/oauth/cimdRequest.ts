import { request as httpsRequest } from 'https';
import { lookup as dnsLookup } from 'dns/promises';
import { isIP } from 'net';
import type { LookupFunction } from 'net';
import { isBlockedAddress } from './ssrf';

/**
 * Der Abruf des Client ID Metadata Documents — mit **an die geprüfte Adresse
 * gebundener Verbindung**.
 *
 * Warum nicht `fetch`: Eine Prüfung der aufgelösten Adressen *vor* dem Aufruf
 * schließt die Lücke nicht. `fetch` löst den Namen selbst noch einmal auf, und
 * zwischen Prüfung und Verbindungsaufbau liegt ein Zeitfenster. Ein Angreifer
 * mit eigenem DNS-Server und kurzer TTL antwortet beim ersten Mal mit einer
 * öffentlichen und beim zweiten Mal mit einer internen Adresse — **DNS
 * Rebinding**. Die Prüfung hätte dann genau die Adresse gesehen, die nicht
 * verwendet wird.
 *
 * `https.request` nimmt eine eigene `lookup`-Funktion entgegen, und die
 * Verbindung geht an genau die Adresse, die diese Funktion liefert. Die Prüfung
 * findet damit *in* der Auflösung statt, die die Verbindung benutzt — es bleibt
 * kein Fenster.
 *
 * Zwei Eigenschaften kommen dazu, die `fetch` nicht so hergibt:
 *
 * - **Weiterleitungen werden gar nicht erst gefolgt.** `https.request` liefert
 *   die 3xx-Antwort zurück; ohne 200 bricht der Aufrufer ab. Eine 302 auf eine
 *   interne Adresse führte am Filter vorbei, weil er nur die erste URL sieht.
 * - **Das Größenlimit greift beim Lesen**, nicht erst am fertigen Körper: Die
 *   Verbindung wird abgebrochen, sobald die Grenze überschritten ist. Ein
 *   `content-length`-Header ist eine Behauptung des Gegenübers.
 * - **Die Frist ist absolut** und deckt Auflösung, Verbindung und Körper
 *   zusammen ab — ein Leerlauf-Timeout am Socket täte das nicht (siehe
 *   `requestCimdDocument`).
 *
 * Die TLS-Prüfung bleibt vollständig: `https.request` leitet den `servername`
 * aus dem Host der URL ab, nicht aus der Adresse.
 */

export type HostResolver = (hostname: string) => Promise<string[]>;

export interface CimdResponse {
  status: number;
  body: string;
}

export class CimdRequestError extends Error {}

export async function defaultResolveHost(hostname: string): Promise<string[]> {
  const results = await dnsLookup(hostname, { all: true, verbatim: true });
  return results.map((entry) => entry.address);
}

/**
 * Eine `lookup`-Funktion für `https.request`, die nur geprüfte Adressen
 * herausgibt.
 *
 * Es reicht nicht, die erste Adresse zu prüfen: Ein Angreifer kann mehrere
 * A-Records setzen und darauf spekulieren, dass der Verbindungsaufbau eine
 * andere wählt. Deshalb wird der gesamte Satz verworfen, sobald **eine**
 * Adresse gesperrt ist.
 */
export function createValidatingLookup(
  resolveHost: HostResolver = defaultResolveHost,
): LookupFunction {
  return ((hostname, options, callback) => {
    resolveHost(hostname)
      .then((addresses) => {
        if (addresses.length === 0) {
          throw new CimdRequestError(`could not resolve ${hostname}`);
        }
        const blocked = addresses.find((address) => isBlockedAddress(address));
        if (blocked) {
          throw new CimdRequestError(
            `${hostname} resolves to a blocked address (${blocked})`,
          );
        }
        const entries = addresses.map((address) => ({
          address,
          family: isIP(address),
        }));
        // Node ruft `lookup` je nach Verbindungsaufbau mit oder ohne `all`
        // auf (`autoSelectFamily`); beide Formen müssen bedient werden.
        if (options && typeof options === 'object' && options.all) {
          callback(null, entries as never);
          return;
        }
        callback(null, entries[0].address as never, entries[0].family);
      })
      .catch((err) => {
        callback(err as NodeJS.ErrnoException, '' as never, 0);
      });
  }) as LookupFunction;
}

export interface CimdRequestOptions {
  timeoutMs: number;
  maxBytes: number;
  resolveHost?: HostResolver;
}

export function requestCimdDocument(
  url: URL,
  { timeoutMs, maxBytes, resolveHost }: CimdRequestOptions,
): Promise<CimdResponse> {
  return new Promise<CimdResponse>((resolve, reject) => {
    let settled = false;

    /**
     * Die **absolute** Frist für den ganzen Vorgang: Auflösung, Verbindung,
     * TLS-Handshake und Körper zusammen.
     *
     * Sie ist nicht dasselbe wie die `timeout`-Option unten. Die ist ein
     * Leerlauf-Timeout am Socket und wird von jedem eintreffenden Byte
     * zurückgesetzt — ein Server, der alle vier Sekunden ein Byte schickt,
     * hält die Verbindung damit unbegrenzt offen. Und solange die
     * Namensauflösung läuft, gibt es noch gar keinen Socket, an dem sie
     * greifen könnte.
     *
     * Das ist keine Feinheit: Den Abruf löst `/api/oauth/authorize` aus, und
     * dorthin kommt man ohne Anmeldung. Ohne harte Frist bindet jeder Aufruf
     * einen Request-Handler so lange, wie der Angreifer möchte.
     */
    const deadline = setTimeout(() => {
      req.destroy(
        new CimdRequestError('client id metadata request timed out'),
      );
    }, timeoutMs);
    // Der Node-Prozess soll nicht wegen dieses Timers am Leben bleiben.
    deadline.unref?.();

    const settle = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      action();
    };

    const succeed = (response: CimdResponse) =>
      settle(() => resolve(response));

    const fail = (err: unknown) =>
      settle(() =>
        reject(
          err instanceof CimdRequestError
            ? err
            : new CimdRequestError(
                `could not fetch client id metadata: ${(err as Error).message}`,
              ),
        ),
      );

    const req = httpsRequest(
      url,
      {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'user-agent': 'Einsatzkarte MCP (client id metadata)',
        },
        lookup: createValidatingLookup(resolveHost),
        // Zusätzlich zur Frist oben: fängt eine Verbindung ab, die gar nicht
        // erst zustande kommt, ohne die volle Frist abzuwarten.
        timeout: timeoutMs,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const declared = Number(res.headers['content-length'] ?? '0');
        // Ein `content-length` ist eine Behauptung des Gegenübers — die
        // maßgebliche Grenze zieht der Zähler beim Lesen darunter. Der Header
        // spart nur das Lesen, wenn schon die Ankündigung zu groß ist.
        if (Number.isFinite(declared) && declared > maxBytes) {
          res.destroy();
          fail(new CimdRequestError('client id metadata document is too large'));
          return;
        }

        let size = 0;
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            res.destroy();
            fail(
              new CimdRequestError('client id metadata document is too large'),
            );
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () =>
          succeed({ status, body: Buffer.concat(chunks).toString('utf8') }),
        );
        res.on('error', fail);
      },
    );

    req.on('timeout', () => {
      req.destroy(
        new CimdRequestError('client id metadata request timed out'),
      );
    });
    req.on('error', fail);
    req.end();
  });
}
