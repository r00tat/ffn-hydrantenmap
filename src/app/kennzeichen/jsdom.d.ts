// Minimal ambient type declaration for `jsdom`.
//
// The `jsdom` package ships without bundled TypeScript types and
// `@types/jsdom` is not installed. This declares only the surface used by
// `parseVehicleData.ts` (`new JSDOM(html).window.document`). If
// `@types/jsdom` is added as a devDependency later, this file can be removed.
declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string);
    readonly window: {
      readonly document: Document;
    };
  }
}
