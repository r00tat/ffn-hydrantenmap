import EditIcon from '@mui/icons-material/Edit';
import { IconButton } from '@mui/material';
import { Icon, IconOptions } from 'leaflet';
import { ReactNode } from 'react';
import { Popup } from 'react-leaflet';
import { defaultPosition } from '../../../hooks/constants';
import { FirecallItem } from '../../firebase/firestore';
import { fallbackIcon } from '../icons';
import { FirecallItemMarkerDefault } from './FirecallItemDefault';

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
    this.datum = firecallItem?.datum || new Date().toISOString();
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

  public markerName() {
    return 'Firecallitem';
  }

  public title(): string {
    return `${this.markerName()} ${this.name}`;
  }

  public info(): string {
    return `${this.beschreibung || ''}`;
  }

  public body(): string {
    return `${this.markerName()} ${this.name}
        ${this.beschreibung}
        position: ${this.lat},${this.lng}`;
  }

  public dialogText(): ReactNode {
    return this.name || '';
  }

  public fields(): { [fieldName: string]: string } {
    return {
      name: 'Bezeichnung',
      beschreibung: 'Beschreibung',
    };
  }

  public dateFields(): string[] {
    return [];
  }

  public fieldTypes(): { [fieldName: string]: string } | undefined {
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
    return <FirecallItemMarkerDefault record={this} selectItem={selectItem} />;
  }
}
