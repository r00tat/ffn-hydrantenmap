import 'server-only';

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import {
  calculateAufenthaltszeit,
  calculateDosisleistungNuklid,
  calculateInverseSquareLaw,
  calculateSchutzwert,
  NUCLIDES,
} from '../../common/strahlenschutz';
import {
  computeFoerderung,
  type FoerderungProfilePoint,
} from '../../components/FirecallItems/elements/connection/foerderung/hydraulics';
import { FOERDERUNG_DEFAULTS } from '../../components/FirecallItems/elements/connection/foerderung/defaults';
import { frictionLossPer100m } from '../../components/FirecallItems/elements/connection/foerderung/frictionLoss';
import { computeShuttle } from '../../components/FirecallItems/elements/connection/pendel/shuttle';
import { PENDEL_DEFAULTS } from '../../components/FirecallItems/elements/connection/pendel/defaults';
import {
  DAMM_BAUWEISEN,
  DAMM_DEFAULTS,
  SACK_FORMATE,
  SACK_FORMAT_KEYS,
  sandsackBedarf,
  type DammBauweise,
  type DammVorgabe,
} from '../../components/FirecallItems/elements/damm/sandsackBedarf';
import { errorResult, jsonResult } from './toolResult';

/**
 * Rechner-Tools (Scope `berechnung`).
 *
 * Reine Funktionen aus dem Bestand, ohne jeden Datenzugriff: dieselbe
 * Fachlogik, die die Karte hinter Leitung und Dammlinie rechnet — Herkunft der
 * Tabellenwerte in `docs/loeschwasserfoerderung.md`, `docs/pendelverkehr.md`
 * und `docs/dammbau-sandsaecke.md`. Sie brauchen keine Berechtigung auf einen
 * Einsatz, weil sie keine Einsatzdaten sehen.
 */
