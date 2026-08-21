import { Icon, IconOptions } from 'leaflet';
import { ReactNode } from 'react';
import { Connection } from '../../firebase/firestore';
import { leafletIcons } from '../icons';
import { foerderungSummary } from './connection/foerderung/foerderung';
import { FirecallItemBase } from './FirecallItemBase';
import { FirecallMultiPoint } from './FirecallMultiPoint';

export class FirecallConnection extends FirecallMultiPoint {
  dimension: string;
  oneHozeLength: number;

  /**
   * Löschwasserförderung über lange Wegstrecke.
   *
   * Die Felder stehen hier und nicht an `FirecallMultiPoint`: Eine Linie fördert
   * kein Wasser. Sie gehören alle in `data()` — das ist die Grundlage jedes
   * Schreibvorgangs, und was dort fehlt, löscht ein Speichern aus dem Dialog
   * (`setDoc` ohne `merge`). In `fields()` erscheinen sie dagegen **nicht**: Sie
   * gehören in den eigenen Dialog, nicht in die generische Feldliste.
   */
  foerderung?: string;
  foerderMenge?: number;
  zielDruck?: number;
  pumpenAusgangsdruck?: number;
  pumpenEingangsdruck?: number;
  pumpenNennstrom?: number;
  paralleleLeitungen?: number;
  hoehenunterschied?: number;
  elevationProfile?: string;
  elevationFor?: string;
  elevationFailed?: string;

  public constructor(firecallItem?: Connection) {
    super(firecallItem);
    this.type = 'connection';
    this.dimension = firecallItem?.dimension || 'B';
    this.oneHozeLength = firecallItem?.oneHozeLength || 20;

    if (firecallItem) {
      ({
        foerderung: this.foerderung,
        foerderMenge: this.foerderMenge,
        zielDruck: this.zielDruck,
        pumpenAusgangsdruck: this.pumpenAusgangsdruck,
        pumpenEingangsdruck: this.pumpenEingangsdruck,
        pumpenNennstrom: this.pumpenNennstrom,
        paralleleLeitungen: this.paralleleLeitungen,
        hoehenunterschied: this.hoehenunterschied,
        elevationProfile: this.elevationProfile,
        elevationFor: this.elevationFor,
        elevationFailed: this.elevationFailed,
      } = firecallItem);
    }
  }

  public copy(): FirecallConnection {
    return Object.assign(
      new FirecallConnection(this.data() as Connection),
      this
    );
  }

  public icon(): Icon<IconOptions> {
    return leafletIcons().leitung;
  }

  public markerName() {
    return 'Leitung';
  }

  /**
   * Die Zusammenfassung der Förderung, falls der Rechner aktiv ist und ein
   * Ergebnis liefert. Steht in Popup und Elementliste, damit die Pumpenzahl
   * nicht erst im Dialog sichtbar wird.
   */
  protected foerderungHint(): string {
    const summary = foerderungSummary(this.data() as Connection);
    return summary ? `, ${summary}` : '';
  }

  public info(): string {
    return `Länge: ${Math.round(this.distance || 0)}m ${Math.ceil(
      (this.distance || 0) / this.oneHozeLength
    )} ${this.dimension}-Längen${this.routingHint()}${this.foerderungHint()}`;
  }

  public popupFn(): ReactNode {
    const summary = foerderungSummary(this.data() as Connection);
    return (
      <>
        <b>
          {this.markerName()} {this.name}
        </b>
        <br />
        {Math.round(this.distance || 0)}
        m, {Math.ceil((this.distance || 0) / this.oneHozeLength)}{' '}
        {this.dimension} Schläuche
        {this.routingHint()}
        {summary && (
          <>
            <br />
            {summary}
          </>
        )}
      </>
    );
  }

  public data(): Connection {
    return {
      ...super.data(),
      dimension: this.dimension || 'B',
      oneHozeLength: this.oneHozeLength || 20,
      foerderung: this.foerderung,
      foerderMenge: this.foerderMenge,
      zielDruck: this.zielDruck,
      pumpenAusgangsdruck: this.pumpenAusgangsdruck,
      pumpenEingangsdruck: this.pumpenEingangsdruck,
      pumpenNennstrom: this.pumpenNennstrom,
      paralleleLeitungen: this.paralleleLeitungen,
      hoehenunterschied: this.hoehenunterschied,
      elevationProfile: this.elevationProfile,
      elevationFor: this.elevationFor,
      elevationFailed: this.elevationFailed,
    } as Connection;
  }

  public fields(): { [fieldName: string]: string } {
    return {
      ...super.fields(),
      dimension: 'Dimension (B, C etc)',
      oneHozeLength: 'Länge eines Schlauches (Standard 20m)',
      // Kein Profil zur Wahl: Ein Schlauch folgt der Straße, fährt aber nicht.
      streetRouting: 'Routing über Straße',
    };
  }

  public fieldTypes(): { [fieldName: string]: string } {
    return {
      ...super.fieldTypes(),
      oneHozeLength: 'number',
      streetRouting: 'boolean',
    };
  }

  public static factory(): FirecallItemBase {
    return new FirecallConnection();
  }
}
