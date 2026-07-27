import AddIcon from '@mui/icons-material/Add';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import { Icon, IconOptions } from 'leaflet';
import { Fragment, ReactNode } from 'react';
import { LatLngPosition } from '../../../common/geo';
import { defaultPosition } from '../../../hooks/constants';
import { Area, FirecallItem } from '../../firebase/firestore';
import { leafletIcons } from '../icons';
import { FirecallItemBase, ItemContextMenuContext } from './FirecallItemBase';
import AreaMarker from './area/AreaComponent';
import { calculateArea, formatArea } from './area/area';
import { getConnectionPositions } from './connection/distance';
import { nearestInsertIndex } from './connection/pointGeometry';
import { addFirecallPosition } from './connection/positions';
import { MarkerRenderOptions } from './marker/FirecallItemDefault';

export class FirecallArea extends FirecallItemBase {
  distance: number = 0;
  destLat: number = defaultPosition.lat;
  destLng: number = defaultPosition.lng;
  /** stringified LatLngPosition[] */
  positions?: string;
  color?: string;
  opacity?: number;
  alwaysShowMarker?: string;
  /** polygon area in square meters */
  area?: number;

  public constructor(firecallItem?: Area) {
    super(firecallItem);
    ({
      distance: this.distance = 0,
      destLat: this.destLat = defaultPosition.lat,
      destLng: this.destLng = defaultPosition.lng + 0.0001,
      positions: this.positions = JSON.stringify([]),
      color: this.color = 'blue',
      opacity: this.opacity = 50,
      alwaysShowMarker: this.alwaysShowMarker,
      area: this.area,
    } = firecallItem || {});
  }

  /**
   * Return the polygon area in square meters. Uses the persisted value when
   * available and falls back to computing it from the positions (e.g. for
   * areas drawn before the area was persisted).
   */
  public areaValue(): number {
    if (typeof this.area === 'number') {
      return this.area;
    }
    return calculateArea(getConnectionPositions(this.data()));
  }

  public copy(): FirecallArea {
    return Object.assign(new FirecallArea(this.data()), this);
  }

  public data(): Area {
    return {
      ...super.data(),
      distance: this.distance,
      destLat: this.destLat,
      destLng: this.destLng,
      positions: this.positions,
      color: this.color,
      opacity: this.opacity,
      alwaysShowMarker: this.alwaysShowMarker,
      area: this.area,
    } as Area;
  }

  public markerName() {
    return 'Fläche';
  }

  // public title(): string {
  //   return `Marker ${this.name}`;
  // }

  public info(): string {
    return `Fläche: ${formatArea(this.areaValue())}`;
  }

  public body(): ReactNode {
    return (
      <>
        {super.body()}
        Fläche: {formatArea(this.areaValue())}
        <br />
        {this.lat},{this.lng} =&gt; {this.destLat},{this.destLng}
      </>
    );
  }

  public dialogText(): ReactNode {
    return (
      <>
        Um die Fläche zu zeichnen, auf die gewünschten Positionen klicken. Zum
        Abschluss auf einen belibigen Punkt klicken. <br />
        {this.name || ''}
      </>
    );
  }

  public fields(): { [fieldName: string]: string } {
    return {
      ...super.fields(),
      color: 'Farbe (HTML bzw. Englisch)',
      opacity: 'Deckkraft (in Prozent)',
      alwaysShowMarker: 'Punkte immer anzeigen',
    };
  }

  // public dateFields(): string[] {
  //   return [];
  // }

  public fieldTypes(): { [fieldName: string]: string } {
    return {
      ...super.fieldTypes(),
      opacity: 'number',
      alwaysShowMarker: 'boolean',
      color: 'color',
    };
  }
  public popupFn(): ReactNode {
    return (
      <>
        <b>Fläche {this.name}</b>
        <br />
        {this.beschreibung &&
          this.beschreibung.split('\n').map((s, index) => (
            <Fragment key={`${index}-${s}`}>
              {s}
              <br />
            </Fragment>
          ))}
        {formatArea(this.areaValue())}
      </>
    );
  }
  public titleFn(): string {
    return `${this.markerName()} ${this.name}\n${this.beschreibung || ''}`;
  }
  public icon(): Icon<IconOptions> {
    return leafletIcons().flaeche;
  }

  public static factory(): FirecallItemBase {
    return new FirecallArea();
  }

  public renderMarker(
    selectItem: (item: FirecallItem) => void,
    options: MarkerRenderOptions = {}
  ): ReactNode {
    return (
      <AreaMarker
        record={this}
        selectItem={selectItem}
        key={this.id}
        pane={options.pane}
        onContextMenu={options.onContextMenu}
      />
    );
  }

  public static isPolyline(): boolean {
    return true;
  }

  /**
   * Right-click on the area offers adding a new vertex at the clicked position
   * (inserted on the nearest edge), in addition to the standard item actions.
   */
  public contextMenuItems(
    onClose: () => void,
    ctx?: ItemContextMenuContext
  ): ReactNode {
    if (!ctx?.latLng) return null;
    const positions = getConnectionPositions(this.data());
    if (positions.length < 2) return null;
    const point: LatLngPosition = [ctx.latLng.lat, ctx.latLng.lng];
    const index = nearestInsertIndex(positions, point, true);
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
