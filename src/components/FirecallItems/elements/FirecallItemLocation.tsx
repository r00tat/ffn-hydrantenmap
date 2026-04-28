'use client';
import Typography from '@mui/material/Typography';
import L, { IconOptions, Icon as LeafletIcon } from 'leaflet';
import React, { ReactNode } from 'react';
import { markerIconDataUrl } from '../../../common/markerSvg';
import {
  FirecallItem,
  LOCATION_STATUS_COLORS,
  LocationStatus,
  FIRECALL_LOCATIONS_COLLECTION_ID,
} from '../../firebase/firestore';
import { FirecallItemBase } from './FirecallItemBase';
import { MarkerRenderOptions } from './marker/FirecallItemDefault';
import { Tooltip } from 'react-leaflet';
import { FirecallItemMarkerDefault } from './marker/FirecallItemDefault';

export class FirecallItemLocation extends FirecallItemBase {
  street: string;
  number: string;
  city: string;
  locInfo: string;
  status: LocationStatus;
  vehicles: Record<string, string>;
  alarmTime?: string;
  startTime?: string;
  doneTime?: string;

  public constructor(firecallItem?: FirecallItem) {
    super(firecallItem);
    this.type = 'location';
    const location = firecallItem as any;
    
    // Explicit assignment to ensure values are set correctly
    this.street = location?.street || '';
    this.number = location?.number || '';
    this.city = location?.city || 'Neusiedl am See';
    this.locInfo = location?.info || '';
    this.status = (location?.status || 'offen').toString().trim().toLowerCase() as LocationStatus;
    this.vehicles = location?.vehicles || {};
    this.alarmTime = location?.alarmTime;
    this.startTime = location?.startTime;
    this.doneTime = location?.doneTime;
    
    if (!this.beschreibung && location?.description) {
      this.beschreibung = location.description;
    }
    if (!this.beschreibung && location?.beschreibung) {
      this.beschreibung = location.beschreibung;
    }

    this.name = location?.name || `${this.street} ${this.number}`.trim() || 'Einsatzort';
  }

  // Define color as a regular property that gets updated
  public get color(): string {
    const statusKey = (this.status || 'offen').toLowerCase() as LocationStatus;
    return LOCATION_STATUS_COLORS[statusKey] || LOCATION_STATUS_COLORS['einsatz notwendig'];
  }

  public copy(): FirecallItemBase {
    return Object.assign(new FirecallItemLocation(this.data()), this);
  }

  public data(): FirecallItem {
    const baseData = super.data();
    return {
      ...baseData,
      street: this.street,
      number: this.number,
      city: this.city,
      description: this.beschreibung,
      beschreibung: this.beschreibung,
      info: this.locInfo,
      status: this.status,
      vehicles: this.vehicles,
      alarmTime: this.alarmTime,
      startTime: this.startTime,
      doneTime: this.doneTime,
      color: this.color, // Include color in data export
    } as unknown as FirecallItem;
  }

  public markerName() {
    return 'Einsatzort';
  }

  public popupFn(): ReactNode {
    return (
      <>
        <b>{this.name}</b>
        <br />
        {this.street} {this.number}, {this.city}
        <br />
        Status: {this.status}
        {this.beschreibung && (
          <>
            <br />
            {this.beschreibung}
          </>
        )}
        {Object.keys(this.vehicles).length > 0 && (
          <>
            <br />
            Fahrzeuge: {Object.values(this.vehicles).join(', ')}
          </>
        )}
      </>
    );
  }

  public titleFn(): string {
    return `Einsatzort ${this.name}`;
  }

  public icon(_heatmapColor?: string): LeafletIcon<IconOptions> {
    return L.icon({
      iconUrl: markerIconDataUrl('' + this.color),
      iconSize: [30, 30],
      iconAnchor: [15, 30],
      popupAnchor: [0, -25],
    });
  }

  public static factory(): FirecallItemBase {
    return new FirecallItemLocation();
  }

  public static firebaseCollectionName(): string {
    return FIRECALL_LOCATIONS_COLLECTION_ID;
  }

  public renderMarker(
    selectItem: (item: FirecallItem) => void,
    options: MarkerRenderOptions = {}
  ): ReactNode {
    try {
      return (
        <FirecallItemMarkerDefault
          record={this}
          selectItem={selectItem}
          key={this.id}
          options={options}
        >
          <Tooltip
            direction="bottom"
            permanent
            offset={[0, 10]}
            opacity={0.8}
            className="nopadding"
          >
            <Typography variant="caption">{this.name}</Typography>
          </Tooltip>
        </FirecallItemMarkerDefault>
      );
    } catch (err) {
      console.error('failed to render marker', err, this.data());
      return <></>;
    }
  }
}
