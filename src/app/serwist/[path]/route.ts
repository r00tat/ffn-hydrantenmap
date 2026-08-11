import { createSerwistRoute } from '@serwist/turbopack';

// Serwist baut den Service Worker aus src/worker/index.ts mit esbuild und liefert
// ihn ueber diesen Route Handler aus (/serwist/sw.js und /serwist/sw.js.map).
// Der Handler setzt selbst `Service-Worker-Allowed: /`, damit die Registrierung
// trotz des Unterpfads den Root-Scope beanspruchen darf.
//
// globPatterns und globDirectory bleiben auf den Defaults von @serwist/turbopack
// (.next/static/** plus public/**), swSrc ist relativ zu process.cwd().
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    swSrc: 'src/worker/index.ts',
  });
