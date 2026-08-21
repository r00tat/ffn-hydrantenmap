# Build und Toolchain

Warum der Typecheck über TypeScript 7 läuft, wie der Turbopack-Cache wächst und
warum der Android-Build auf JDK 21 festgenagelt ist.

## TypeScript 6 und 7 parallel

Der Typecheck läuft über **TypeScript 7** (Go-Compiler, ~1,3s statt ~8,8s), das Paket
liegt als Alias `typescript7` in den devDependencies. `npm run typecheck` ruft es über den
expliziten Pfad `node_modules/typescript7/bin/tsc` auf — nicht über `npx tsc`, weil beide
Pakete ein `tsc`-Binary mitbringen und nicht garantiert ist, welches in
`node_modules/.bin/` landet.

Das Paket `typescript` bleibt bewusst bei **6.x**, weil `typescript@7` unter `.` nur noch
`lib/version.cjs` exportiert und die Compiler-API nicht mehr mitliefert:

- `typescript-eslint` (via `eslint-config-next`) crasht damit sofort
  (`TypeError: Cannot read properties of undefined (reading 'Cjs')`). Peer-Range ist
  `>=4.8.4 <6.1.0`; TS-7-Support ist dort abgelehnt, bis die stabile API in TS 7.1 kommt.
- `next build` löst `typescript/package.json` auf und nutzt dessen `bin.tsc`, prüft also
  weiterhin mit TS 6.

**Neue i18n-Schlüssel brauchen einen frischen `tsconfig.tsbuildinfo`.** Die
Message-Typen kommen über `src/global.d.ts` aus `messages/de.json`; TS 7
invalidiert seinen inkrementellen Cache bei einer Änderung an der JSON aber
nicht. `npm run typecheck` meldet den eben ergänzten Schlüssel dann weiter als
„not assignable to parameter of type NamespacedMessageKeys". Abhilfe:

```bash
rm -f tsconfig.tsbuildinfo && npm run typecheck
```

Sobald typescript-eslint auf der TS-7.1-API aufsetzt: `typescript` auf `^7` ziehen und den
`typescript7`-Alias samt `typecheck`-Pfad entfernen.

## Turbopack-Cache

Turbopack cacht auf Platte, getrennt nach Modus: `next dev` in `.next/dev/cache/turbopack`,
`next build` in `.next/cache/turbopack`. Beides ist seit 16.3 standardmäßig an und bringt
die Startup- und Memory-Gewinne von 16.3 überhaupt erst.

**Der Cache wird nie kompaktiert.** Gemessen an diesem Projekt wachsen pro Build ~3,7 MB
und 5 `.sst`-Dateien dazu (424 → 435 MB über vier Builds), es gibt keine
Größenbegrenzung, kein GC und kein Max-Age. Dazu ist das Verzeichnis an die Next-Version
gebunden (`v16.3.0-<hash>`) — ein Update legt ein neues an und lässt das alte liegen. Über
Monate summiert sich das auf Gigabyte. Bei Bedarf:

```bash
npm run clean:cache   # rm -rf .next/cache/turbopack .next/dev/cache/turbopack
```

Deshalb löscht `npm run dev` **nicht** mehr das ganze `.next` (vorher `rm -rf .next` vor
und nach dem Start) — das warf genau diesen Cache jedes Mal weg. Unter Next 16 ist das
unbedenklich, weil der Dev-Output unter `.next/dev/` liegt und die Prod-Artefakte
(`.next/server`, `.next/static`, Manifeste) unberührt bleiben: `next start` funktioniert
nach einer Dev-Session weiterhin.

Im **Docker-Build** ist der Build-Cache abgeschaltet (`DISABLE_TURBOPACK_BUILD_CACHE=1` im
Dockerfile, ausgewertet über `turbopackFileSystemCacheForBuild` in `next.config.js`): Die
Builder-Stage startet aus einer frischen Layer und nach unten kopiert werden nur
`.next/standalone` und `.next/static` — der Cache wäre ~430 MB, die geschrieben und nie
gelesen werden.

## Android-Build (Capacitor)

Der native Android-Build läuft im Verzeichnis `capacitor/android/` über Gradle. Aktuell: **AGP 8.13.0**, **Gradle 8.14.3**.

**Wichtig: Build-JDK muss JDK 21 sein.** AGP 8.x unterstützt JDK 26 nicht — ein Build mit JDK 26 schlägt mit `JdkImageTransform`-Fehler beim Transformieren von `core-for-system-modules.jar` fehl.

```bash
cd capacitor/android
JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew :app:assembleDebug
```

Bei Aufrufen aus Tools (z.B. Capacitor Sync, Android Studio) muss `JAVA_HOME` ebenfalls auf JDK 21 zeigen. Wenn AGP/Gradle/Kotlin später aktualisiert werden, ist die JDK-Pinning-Anforderung in einem separaten Branch zu prüfen.
