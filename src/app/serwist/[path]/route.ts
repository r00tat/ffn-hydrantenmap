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
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    swSrc: 'src/worker/index.ts',
    esbuildOptions: { define: serviceWorkerDefine() },
  });
