import L, { Icon, IconOptions } from 'leaflet';
import { ReactNode } from 'react';
import { vehicleIconDataUrl } from '../../../common/markerSvg';
import { formatTimestamp } from '../../../common/time-format';
import {
  einsatzmittelKategorie,
  EinsatzmittelKategorie,
  EINSATZMITTEL_KATEGORIE_LABELS,
  formatBesatzung,
  getEffectiveAts,
  getEffectiveBesatzung,
  isFremdesFahrzeug,
  vehicleMarkerColor,
} from '../../../common/vehicle-utils';
import { SimpleMap } from '../../../common/types';
import { Fzg } from '../../firebase/firestore';
import VehicleCrewPopup from '../VehicleCrewPopup';
import { FirecallItemBase, SelectOptions } from './FirecallItemBase';

export class FirecallVehicle extends FirecallItemBase {
  fw?: string;
  kategorie?: EinsatzmittelKategorie;
  besatzung?: string;
  ats?: number;
  alarmierung?: string;
  eintreffen?: string;
  abruecken?: string;
  /** Fahrzeug einer fremden Organisation — `'true'`/`'false'` wie jedes Schaltfeld. */
  fremd?: string;
  /** Farbe des Balkens; ohne Angabe gilt die Vorgabe nach Zugehörigkeit. */
  color?: string;
  /** Anzahl der zugeordneten Personen (nicht persistiert) */
  crewCount?: number;
  /** Anzahl der zugeordneten Atemschutzträger (nicht persistiert) */
  atsCount?: number;

  public constructor(firecallItem?: Fzg) {
    super(firecallItem);
    this.type = 'vehicle';
    if (firecallItem) {
      ({
        fw: this.fw,
        kategorie: this.kategorie,
        besatzung: this.besatzung,
        ats: this.ats,
        alarmierung: this.alarmierung,
        eintreffen: this.eintreffen,
        abruecken: this.abruecken,
        fremd: this.fremd,
        color: this.color,
      } = firecallItem);
    }
  }

  public copy(): FirecallVehicle {
    return Object.assign(new FirecallVehicle(this.data()), this);
  }

  public markerName() {
    return 'Fahrzeug';
  }

  public isRotatable(): boolean {
    return true;
  }

  public fields(): { [fieldName: string]: string } {
    return {
      name: 'Bezeichnung',
      fw: 'Feuerwehr',
      kategorie: 'Art',
      besatzung: 'Besatzung 1:? (ohne Kommandant)',
      ats: 'ATS Träger',
      beschreibung: 'Beschreibung',
      alarmierung: 'Alarmierung',
      eintreffen: 'Eintreffen',
      abruecken: 'Abrücken',
      rotation: 'Drehung in Grad',
      fremd: 'Fremdorganisation',
      color: 'Farbe (HTML bzw. Englisch)',
    };
  }

  public fieldTypes(): { [fieldName: string]: string } {
    return {
      ...super.fieldTypes(),
      kategorie: 'select',
      rotation: 'number',
      ats: 'number',
      fremd: 'boolean',
      color: 'color',
    };
  }

  public selectValues(): SimpleMap<SelectOptions> {
    return {
      // Der leere Wert bleibt wählbar: Ohne gepflegte Art entscheidet der
      // Name, und genau das ist für die gewachsenen Einträge der Normalfall.
      kategorie: {
        '': 'aus dem Namen',
        ...EINSATZMITTEL_KATEGORIE_LABELS,
      } as unknown as SelectOptions,
    };
  }

  public data(): Fzg {
    return {
      ...super.data(),
      fw: this.fw,
      kategorie: this.kategorie,
      besatzung: this.besatzung,
      ats: this.ats,
      alarmierung: this.alarmierung,
      eintreffen: this.eintreffen,
      abruecken: this.abruecken,
      fremd: this.fremd,
      color: this.color,
    } as Fzg;
  }

