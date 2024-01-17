import L, { Icon, IconOptions } from 'leaflet';
import { ReactNode } from 'react';
import { formatTimestamp } from '../../../common/time-format';
import { Fzg } from '../../firebase/firestore';
import { FirecallItemBase } from './FirecallItemBase';

export class FirecallVehicle extends FirecallItemBase {
  fw?: string;
  besatzung?: string;
  ats?: number;
  alarmierung?: string;
  eintreffen?: string;
  abruecken?: string;

  public constructor(firecallItem?: Fzg) {
    super(firecallItem);
    this.type = 'vehicle';
    if (firecallItem) {
      ({
        fw: this.fw,
        besatzung: this.besatzung,
        ats: this.ats,
        alarmierung: this.alarmierung,
        eintreffen: this.eintreffen,
        abruecken: this.abruecken,
      } = firecallItem);
    }
  }

  public copy(): FirecallVehicle {
    return Object.assign(new FirecallVehicle(this.data()), this);
  }

  public markerName() {
    return 'Fahrzeug';
  }

  public fields(): { [fieldName: string]: string } {
    return {
      name: 'Bezeichnung',
      fw: 'Feuerwehr',
      besatzung: 'Besatzung 1:?',
      ats: 'ATS Träger',
      beschreibung: 'Beschreibung',
      alarmierung: 'Alarmierung',
      eintreffen: 'Eintreffen',
      abruecken: 'Abrücken',
      rotation: 'Drehung in Grad',
    };
  }

  public fieldTypes(): { [fieldName: string]: string } {
    return {
      ...super.fieldTypes(),
      rotation: 'number',
      ats: 'number',
    };
  }

  public data(): Fzg {
    return {
      ...super.data(),
      fw: this.fw,
      besatzung: this.besatzung,
      ats: this.ats,
      alarmierung: this.alarmierung,
      eintreffen: this.eintreffen,
      abruecken: this.abruecken,
    } as Fzg;
  }

  public title(): string {
    return `${this.name} ${this.fw}`;
  }

  public info(): string {
    return `1:${this.besatzung || 0} ATS: ${this.ats || 0}`;
  }

  public body(): ReactNode {
    return (
      <>
        {super.body()}

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
      iconUrl: `/api/fzg?name=${encodeURIComponent(
        this.name || ''
      )}&fw=${encodeURIComponent(this.fw || '')}`,
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
        {this.besatzung && Number.parseInt(this.besatzung) > 0 && (
          <>
            <br />
            Besatzung: 1:{this.besatzung}
          </>
        )}
        {this.ats !== undefined && this.ats > 0 && (
          <>
            {!(this.besatzung && Number.parseInt(this.besatzung) > 0) && <br />}{' '}
            ({this.ats} ATS)
          </>
        )}
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
      </>
    );
  }
  // public renderMarker(selectItem: (item: FirecallItem) => void): ReactNode {
  //   return (

  //   );
  // }
}
