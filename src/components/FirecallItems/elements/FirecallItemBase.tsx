'use client';
import EditIcon from '@mui/icons-material/Edit';
import IconButton from '@mui/material/IconButton';
import { Icon, IconOptions } from 'leaflet';
import { ReactNode } from 'react';
import { Popup } from 'react-leaflet';
import { formatTimestamp } from '../../../common/time-format';
import { SimpleMap } from '../../../common/types';
import { defaultPosition } from '../../../hooks/constants';
import { FirecallItem } from '../../firebase/firestore';
import { fallbackIcon } from '../icons';
import { FirecallItemMarkerDefault } from './marker/FirecallItemDefault';
import L from 'leaflet';

export interface FirecallItemPopupProps {
  children: ReactNode;
  onClick: () => void;
}

export function FirecallItemPopup({
  children,
  onClick,
}: FirecallItemPopupProps) {
  return (
    <Popup>
      <IconButton sx={{ marginLeft: 'auto', float: 'right' }} onClick={onClick}>
        <EditIcon />
      </IconButton>
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
      Object.entries(this.data()).filter(([key, value]) => value)
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
              <>
                {s}
                <br />
              </>
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
    return fallbackIcon;
  }

  public static factory(): FirecallItemBase {
    return new FirecallItemBase();
  }

  public renderPopup(selectItem: (item: FirecallItem) => void): ReactNode {
    return (
      <FirecallItemPopup onClick={() => selectItem(this.data())}>
        {this.popupFn()}
      </FirecallItemPopup>
    );
  }

  public renderMarker(selectItem: (item: FirecallItem) => void): ReactNode {
    return (
      <FirecallItemMarkerDefault
        record={this}
        selectItem={selectItem}
        key={this.id}
      />
    );
  }

  public get<T = any>(key: string): T {
    return (this as any)[key] as T;
  }

  public static isPolyline(): boolean {
    return false;
  }

  public static firebaseCollectionName(): string {
    return 'item';
  }
  public addEventHandlers(handlers: L.LeafletEventHandlerFnMap) {
    this.eventHandlers = { ...this.eventHandlers, ...handlers };
    return this;
  }
}
