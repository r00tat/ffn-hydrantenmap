import EditIcon from '@mui/icons-material/Edit';
import { IconButton } from '@mui/material';
import { Icon, IconOptions } from 'leaflet';
import { ReactNode } from 'react';
import { Popup } from 'react-leaflet';
import { defaultPosition } from '../../../hooks/constants';
import { FirecallItem } from '../../firebase/firestore';
import { fallbackIcon } from '../icons';
import { FirecallItemMarkerDefault } from './marker/FirecallItemDefault';
import { SimpleMap } from '../../../common/types';
import { formatTimestamp } from '../../../common/time-format';

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
    this.name = firecallItem?.name || '';
    this.beschreibung = firecallItem?.beschreibung || '';
    this.lat = firecallItem?.lat || defaultPosition.lat;
    this.lng = firecallItem?.lng || defaultPosition.lng;
    this.type = firecallItem?.type || 'fallback';
    this.id = firecallItem?.id;
    this.original = firecallItem;
    this.datum = firecallItem?.datum || '';
    this.rotation = firecallItem?.rotation || '0';
  }

  id?: string;
  name: string;
  beschreibung?: string;
  lat: number;
  lng: number;
  type: string;

  deleted?: boolean;
  datum?: string;
  editable?: boolean;
  original?: FirecallItem;
  rotation?: string;

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
      name: this.name,
      beschreibung: this.beschreibung,
      type: this.type,
      datum: this.datum,
      rotation: this.rotation,
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
            {this.beschreibung}
            <br />
          </>
        )}
        Position: {this.lat},{this.lng}
        <br />
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
    return {};
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
}
