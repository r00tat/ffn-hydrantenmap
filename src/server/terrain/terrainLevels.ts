import { NODATA_ENCODED } from '../../common/terrain/encoding';
import type { LaeaBounds } from '../../common/terrain/grid';
import type {
  TerrainLevel,
  TerrainLevelId,
  TerrainSourceInfo,
} from '../../common/terrain/terrainIndexTypes';
import { BEV_EPOCH } from './bevSource';

/**
 * Die beiden Stufen des Höhenmodells und ihre Kodierung.
 *
 * Die Werte stehen hier **und im ausgelieferten Index**, damit ein Wechsel der
 * Präzision eine reine Neuerzeugung der Kacheln bleibt: der Client liest
 * `base`, `step` und `nodataValue` aus dem Index und rechnet ohne Änderung
 * weiter.
 *
 * `detail` bei 1 m, weil erst diese Auflösung Dämme, Straßendämme und Mauern
 * auflöst — die Objekte, die im Wasserstandsmodell über den Wasserweg
 * entscheiden. `overview` bei 10 m ist mit etwa 20 MiB landesweit offlinefähig
 * und schlägt für Höhenprofile das bisherige EU-DEM 25 m deutlich.
 *
 * **Beide Stufen mit 10 cm Schrittweite.** Für `detail` waren zunächst 5 cm
 * vorgesehen; die Quelle rechtfertigt das nicht. Das BEV gibt für das ALS-DGM
 * eine Höhengenauigkeit von ±10 cm an — eine feinere Stufung kodiert Rauschen,
 * kostet aber echten Platz, weil die PNG-Entropie mit der Zahl der
 * unterschiedlichen Werte je Kachel wächst. Gemessen an zwei Blöcken im
 * bewegten Südburgenland (108 bzw. 148 m Relief je km²):
 *
 * | Block | 5 cm | 10 cm |
 * | --- | --- | --- |
 * | N2653000E4778000 | 848 KiB | 566 KiB |
 * | N2653000E4779000 | 493 KiB | 324 KiB |
 *
 * Also ein Drittel weniger, bei unveränderten Höhen: dieselben Minima und
 * Maxima auf die Schrittweite gerundet, dieselbe Nodata-Fläche. Landesweit
 * bleibt es eine Schätzung, solange nicht alle 4.385 Blöcke gebaut sind —
 * zwischen 0,2 MiB je km² im flachen Seewinkel und 0,55 MiB im Hügelland
 * liegen grob 1,5 GiB.
 */


export const TERRAIN_SOURCE: TerrainSourceInfo = {
  name: 'BEV ALS-DGM 1 m',
  epoch: BEV_EPOCH,
  license: 'CC BY 4.0',
  attribution:
    'Datenquelle: Bundesamt für Eich- und Vermessungswesen (BEV)',
};

export interface LevelSpec {
  id: TerrainLevelId;
  resolutionM: number;
  blockPx: number;
  base: number;
  step: number;
  /** Faktor der Dezimierung aus der Detailstufe. 1 = keine. */
  decimateFactor: number;
}

export const LEVEL_SPECS: readonly LevelSpec[] = [
  {
    id: 'detail',
    resolutionM: 1,
    blockPx: 1000,
    base: 0,
    step: 0.1,
    decimateFactor: 1,
  },
  {
    id: 'overview',
    resolutionM: 10,
    blockPx: 1000,
    base: 0,
    step: 0.1,
    decimateFactor: 10,
  },
];

export const levelSpec = (id: TerrainLevelId): LevelSpec => {
  const spec = LEVEL_SPECS.find((candidate) => candidate.id === id);
  if (!spec) throw new Error(`Unbekannte Stufe: ${id}`);
  return spec;
};

export const blockSizeM = (spec: LevelSpec): number =>
  spec.resolutionM * spec.blockPx;

export const levelPathTemplate = (spec: LevelSpec): string =>
  `${spec.id}/CRS3035RES${blockSizeM(spec)}mN{n}E{e}.png`;

export const toTerrainLevel = (
  spec: LevelSpec,
  bounds: LaeaBounds,
  availability: TerrainLevel['availability']
): TerrainLevel => ({
  id: spec.id,
  resolutionM: spec.resolutionM,
  blockPx: spec.blockPx,
  blockSizeM: blockSizeM(spec),
  base: spec.base,
  step: spec.step,
  nodataValue: NODATA_ENCODED,
  pathTemplate: levelPathTemplate(spec),
  bounds,
  availability,
});
