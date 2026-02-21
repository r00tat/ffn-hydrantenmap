'use client';
import DirectionsIcon from '@mui/icons-material/Directions';
import EditIcon from '@mui/icons-material/Edit';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import L, { Icon, IconOptions } from 'leaflet';
import { ReactNode } from 'react';
import { Popup } from 'react-leaflet';
import { formatTimestamp } from '../../../common/time-format';
import { SimpleMap } from '../../../common/types';
import { defaultPosition } from '../../../hooks/constants';
import { useMapEditable } from '../../../hooks/useMapEditor';
import {
  FIRECALL_ITEMS_COLLECTION_ID,
  FirecallItem,
} from '../../firebase/firestore';
import { leafletIcons } from '../icons';
import {
  FirecallItemMarkerDefault,
  MarkerRenderOptions,
} from './marker/FirecallItemDefault';
import React from 'react';

export function PopupNavigateButton({ lat, lng }: { lat?: number; lng?: number }) {
  if (!lat || !lng) return null;
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  return (
    <Tooltip title="Navigation starten">
      <IconButton
        size="small"
        onClick={() => window.open(url, '_blank')}
        color="primary"
        sx={{ float: 'right' }}
      >
        <DirectionsIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}

export interface FirecallItemPopupProps {
  children: ReactNode;
  onClick: () => void;
  lat?: number;
  lng?: number;
}

export function FirecallItemPopup({
  children,
  onClick,
  lat,
  lng,
}: FirecallItemPopupProps) {
  const editable = useMapEditable();
  return (
    <Popup>
      <PopupNavigateButton lat={lat} lng={lng} />
      {editable && (
        <IconButton
          sx={{ marginLeft: 'auto', float: 'right' }}
          onClick={onClick}
        >
          <EditIcon />
        </IconButton>
      )}
      {children}
    </Popup>
  );
}

export interface SelectOptions extends SimpleMap<string> {}

/**
 * base class for all firecall items
 */

export class FirecallItemBase {
  constructor(firecallItem?: FirecallItem) {
    // empty initializer
    ({
      id: this.id = '',
      name: this.name = '',
      beschreibung: this.beschreibung = '',
      lat: this.lat = defaultPosition.lat,
      lng: this.lng = defaultPosition.lng,
      type: this.type = 'fallback',
      original: this.original,
      datum: this.datum = '',
      rotation: this.rotation = '0',
      layer: this.layer = '',
      deleted: this.deleted = false,
      updatedAt: this.updatedAt,
      updatedBy: this.updatedBy,
      creator: this.creator,
      created: this.created,
      alt: this.alt,
      draggable: this.draggable = true,
      eventHandlers: this.eventHandlers = {},
    } = firecallItem || {});
  }

  id?: string;
  name: string;
  beschreibung: string;
  lat: number;
  lng: number;
  alt?: number;
  type: string;
  updatedAt?: string;
  updatedBy?: string;

  deleted?: boolean;
  datum: string;
  editable?: boolean;
  original?: FirecallItem;
  rotation: string;
  layer: string;
  creator?: string;
  created?: string;
  draggable: boolean;

  eventHandlers: L.LeafletEventHandlerFnMap = {};

  public copy(): FirecallItemBase {
    return Object.assign(new FirecallItemBase(this.data()), this);
  }

  public set(name: string, value: any): FirecallItemBase {
    return Object.assign(this, { [name]: value });
  }

  /**
   * prepare serialization
   * @returns serializable data to save in firestore
   */
  public data(): FirecallItem {
    return {
      id: this.id,
      lat: this.lat,
      lng: this.lng,
      alt: this.alt,
      name: this.name,
      beschreibung: this.beschreibung,
      type: this.type,
      datum: this.datum,
      rotation: this.rotation,
      layer: this.layer,
      creator: this.creator,
      created: this.created,
      updatedAt: this.updatedAt,
      updatedBy: this.updatedBy,
    };
  }

  public filteredData(): FirecallItem {
    return Object.fromEntries(
      Object.entries(this.data()).filter(([key, value]) => value),
    ) as FirecallItem;
  }

  public markerName() {
    return 'Firecallitem';
  }

  public title(): string {
    return `${this.markerName()} ${this.name}`;
  }

  public info(): string {
    return `${this.beschreibung || ''}`;
  }

  public body(): ReactNode {
    return (
      <>
        {this.beschreibung && (
          <>
            {this.beschreibung.split('\n').map((s) => (
              <React.Fragment key={s}>
                {s}
                <br />
              </React.Fragment>
            ))}
          </>
        )}
        {this.lat &&
          this.lng &&
          this.lat !== defaultPosition.lat &&
          this.lng !== defaultPosition.lng && (
            <>
              Position: {Number.parseFloat('' + this.lat).toFixed(4)},
              {Number.parseFloat('' + this.lng).toFixed(4)}
              {this.alt && ` ${Math.round(this.alt)}m`}
              <br />
            </>
          )}
        {this.datum && (
          <>
            Zeitstempel: {formatTimestamp(this.datum)}
            <br />
          </>
        )}
      </>
    );
  }

  public dialogText(): ReactNode {
    return this.name || '';
  }

  public fields(): SimpleMap<string> {
    return {
      name: 'Bezeichnung',
      beschreibung: 'Beschreibung',
    };
  }

  public dateFields(): string[] {
    return ['datum'];
  }

  public fieldTypes(): SimpleMap<string> {
    return {
      beschreibung: 'textarea',
    };
  }

  public selectValues(): SimpleMap<SelectOptions> {
    return {};
  }

  public popupFn(): ReactNode {
    return this.name;
  }
  public titleFn(): string {
    return this.name;
  }
  public icon(): Icon<IconOptions> {
    return leafletIcons().fallback;
  }

  public static factory(): FirecallItemBase {
    return new FirecallItemBase();
  }

  public renderPopup(selectItem: (item: FirecallItem) => void): ReactNode {
    return (
      <FirecallItemPopup onClick={() => selectItem(this.data())} lat={this.lat} lng={this.lng}>
        {this.popupFn()}
      </FirecallItemPopup>
    );
  }

  public renderMarker(
    selectItem: (item: FirecallItem) => void,
    options: MarkerRenderOptions = {},
  ): ReactNode {
    try {
      return (
        <FirecallItemMarkerDefault
          record={this}
          selectItem={selectItem}
          key={this.id}
          options={options}
        />
      );
    } catch (err) {
      console.error('failed to render marker', err, this.data());
      return <></>;
    }
  }

  public get<T = any>(key: string): T {
    return (this as any)[key] as T;
  }

  public static isPolyline(): boolean {
    return false;
  }

  public static firebaseCollectionName(): string {
    return FIRECALL_ITEMS_COLLECTION_ID;
  }
  public addEventHandlers(handlers: L.LeafletEventHandlerFnMap) {
    this.eventHandlers = { ...this.eventHandlers, ...handlers };
    return this;
  }
}
