import { createSerwistRoute } from '@serwist/turbopack';
import { serviceWorkerDefine } from '../../../server/serviceWorkerDefine';

// Serwist baut den Service Worker aus src/worker/index.ts mit esbuild und liefert
// ihn ueber diesen Route Handler aus (/serwist/sw.js und /serwist/sw.js.map).
// Der Handler setzt selbst `Service-Worker-Allowed: /`, damit die Registrierung
// trotz des Unterpfads den Root-Scope beanspruchen darf.
//
// globPatterns und globDirectory bleiben auf den Defaults von @serwist/turbopack
// (.next/static/** plus public/**), swSrc ist relativ zu process.cwd().
//
// `define` ist Pflicht, nicht Feinschliff: Dieser esbuild-Lauf steht neben der
// Next.js-Pipeline und ersetzt `process.env.NEXT_PUBLIC_*` von sich aus nicht.
// Ohne die Ersetzung landet eine `process`-Referenz im Bundle, die es im
// ServiceWorkerGlobalScope nicht gibt — das Skript stirbt beim Auswerten und
// die Registrierung scheitert (#663). esbuild setzt lediglich
// `process.env.NODE_ENV` selbst ein, abgeleitet aus `minify`.
// `globIgnores` haelt Turbopacks Worker-Bootstrap aus dem Precache. Turbopack
// uebergibt einem dedizierten `Worker` seine Konfiguration im URL-Fragment
// (`#params=…`), und ein Fragment geht nie an den Server. Beantwortet der
// Service Worker die Anfrage — und der Precache tut das, er verwirft den Hash
// beim Abgleich sogar ausdruecklich —, wird die `location` des Workers aus der
// Response-URL gesetzt, das Fragment fehlt und der Bootstrap bricht mit
// „Missing worker bootstrap config" ab. Der Hoehenmodell-Worker startet dann
// gar nicht. Die Gegenstuecke dazu stehen in src/worker/patterns.ts:
// `isWorkerBootstrap` und `runtimeCaching`.
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    swSrc: 'src/worker/index.ts',
    globIgnores: ['**/turbopack-worker-*.js'],
    esbuildOptions: { define: serviceWorkerDefine() },
  });
