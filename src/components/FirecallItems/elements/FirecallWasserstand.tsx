import { Icon, IconOptions } from 'leaflet';
import { ReactNode } from 'react';
import {
  WASSERSTAND_DEFAULTS,
  wasserstandLevelM,
  wasserstandStale,
} from '../../../common/terrain/wasserstand';
import { SimpleMap } from '../../../common/types';
import { FirecallItem, Wasserstand } from '../../firebase/firestore';
import { leafletIcons } from '../icons';
import { FirecallItemBase } from './FirecallItemBase';
import { MarkerRenderOptions } from './marker/FirecallItemDefault';
import WasserstandComponent from './wasserstand/WasserstandComponent';

/**
 * Eine Wasserausbreitung auf der Karte.
 *
 * Sichtbar heißt das Element **Wasserausbreitung** und nicht „Wasserstand":
 * gesucht ist die überflutete Fläche, der Wasserstand ist nur die Eingabe
 * dahin. Der Item-Typ, die Feldnamen und der Übersetzungs-Namensraum bleiben
 * `wasserstand` — sie stehen in gespeicherten Dokumenten.
 *
 * Punkt-Element wie `assp` — der Punkt ist Saatpunkt **und** Höhenbezug. Die
 * Fläche kommt aus den gespeicherten Ringen und nicht aus einer Rechnung beim
 * Zeichnen: gerechnet wird einmal, im Rechner.
 */
export class FirecallWasserstand extends FirecallItemBase {
  wasserZuschlag?: number;
  wasserRadius?: number;
  wasserBasisHoehe?: number;
  wasserBasisStufe?: string;
  wasserBaender?: string;
  wasserStufe?: string;
  wasserFlaecheM2?: number;
  wasserMaxTiefe?: number;
  wasserLaengsteAchse?: number;
  wasserGerechnetAm?: string;
  wasserGerechnetFuer?: string;
  wasserAbbruch?: string;
  wasserKachelnFehlend?: number;
  wasserRandModell?: number;
  wasserVereinfachungM?: number;
  wasserInselnVerworfen?: number;
  color?: string;
  opacity?: number;

  public constructor(firecallItem?: Wasserstand) {
    super(firecallItem);
    this.type = 'wasserstand';
    ({
      wasserZuschlag: this.wasserZuschlag = WASSERSTAND_DEFAULTS.zuschlag,
      wasserRadius: this.wasserRadius = WASSERSTAND_DEFAULTS.radiusM,
      wasserBasisHoehe: this.wasserBasisHoehe,
      wasserBasisStufe: this.wasserBasisStufe,
      wasserBaender: this.wasserBaender,
      wasserStufe: this.wasserStufe,
      wasserFlaecheM2: this.wasserFlaecheM2,
      wasserMaxTiefe: this.wasserMaxTiefe,
      wasserLaengsteAchse: this.wasserLaengsteAchse,
      wasserGerechnetAm: this.wasserGerechnetAm,
      wasserGerechnetFuer: this.wasserGerechnetFuer,
      wasserAbbruch: this.wasserAbbruch,
      wasserKachelnFehlend: this.wasserKachelnFehlend,
      wasserRandModell: this.wasserRandModell,
      wasserVereinfachungM: this.wasserVereinfachungM,
      wasserInselnVerworfen: this.wasserInselnVerworfen,
      color: this.color = WASSERSTAND_DEFAULTS.farbe,
      opacity: this.opacity = WASSERSTAND_DEFAULTS.deckkraft,
    } = firecallItem || {});
  }

  public copy(): FirecallWasserstand {
    return Object.assign(new FirecallWasserstand(this.data()), this);
  }

  public data(): Wasserstand {
    return {
      ...super.data(),
      wasserZuschlag: this.wasserZuschlag,
      wasserRadius: this.wasserRadius,
      wasserBasisHoehe: this.wasserBasisHoehe,
      wasserBasisStufe: this.wasserBasisStufe,
      wasserBaender: this.wasserBaender,
      wasserStufe: this.wasserStufe,
      wasserFlaecheM2: this.wasserFlaecheM2,
      wasserMaxTiefe: this.wasserMaxTiefe,
      wasserLaengsteAchse: this.wasserLaengsteAchse,
      wasserGerechnetAm: this.wasserGerechnetAm,
      wasserGerechnetFuer: this.wasserGerechnetFuer,
      wasserAbbruch: this.wasserAbbruch,
      wasserKachelnFehlend: this.wasserKachelnFehlend,
      wasserRandModell: this.wasserRandModell,
      wasserVereinfachungM: this.wasserVereinfachungM,
      wasserInselnVerworfen: this.wasserInselnVerworfen,
      color: this.color,
      opacity: this.opacity,
    } as Wasserstand;
  }

  public markerName(): string {
    return 'Wasserausbreitung';
  }

  public fields(): SimpleMap<string> {
    return {
      ...super.fields(),
      wasserZuschlag: 'Zuschlag über Basishöhe (m)',
      wasserRadius: 'Umkreis der Berechnung (m, 0 = unbegrenzt)',
      color: 'Farbe (HTML bzw. Englisch)',
      opacity: 'Deckkraft (in Prozent)',
    };
  }

  public fieldTypes(): SimpleMap<string> {
    return {
      ...super.fieldTypes(),
      wasserZuschlag: 'number',
      wasserRadius: 'number',
      opacity: 'number',
      color: 'color',
    };
  }

  public info(): string {
    const level = wasserstandLevelM(this.data());
    const area = this.wasserFlaecheM2;
    return [
      level !== undefined ? `Wasserstand ${level.toFixed(2)} m` : undefined,
      area !== undefined ? `${(area / 10000).toFixed(1)} ha` : undefined,
      wasserstandStale(this.data()) ? 'Ergebnis veraltet' : undefined,
    ]
      .filter(Boolean)
      .join(' · ');
  }

  public dialogText(): ReactNode {
    return <>Wasserausbreitung {this.name}</>;
  }

  public titleFn(): string {
    return `Wasserausbreitung ${this.name}\n${this.info()}`;
  }

  public icon(): Icon<IconOptions> {
    return leafletIcons().wasserstand;
  }

  public static factory(): FirecallItemBase {
    return new FirecallWasserstand();
  }

  public renderMarker(
    selectItem: (item: FirecallItem) => void,
    options: MarkerRenderOptions = {}
  ): ReactNode {
    return (
      <WasserstandComponent
        record={this}
        selectItem={selectItem}
        key={this.id}
        pane={options.pane}
      />
    );
  }
}