  public title(): string {
    return `${this.name} ${this.fw || ''}`.trim();
  }

  /** Gehört das Fahrzeug einer fremden Organisation? */
  public isFremd(): boolean {
    return isFremdesFahrzeug(this);
  }

  /** Die Art des Einsatzmittels: gepflegt, sonst aus dem Namen abgeleitet. */
  public einsatzmittelKategorie(): EinsatzmittelKategorie {
    return einsatzmittelKategorie({
      name: this.name || '',
      kategorie: this.kategorie,
    });
  }

  public besatzung1x(): string {
    const kategorie = this.einsatzmittelKategorie();
    return formatBesatzung(
      getEffectiveBesatzung(this.besatzung, this.crewCount ?? 0, kategorie),
      kategorie
    );
  }

  public info(): string {
    const ats = getEffectiveAts(this.ats, this.atsCount ?? 0);
    return `${this.besatzung1x()} ATS: ${ats}`.trim();
  }

  public body(): ReactNode {
    return (
      <>
        {super.body()}

        {this.isFremd() && (
          <>
            Fremdorganisation
            <br />
          </>
        )}
        {this.alarmierung && (
          <>
            Alarmierung: {formatTimestamp(this.alarmierung)}
            <br />
          </>
        )}
        {this.eintreffen && (
          <>
            Eintreffen: {formatTimestamp(this.eintreffen)}
            <br />
          </>
        )}
        {this.abruecken && (
          <>
            Abrücken: {formatTimestamp(this.abruecken)} <br />
          </>
        )}
        {this.id && <VehicleCrewPopup vehicleId={this.id} />}
      </>
    );
  }

  public dialogText(): ReactNode {
    return <>Einsatzfahrzeug</>;
  }

  public dateFields(): string[] {
    return [...super.dateFields(), 'alarmierung', 'eintreffen', 'abruecken'];
  }

  public titleFn(): string {
    return `${this.name} ${this.fw || ''}`;
  }
  public icon(): Icon<IconOptions> {
    return L.icon({
      iconUrl: vehicleIconDataUrl({
        name: this.name || '',
        fw: this.fw || '',
        color: vehicleMarkerColor(this),
      }),
      iconSize: [45, 20],
      iconAnchor: [20, 0],
      popupAnchor: [0, 0],
    });
  }

  public static factory(): FirecallItemBase {
    return new FirecallVehicle();
  }

  public popupFn(): ReactNode {
    return (
      <>
        <b>
          {this.name} {this.fw || ''}
        </b>
        {this.isFremd() && (
          <>
            <br />
            Fremdorganisation
          </>
        )}
        {(() => {
          const kategorie = this.einsatzmittelKategorie();
          const bes = this.besatzung1x();
          const ats = getEffectiveAts(this.ats, this.atsCount ?? 0);
          return (
            <>
              {kategorie !== 'fahrzeug' && (
                <>
                  <br />
                  {EINSATZMITTEL_KATEGORIE_LABELS[kategorie]}
                </>
              )}
              {bes && (
                <>
                  <br />
                  Besatzung: {bes}
                </>
              )}
              {ats > 0 && (
                <>
                  {!bes && <br />} ({ats} ATS)
                </>
              )}
            </>
          );
        })()}
        {this.alarmierung && (
          <>
            <br />
            Alarmierung: {formatTimestamp(this.alarmierung)}
          </>
        )}
        {this.eintreffen && (
          <>
            <br />
            Eintreffen: {formatTimestamp(this.eintreffen)}
          </>
        )}
        {this.abruecken && (
          <>
            <br />
            Abrücken: {formatTimestamp(this.abruecken)}
          </>
        )}
        {this.id && <VehicleCrewPopup vehicleId={this.id} />}
      </>
    );
  }
  // public renderMarker(selectItem: (item: FirecallItem) => void): ReactNode {
  //   return (

  //   );
  // }
}