export function registerCalculationTools(server: McpServer): void {
  server.registerTool(
    'calc_loeschwasserfoerderung',
    {
      title: 'Löschwasserförderung berechnen',
      description:
        'Pumpenbedarf einer Zubringleitung über Strecke und Höhenunterschied: ' +
        'Reibungs- und Höhenverlust, Anzahl der Verstärkerpumpen und ihre Standorte. ' +
        'Die Reibungstabelle gilt für B 75; andere Dimensionen werden daraus abgeleitet.',
      inputSchema: z.object({
        laenge: z.number().positive().describe('Leitungslänge in Metern'),
        hoehenunterschied: z
          .number()
          .default(0)
          .describe('Höhenunterschied Entnahme → Ziel in m, positiv bergauf'),
        foerderMenge: z
          .number()
          .positive()
          .default(FOERDERUNG_DEFAULTS.foerderMenge)
          .describe('Fördermenge in l/min'),
        dimension: z
          .string()
          .default('B')
          .describe('Schlauchdimension, z.B. "B" (75 mm) oder "C" (52 mm)'),
        zielDruck: z.number().default(FOERDERUNG_DEFAULTS.zielDruck),
        pumpenAusgangsdruck: z
          .number()
          .default(FOERDERUNG_DEFAULTS.pumpenAusgangsdruck),
        pumpenEingangsdruck: z
          .number()
          .default(FOERDERUNG_DEFAULTS.pumpenEingangsdruck),
        paralleleLeitungen: z.number().int().min(1).default(1),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({
      laenge,
      hoehenunterschied,
      foerderMenge,
      dimension,
      zielDruck,
      pumpenAusgangsdruck,
      pumpenEingangsdruck,
      paralleleLeitungen,
    }) => {
      // Bei parallelen Leitungen teilt sich die Menge — die Reibung richtet
      // sich nach dem, was durch eine Leitung fließt.
      const flowProLeitung = foerderMenge / paralleleLeitungen;
      const per100m = frictionLossPer100m(flowProLeitung, dimension);
      if (per100m === undefined) {
        return errorResult(
          `Für die Dimension "${dimension}" ist kein Innendurchmesser hinterlegt — hier wird nicht geraten.`,
        );
      }

      const profile: FoerderungProfilePoint[] = [
        { distance: 0, elevation: 0 },
        { distance: laenge, elevation: hoehenunterschied },
      ];
      const result = computeFoerderung({
        profile,
        frictionBarPerMeter: per100m / 100,
        ausgangsdruck: pumpenAusgangsdruck,
        eingangsdruck: pumpenEingangsdruck,
        zieldruck: zielDruck,
      });

      return jsonResult({
        eingaben: {
          laenge,
          hoehenunterschied,
          foerderMenge,
          dimension,
          paralleleLeitungen,
          reibungsverlustBarJe100m: Number(per100m.toFixed(3)),
        },
        ergebnis: result,
        hinweis: result.darstellbar
          ? undefined
          : 'Mit diesen Vorgaben ist die Förderung nicht darstellbar — Menge verringern, Dimension vergrößern oder parallele Leitungen legen.',
      });
    },
  );

  server.registerTool(
    'calc_pendelverkehr',
    {
      title: 'Pendelverkehr berechnen',
      description:
        'Wasserversorgung im Pendelverkehr: Umlaufzeit, dauerhaft lieferbare Menge, ' +
        'nötige Fahrzeugzahl und der Kipppunkt der Fahrstrecke. Ohne Ergiebigkeit der ' +
        'Entnahmestelle wird nicht gerechnet — sie wird nicht geraten.',
      inputSchema: z.object({
        strecke: z
          .number()
          .positive()
          .describe('Einfache Fahrstrecke Entnahme → Einsatzstelle in m'),
        fuellleistung: z
          .number()
          .positive()
          .describe('Ergiebigkeit der Entnahmestelle in l/min'),
        sollMenge: z
          .number()
          .positive()
          .describe('Geforderte Menge an der Einsatzstelle in l/min'),
        fahrzeuge: z.number().int().min(1).default(PENDEL_DEFAULTS.fahrzeuge),
        tankinhalt: z
          .number()
          .positive()
          .default(PENDEL_DEFAULTS.tankinhalt)
          .describe('Tankinhalt je Fahrzeug in l'),
        geschwindigkeit: z
          .number()
          .positive()
          .default(PENDEL_DEFAULTS.geschwindigkeit)
          .describe('Durchschnittsgeschwindigkeit in km/h'),
        rangierzeit: z.number().min(0).default(PENDEL_DEFAULTS.rangierzeit),
        entleerzeit: z.number().min(0).default(PENDEL_DEFAULTS.entleerzeit),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (input) => {
      const result = computeShuttle(input);
      if (!result) {
        return errorResult(
          'Mit diesen Eingaben lässt sich der Pendelverkehr nicht rechnen — Geschwindigkeit, Tankinhalt und Entleerzeit müssen größer als null sein.',
        );
      }
      return jsonResult({ eingaben: input, ergebnis: result });
    },
  );

  server.registerTool(
    'calc_sandsackbedarf',
    {
      title: 'Sandsackbedarf berechnen',
      description:
        'Sandsackbedarf für einen Dammabschnitt nach der Lehrunterlage LU TE3: Säcke, ' +
        'Sandmenge, Paletten, LKW-Fuhren, Personenstunden und Bauzeit. Entweder Kräfte ' +
        'vorgeben (dann kommt die Bauzeit heraus) oder eine Zielzeit (dann die Kräfte).',
      inputSchema: z.object({
        laenge: z.number().positive().describe('Dammlänge in m'),
        hoehe: z
          .number()
          .positive()
          .default(DAMM_DEFAULTS.dammHoehe)
          .describe('Dammhöhe in m'),
        bauweise: z
          .enum(DAMM_BAUWEISEN as [DammBauweise, ...DammBauweise[]])
          .default(DAMM_DEFAULTS.dammBauweise),
        format: z
          .enum(SACK_FORMAT_KEYS as [string, ...string[]])
          .default(DAMM_DEFAULTS.sackFormat)
          .describe('Sackformat, z.B. "30x60"'),
        fuellgrad: z.number().min(1).max(100).default(DAMM_DEFAULTS.sackFuellgrad),
        sandDichte: z.number().positive().default(DAMM_DEFAULTS.sandDichte),
        reserve: z.number().min(0).max(100).default(DAMM_DEFAULTS.dammReserve),
        vorgabe: z
          .enum(['personal', 'zeit'])
          .default(DAMM_DEFAULTS.dammVorgabe)
          .describe('Was vorgegeben ist — das jeweils andere wird gerechnet'),
        personal: z.number().int().min(1).default(DAMM_DEFAULTS.dammPersonal),
        zielzeit: z.number().positive().default(DAMM_DEFAULTS.dammZielzeit),
        trichter: z.boolean().default(DAMM_DEFAULTS.fuellTrichter),
        roedeln: z.boolean().default(DAMM_DEFAULTS.saeckeRoedeln),
        transportWeite: z.number().positive().default(DAMM_DEFAULTS.transportWeite),
        lkwNutzlast: z.number().positive().default(DAMM_DEFAULTS.lkwNutzlast),
        freibord: z.number().min(0).default(DAMM_DEFAULTS.freibord),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (input) => {
      const format = SACK_FORMATE[input.format];
      if (!format) {
        return errorResult(
          `Unbekanntes Sackformat "${input.format}". Bekannt sind: ${SACK_FORMAT_KEYS.join(', ')}.`,
        );
      }
      const result = sandsackBedarf({
        ...input,
        bauweise: input.bauweise as DammBauweise,
        vorgabe: input.vorgabe as DammVorgabe,
        format,
      });
      return jsonResult({ eingaben: input, ergebnis: result });
    },
  );

  server.registerTool(
    'strahlenschutz_abstand',
    {
      title: 'Strahlenschutz: Abstandsgesetz',
      description:
        'Abstandsgesetz r₁²·d₁ = r₂²·d₂. Genau drei der vier Werte angeben, der vierte ' +
        'wird gerechnet. Abstände in m, Dosisleistungen in µSv/h.',
      inputSchema: z.object({
        d1: z.number().nullable().optional().describe('Abstand 1 in m'),
        r1: z.number().nullable().optional().describe('Dosisleistung 1 in µSv/h'),
        d2: z.number().nullable().optional().describe('Abstand 2 in m'),
        r2: z.number().nullable().optional().describe('Dosisleistung 2 in µSv/h'),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ d1, r1, d2, r2 }) => {
      const result = calculateInverseSquareLaw({
        d1: d1 ?? null,
        r1: r1 ?? null,
        d2: d2 ?? null,
        r2: r2 ?? null,
      });
      if (!result) {
        return errorResult(
          'Ungültige Parameter — genau drei der vier Werte müssen gesetzt und größer als null sein.',
        );
      }
      return jsonResult({
        feld: result.field,
        wert: result.value,
        einheit: result.field.startsWith('d') ? 'm' : 'µSv/h',
      });
    },
  );

  server.registerTool(
    'strahlenschutz_schutzwert',
    {
      title: 'Strahlenschutz: Schutzwert',
      description:
        'Abschirmung über den Schutzwert S und die Anzahl der Schichten n. Genau drei ' +
        'der vier Werte angeben.',
      inputSchema: z.object({
        r0: z.number().nullable().optional().describe('Dosisleistung ohne Abschirmung in µSv/h'),
        r: z.number().nullable().optional().describe('Dosisleistung mit Abschirmung in µSv/h'),
        s: z.number().nullable().optional().describe('Schutzwert S'),
        n: z.number().nullable().optional().describe('Anzahl Schichten'),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ r0, r, s, n }) => {
      const result = calculateSchutzwert({
        r0: r0 ?? null,
        r: r ?? null,
        s: s ?? null,
        n: n ?? null,
      });
      if (!result) {
        return errorResult('Ungültige Parameter für den Schutzwert.');
      }
      return jsonResult({
        feld: result.field,
        wert: result.value,
        einheit: result.field.startsWith('r') ? 'µSv/h' : '',
      });
    },
  );

  server.registerTool(
    'strahlenschutz_aufenthaltszeit',
    {
      title: 'Strahlenschutz: Aufenthaltszeit',
      description:
        'Zusammenhang aus zulässiger Dosis, Dosisleistung und Aufenthaltszeit. Genau zwei ' +
        'der drei Werte angeben. Dosis in mSv, Dosisleistung in mSv/h, Zeit in h.',
      inputSchema: z.object({
        t: z.number().nullable().optional().describe('Aufenthaltszeit in h'),
        d: z.number().nullable().optional().describe('Zulässige Dosis in mSv'),
        r: z.number().nullable().optional().describe('Dosisleistung in mSv/h'),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ t, d, r }) => {
      const result = calculateAufenthaltszeit({
        t: t ?? null,
        d: d ?? null,
        r: r ?? null,
      });
      if (!result) {
        return errorResult('Ungültige Parameter für die Aufenthaltszeit.');
      }
      return jsonResult({
        feld: result.field,
        wert: result.value,
        einheit:
          result.field === 't' ? 'h' : result.field === 'd' ? 'mSv' : 'mSv/h',
      });
    },
  );

  server.registerTool(
    'strahlenschutz_nuklid',
    {
      title: 'Strahlenschutz: Nuklid',
      description:
        'Dosisleistung in 1 m aus der Aktivität eines Nuklids, oder umgekehrt. Genau einen ' +
        'der beiden Werte angeben.',
      inputSchema: z.object({
        nuclide: z
          .string()
          .describe(`Nuklid, z.B. ${NUCLIDES.slice(0, 3).map((n) => n.name).join(', ')}`),
        activity: z.number().nullable().optional().describe('Aktivität in GBq'),
        doseRate: z
          .number()
          .nullable()
          .optional()
          .describe('Dosisleistung in 1 m in µSv/h'),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ nuclide, activity, doseRate }) => {
      const found = NUCLIDES.find(
        (entry) => entry.name.toLowerCase() === nuclide.toLowerCase(),
      );
      if (!found) {
        return errorResult(
          `Nuklid "${nuclide}" nicht gefunden. Bekannt sind: ${NUCLIDES.map((n) => n.name).join(', ')}.`,
        );
      }
      const result = calculateDosisleistungNuklid(found.gamma, {
        activity: activity ?? null,
        doseRate: doseRate ?? null,
      });
      if (!result) {
        return errorResult('Ungültige Parameter für die Nuklid-Berechnung.');
      }
      return jsonResult({
        nuklid: found.name,
        feld: result.field,
        wert: result.value,
        einheit: result.field === 'activity' ? 'GBq' : 'µSv/h',
      });
    },
  );
}
