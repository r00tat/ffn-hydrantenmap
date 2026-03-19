import Typography from '@mui/material/Typography';
import L, { Icon, IconOptions } from 'leaflet';
import { ReactNode } from 'react';
import { Tooltip } from 'react-leaflet';
import { formatTimestamp } from '../../../common/time-format';
import {
  FirecallItem,
  TacticalUnit,
  TACTICAL_UNIT_LABELS,
  TacticalUnitType,
} from '../../firebase/firestore';
import { FirecallItemBase, SelectOptions } from './FirecallItemBase';
import {
  FirecallItemMarkerDefault,
  MarkerRenderOptions,
} from './marker/FirecallItemDefault';
import { SimpleMap } from '../../../common/types';

const UNIT_TYPE_ICON_MAP: Record<TacticalUnitType, string> = {
  einheit: '/icons/taktische_zeichen/Formation_von_Kraeften/Einheit.png',
  trupp: '/icons/taktische_zeichen/Formation_von_Kraeften/Trupp.png',
  gruppe: '/icons/taktische_zeichen/Formation_von_Kraeften/Gruppe.png',
  zug: '/icons/taktische_zeichen/Formation_von_Kraeften/Zug.png',
  bereitschaft:
    '/icons/taktische_zeichen/Formation_von_Kraeften/Bereitschaft.png',
  abschnitt: '/icons/taktische_zeichen/Formation_von_Kraeften/Abschnitt.png',
  bezirk: '/icons/taktische_zeichen/Formation_von_Kraeften/Bezirk.png',
  lfv: '/icons/taktische_zeichen/Formation_von_Kraeften/LFV.png',
  oebfv: '/icons/taktische_zeichen/Formation_von_Kraeften/OEBFV.png',
};

export class FirecallTacticalUnit extends FirecallItemBase {
  unitType?: TacticalUnitType = 'zug';
  fw?: string;
  mann?: number;
  fuehrung?: string;
  ats?: number;
  alarmierung?: string;
  eintreffen?: string;
  abruecken?: string;

  public constructor(firecallItem?: TacticalUnit) {
    super(firecallItem);
    this.type = 'tacticalUnit';
    if (firecallItem) {
      ({
        fw: this.fw,
        mann: this.mann,
        fuehrung: this.fuehrung,
        ats: this.ats,
        alarmierung: this.alarmierung,
        eintreffen: this.eintreffen,
        abruecken: this.abruecken,
      } = firecallItem);
      this.unitType = firecallItem.unitType ?? 'zug';
    }
  }

  public copy(): FirecallTacticalUnit {
    return Object.assign(new FirecallTacticalUnit(this.data()), this);
  }

  public markerName() {
    return 'Taktische Einheit';
  }

  public fields(): { [fieldName: string]: string } {
    return {
      name: 'Bezeichnung',
      unitType: 'Art der Einheit',
      fw: 'Feuerwehr',
      mann: 'Mannschaftsstärke',
      fuehrung: 'Einheitsführer',
      ats: 'ATS Träger',
      beschreibung: 'Beschreibung',
      alarmierung: 'Alarmierung',
      eintreffen: 'Eintreffen',
      abruecken: 'Abrücken',
    };
  }

  public fieldTypes(): { [fieldName: string]: string } {
    return {
      ...super.fieldTypes(),
      unitType: 'select',
      mann: 'number',
      ats: 'number',
    };
  }

  public selectValues(): SimpleMap<SelectOptions> {
    return {
      unitType: TACTICAL_UNIT_LABELS as unknown as SelectOptions,
    };
  }

  public data(): TacticalUnit {
    return {
      ...super.data(),
      unitType: this.unitType,
      fw: this.fw,
      mann: this.mann,
      fuehrung: this.fuehrung,
      ats: this.ats,
      alarmierung: this.alarmierung,
      eintreffen: this.eintreffen,
      abruecken: this.abruecken,
    } as TacticalUnit;
  }

  public title(): string {
    return `${this.name} ${this.fw || ''}`.trim();
  }

  public info(): string {
    return `Stärke: ${this.mann || 0} ATS: ${this.ats || 0}`;
  }

  public body(): ReactNode {
    return (
      <>
        {this.unitType && (
          <>
            Art: {TACTICAL_UNIT_LABELS[this.unitType]}
            <br />
          </>
        )}
        {this.fuehrung && (
          <>
            Führung: {this.fuehrung}
            <br />
          </>
        )}
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
            Abrücken: {formatTimestamp(this.abruecken)}
            <br />
          </>
        )}
      </>
    );
  }

  public dialogText(): ReactNode {
    return <>Taktische Einheit</>;
  }

  public dateFields(): string[] {
    return [...super.dateFields(), 'alarmierung', 'eintreffen', 'abruecken'];
  }

  public titleFn(): string {
    return `${this.unitType ? TACTICAL_UNIT_LABELS[this.unitType] + ' ' : ''}${this.name} ${this.fw || ''}`;
  }

  public icon(): Icon<IconOptions> {
    const iconUrl = this.unitType
      ? UNIT_TYPE_ICON_MAP[this.unitType]
      : UNIT_TYPE_ICON_MAP.einheit;
    return L.icon({
      iconUrl,
      iconSize: [24, 24],
    });
  }

  public popupFn(): ReactNode {
    return (
      <>
        <b>
          {this.unitType ? TACTICAL_UNIT_LABELS[this.unitType] + ' ' : ''}
          {this.name} {this.fw || ''}
        </b>
        {this.fuehrung && (
          <>
            <br />
            Führung: {this.fuehrung}
          </>
        )}
        {this.mann !== undefined && this.mann > 0 && (
          <>
            <br />
            Stärke: {this.mann}
          </>
        )}
        {this.ats !== undefined && this.ats > 0 && <> ({this.ats} ATS)</>}
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

  public renderMarker(
    selectItem: (item: FirecallItem) => void,
    options: MarkerRenderOptions = {},
  ): ReactNode {
    const effectiveShowLabel =
      options.layerShowLabels !== undefined ? options.layerShowLabels : true;
    try {
      return (
        <FirecallItemMarkerDefault
          record={this}
          selectItem={selectItem}
          key={this.id}
          options={options}
        >
          {effectiveShowLabel && (
            <Tooltip
              direction="bottom"
              permanent
              offset={[0, 10]}
              opacity={0.8}
              className="nopadding"
            >
              <Typography variant="caption">{this.name}</Typography>
            </Tooltip>
          )}
        </FirecallItemMarkerDefault>
      );
    } catch (err) {
      console.error('failed to render marker', err, this.data());
      return <></>;
    }
  }

  public static factory(): FirecallItemBase {
    return new FirecallTacticalUnit();
  }
}
