import { FirecallItemInfo } from './infos/types';
import { FirecallItem } from '../firebase/firestore';
import { IconOptions, Icon } from 'leaflet';
import { ReactNode } from 'react';
import { defaultPosition } from '../../hooks/constants';
import { fallbackIcon } from './icons';

export class FirecallItemBase {
    constructor(firecallItem?: FirecallItem) {
        // empty initializer
        this.name = firecallItem?.name || '';
        this.beschreibung = firecallItem?.beschreibung || '';
        this.lat = firecallItem?.lat || defaultPosition.lat;
        this.lng = firecallItem?.lng || defaultPosition.lng;
        this.type = firecallItem?.type || 'fallback'
    }

    
    name: string;
    beschreibung?: string;
    lat: number;
    lng: number; 
    type: string;

    /**
     * prepare serialization
     * @returns serializable data to save in firestore
     */
    public data(): {[key: string]: any} {
        return {
            
            lat: this.lat,
            lng: this.lng,
            name: this.name,
            beschreibung: this.beschreibung,
            type: this.type,
        }
    }

    public title(): string {
        return this.name;
    }
    public info(): string {
        return `${this.beschreibung || ''}`;
    }

    public body(): string {
        return `FirecallItem ${this.name}
        ${this.beschreibung}
        position: ${this.lat},${this.lng}`
    }

    public dialogText(): ReactNode {
        return this.name || '';
    }

    public fields(): { [fieldName: string]: string; } {
        return {
            name: 'Bezeichnung',
            beschreibung: 'Beschreibung',
          }
    }

    public dateFields(): string[] {
        return [];
    }
    
    public fieldTypes(): { [fieldName: string]: string; } | undefined {
        return {}
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

}