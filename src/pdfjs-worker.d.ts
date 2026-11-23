// pdfjs-dist liefert für den Worker keine Typen. Gebraucht wird er nur als
// Modulobjekt, das `globalThis.pdfjsWorker` aufnimmt (server/objektplan/driveSyncDeps.ts).
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs';
