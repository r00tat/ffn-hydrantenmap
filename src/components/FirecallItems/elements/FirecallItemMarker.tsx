import Typography from '@mui/material/Typography';
import L, { IconOptions, Icon as LeafletIcon } from 'leaflet';
import React, { ReactNode } from 'react';
import { Tooltip } from 'react-leaflet';
import { markerIconDataUrl } from '../../../common/markerSvg';
import {
  FcItemAttachment,
  FcMarker,
  FirecallItem,
} from '../../firebase/firestore';
import DownloadAllButton from '../../inputs/DownloadAllButton';
import FileDisplay from '../../inputs/FileDisplay';
import { FirecallItemBase } from './FirecallItemBase';
import { iconKeys } from './icons';
import {
  FirecallItemMarkerDefault,
  MarkerRenderOptions,
} from './marker/FirecallItemDefault';

export class FirecallItemMarker extends FirecallItemBase {
  iconUrl: string;
  zeichen: string;
  attachments: FcItemAttachment[];
  color?: string;
  showLabel: boolean | undefined;
  private _showLabelExplicit: boolean;

  public constructor(firecallItem?: FcMarker) {
    super(firecallItem);
    this.type = 'marker';
    ({
      iconUrl: this.iconUrl = '',
      zeichen: this.zeichen = '',
      attachments: this.attachments = [],
      color: this.color = '#0000ff',
    } = firecallItem || {});
    // Track whether the marker has an explicit showLabel setting
    this._showLabelExplicit = firecallItem?.showLabel !== undefined;
    if (this._showLabelExplicit) {
      this.showLabel =
        firecallItem?.showLabel === true ||
        (firecallItem?.showLabel as unknown as string) === 'true';
    } else {
      // undefined = inherit from layer
      this.showLabel = undefined;
    }
  }

  public copy(): FirecallItemBase {
    return Object.assign(new FirecallItemMarker(this.data()), this);
  }

  public data(): FcMarker {
    return {
      ...super.data(),
      iconUrl: this.iconUrl,
      zeichen: this.zeichen,
      attachments: this.attachments,
      color: this.color,
      ...(this._showLabelExplicit ? { showLabel: this.showLabel } : {}),
    } as FcMarker;
  }

  public markerName() {
    return 'Marker';
  }

  public dialogText(): ReactNode {
    return <>Markierung {this.name}</>;
  }

  public fields(): { [fieldName: string]: string } {
    return {
      ...super.fields(),
      zeichen: 'Taktisches Zeichen',
      iconUrl: 'Icon URL',
      attachments: 'Anhänge',
      color: 'Farbe (HTML bzw. Englisch)',
      showLabel: 'Label anzeigen',
    };
  }

  public fieldTypes(): { [fieldName: string]: string } {
    return {
      ...super.fieldTypes(),
      zeichen: 'TaktischesZeichen',
      attachments: 'attachment',
      color: 'color',
      showLabel: 'boolean',
    };
  }
  public popupFn(): ReactNode {
    return (
      <>
        <b>
          {this.zeichen?.replace(/_/g, ' ')} {this.name}
        </b>
        <br />
        {this.beschreibung
          ?.split('\n')
          .filter((b) => b.trim())
          .map((b) => (
            <React.Fragment key={b}>
              {b}
              <br />
            </React.Fragment>
          )) || ''}
        {this.attachments && this.attachments.filter((a) => typeof a === 'string').length > 0 && (
          <>
            <DownloadAllButton urls={this.attachments.filter((a): a is string => typeof a === 'string')} />
            {this.attachments
              .filter((a) => typeof a === 'string')
              .map((a) => (
                <FileDisplay
                  key={a as string}
                  url={a as string}
                  showTitleIfImage={false}
                />
              ))}
          </>
        )}
        <br />
        Position: {Number.parseFloat('' + this.lat).toFixed(6)},
        {Number.parseFloat('' + this.lng).toFixed(6)}
        {this.alt && ` ${Math.round(this.alt)}m`}
        {this.formatFieldData() && (
          <>
            <br />
            <Typography variant="caption">{this.formatFieldData()}</Typography>
          </>
        )}
      </>
    );
  }
  public titleFn(): string {
    return `${this.zeichen?.replace(/_/g, ' ')} ${this.name}`;
  }
  public icon(heatmapColor?: string): LeafletIcon<IconOptions> {
    if (this.zeichen && iconKeys[this.zeichen]?.url) {
      const customIcon = iconKeys[this.zeichen];
      return L.icon({
        iconUrl: customIcon.url,
        iconSize: [customIcon.width || 24, customIcon.height || 24],
      });
    }

    if (this.iconUrl) {
      return L.icon({
        iconUrl: this.iconUrl,
        iconSize: [24, 24],
      });
    }

    const color = heatmapColor || this.color;
    return L.icon({
      iconUrl: markerIconDataUrl('' + color),
      iconSize: [30, 30],
      iconAnchor: [15, 30],
      popupAnchor: [0, -25],
    });
  }

  public static factory(): FirecallItemBase {
    return new FirecallItemMarker();
  }

  public body(): ReactNode {
    return (
      <>
        {super.body()}
        {this.attachments && this.attachments.filter((a) => typeof a === 'string').length > 0 && (
          <>
            <DownloadAllButton urls={this.attachments.filter((a): a is string => typeof a === 'string')} />
            {this.attachments
              .filter((a) => typeof a === 'string')
              .map((a) => (
                <FileDisplay
                  key={a as string}
                  url={a as string}
                  showTitleIfImage={false}
                />
              ))}
          </>
        )}
      </>
    );
  }
  public info(): string {
    return ``;
  }

  public renderMarker(
    selectItem: (item: FirecallItem) => void,
    options: MarkerRenderOptions = {}
  ): ReactNode {
    // Resolve effective label visibility: marker override > layer setting > default true
    const effectiveShowLabel =
      this.showLabel !== undefined
        ? this.showLabel
        : options.layerShowLabels !== undefined
          ? options.layerShowLabels
          : true;
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
}
