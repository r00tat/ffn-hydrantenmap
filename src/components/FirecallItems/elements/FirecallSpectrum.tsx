import { ReactNode } from 'react';
import { FirecallItem, Spectrum } from '../../firebase/firestore';
import { FirecallItemBase } from './FirecallItemBase';

export class FirecallSpectrum extends FirecallItemBase {
  sampleName: string;
  deviceName: string;
  measurementTime: number;
  liveTime: number;
  startTime: string;
  endTime: string;
  coefficients: number[];
  counts: number[];
  matchedNuclide?: string;
  matchedConfidence?: number;

  public constructor(firecallItem?: Spectrum) {
    super(firecallItem);
    this.type = 'spectrum';
    ({
      sampleName: this.sampleName = '',
      deviceName: this.deviceName = '',
      measurementTime: this.measurementTime = 0,
      liveTime: this.liveTime = 0,
      startTime: this.startTime = '',
      endTime: this.endTime = '',
      coefficients: this.coefficients = [],
      counts: this.counts = [],
      matchedNuclide: this.matchedNuclide = undefined,
      matchedConfidence: this.matchedConfidence = undefined,
    } = firecallItem || {});
  }

  public data(): Spectrum {
    return {
      ...super.data(),
      sampleName: this.sampleName,
      deviceName: this.deviceName,
      measurementTime: this.measurementTime,
      liveTime: this.liveTime,
      startTime: this.startTime,
      endTime: this.endTime,
      coefficients: this.coefficients,
      counts: this.counts,
      matchedNuclide: this.matchedNuclide,
      matchedConfidence: this.matchedConfidence,
    } as Spectrum;
  }

  public copy(): FirecallSpectrum {
    return Object.assign(new FirecallSpectrum(this.data()), this);
  }

  public markerName() {
    return 'Energiespektrum';
  }

  public dialogText(): ReactNode {
    return <>Energiespektrum {this.name}</>;
  }

  public fields(): { [fieldName: string]: string } {
    return {
      sampleName: 'Probenname',
      deviceName: 'Gerät',
      measurementTime: 'Messzeit (s)',
      liveTime: 'Live-Zeit (s)',
      startTime: 'Startzeit',
      endTime: 'Endzeit',
      matchedNuclide: 'Erkanntes Nuklid',
      matchedConfidence: 'Konfidenz',
    };
  }

  public renderMarker(selectItem: (item: FirecallItem) => void): ReactNode {
    return <></>;
  }

  public body(): ReactNode {
    const formattedStart = this.startTime
      ? new Date(this.startTime).toLocaleString('de-AT')
      : '';
    return (
      <>
        {this.sampleName && (
          <>
            Probe: {this.sampleName}
            <br />
          </>
        )}
        {this.deviceName && (
          <>
            Gerät: {this.deviceName}
            <br />
          </>
        )}
        Messzeit: {this.measurementTime}s
        <br />
        {formattedStart && (
          <>
            Start: {formattedStart}
            <br />
          </>
        )}
        {this.matchedNuclide && (
          <>
            Nuklid: {this.matchedNuclide}
            {this.matchedConfidence != null &&
              ` (${Math.round(this.matchedConfidence * 100)}%)`}
            <br />
          </>
        )}
      </>
    );
  }

  public static factory(): FirecallItemBase {
    return new FirecallSpectrum();
  }
}
