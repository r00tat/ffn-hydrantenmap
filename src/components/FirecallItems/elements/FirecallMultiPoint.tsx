import AddIcon from '@mui/icons-material/Add';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import { Icon, IconOptions } from 'leaflet';
import { ReactNode } from 'react';
import { LatLngPosition } from '../../../common/geo';
import { defaultPosition } from '../../../hooks/constants';
import {
  Connection,
  FirecallItem,
  MultiPointItem,
} from '../../firebase/firestore';
import { leafletIcons } from '../icons';
import { FirecallItemBase, ItemContextMenuContext } from './FirecallItemBase';
import ConnectionMarker from './connection/ConnectionComponent';
import { getConnectionPositions } from './connection/distance';
import { nearestInsertIndex } from './connection/pointGeometry';
import { addFirecallPosition } from './connection/positions';
import { MarkerRenderOptions } from './marker/FirecallItemDefault';

export class FirecallMultiPoint extends FirecallItemBase {
  destLat: number = defaultPosition.lat;
  destLng: number = defaultPosition.lng;
  /** stringified LatLngPosition[] */
  positions?: string;
  distance?: number;
  color?: string;
  alwaysShowMarker?: string;

  public constructor(firecallItem?: MultiPointItem) {
    super(firecallItem);

    if (firecallItem) {
      ({
        destLat: this.destLat,
        destLng: this.destLng,
        positions: this.positions,
        distance: this.distance,
        color: this.color,
        alwaysShowMarker: this.alwaysShowMarker = 'false',
      } = firecallItem);
    }
  }

  public copy(): FirecallMultiPoint {
    return Object.assign(new FirecallMultiPoint(this.data()), this);
  }

  public markerName() {
    return 'MultiPoint';
  }

  public fields(): { [fieldName: string]: string } {
    return {
      ...super.fields(),
      color: 'Farbe (HTML bzw. Englisch)',
      alwaysShowMarker: 'Punkte immer anzeigen',
    };
  }

  public fieldTypes(): { [fieldName: string]: string } {
    return {
      ...super.fieldTypes(),
      alwaysShowMarker: 'boolean',
      color: 'color',
    };
  }

  public data(): MultiPointItem {
    return {
      ...super.data(),
      destLat: this.destLat,
      destLng: this.destLng,
      positions: this.positions,
      distance: this.distance,
      color: this.color,
      alwaysShowMarker: this.alwaysShowMarker,
    } as Connection;
  }

  // public title(): string {
  //   return `${this.name}`;
  // }

  public info(): string {
    return `Länge: ${Math.round(this.distance || 0)}m ${Math.ceil(
      (this.distance || 0) / 20
    )} B-Längen`;
  }

  public body(): ReactNode {
    return (
      <>
        {super.body()}
        {this.lat},{this.lng} =&gt; {this.destLat},{this.destLng}
        <br />
        {this.distance && (
          <>
            Länge: {Math.round(this.distance)}m<br />
          </>
        )}
        {this.color && <>Farbe: {this.color}</>}
      </>
    );
  }

  public dialogText(): ReactNode {
    return (
      <>
        Um die Leitung zu zeichnen, auf die gewünschten Positionen klicken. Zum
        Abschluss auf einen belibigen Punkt klicken. <br />
        {this.name || ''}
      </>
    );
  }

  // public dateFields(): string[] {
  //   return [...super.dateFields()];
  // }

  public titleFn(): string {
    return `${this.markerName()} ${this.name}`;
  }
  public icon(): Icon<IconOptions> {
    return leafletIcons().circle;
  }

  public static factory(): FirecallItemBase {
    return new FirecallMultiPoint();
  }

  public popupFn(): ReactNode {
    return (
      <>
        <b>
          {this.markerName()} {this.name}
        </b>
        <br />
        {Math.round(this.distance || 0)}m
      </>
    );
  }
  public renderMarker(
    selectItem: (item: FirecallItem) => void,
    options: MarkerRenderOptions = {}
  ): ReactNode {
    try {
      return (
        <ConnectionMarker
          record={this}
          selectItem={selectItem}
          key={this.id}
          pane={options.pane}
          onContextMenu={options.onContextMenu}
        />
      );
    } catch (err) {
      console.error('failed to render marker', err, this.data());
      return <></>;
    }
  }

  public static isPolyline(): boolean {
    return true;
  }

  /**
   * Right-click on the line offers adding a new vertex at the clicked position
   * (inserted on the nearest segment), in addition to the standard item
   * actions.
   */
  public contextMenuItems(
    onClose: () => void,
    ctx?: ItemContextMenuContext
  ): ReactNode {
    if (!ctx?.latLng) return null;
    const positions = getConnectionPositions(this.data());
    if (positions.length < 2) return null;
    const point: LatLngPosition = [ctx.latLng.lat, ctx.latLng.lng];
    const index = nearestInsertIndex(positions, point, false);
    return (
      <MenuItem
        onClick={() => {
          addFirecallPosition(
            ctx.firecallId,
            { lat: point[0], lng: point[1] },
            this.data(),
            index,
            ctx.email
          );
          onClose();
        }}
      >
        <ListItemIcon>
          <AddIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Punkt hinzufügen</ListItemText>
      </MenuItem>
    );
  }
}
