import { Icon, IconOptions } from 'leaflet';
import { ReactNode } from 'react';
import { SimpleMap } from '../../../common/types';
import { Connection } from '../../firebase/firestore';
import { leafletIcons } from '../icons';
import { versorgungSummary } from './connection/versorgungSummary';
import { FirecallItemBase, SelectOptions } from './FirecallItemBase';
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
  foerderungUmgekehrt?: string;
  foerderMenge?: number;
  zielDruck?: number;
  pumpenAusgangsdruck?: number;
  pumpenEingangsdruck?: number;
  pumpenNennstrom?: number;
  paralleleLeitungen?: number;
  frictionModel?: Connection['frictionModel'];
  rauheit?: number;
  kupplungsverlust?: number;
  hoehenunterschied?: number;
  elevationProfile?: string;
  elevationFor?: string;
  elevationFailed?: string;
  elevationSource?: Connection['elevationSource'];
  elevationLevel?: Connection['elevationLevel'];
  elevationSpacing?: string;

  /**
   * Pendelverkehr und Vergleich (#693). Dieselbe Begründung wie oben: alle in
   * `data()`, keine in `fields()`.
   */
  versorgungsart?: Connection['versorgungsart'];
  pendelFahrzeuge?: number;
  pendelTankinhalt?: number;
  pendelGeschwindigkeit?: number;
  pendelFuellleistung?: number;
  pendelRangierzeit?: number;
  pendelEntleerzeit?: number;
  verlegeleistung?: number;
  pumpenRuestzeit?: number;

  public constructor(firecallItem?: Connection) {
    super(firecallItem);
    this.type = 'connection';
    this.dimension = firecallItem?.dimension || 'B';
    this.oneHozeLength = firecallItem?.oneHozeLength || 20;

    if (firecallItem) {
      ({
        foerderung: this.foerderung,
        foerderungUmgekehrt: this.foerderungUmgekehrt,
        foerderMenge: this.foerderMenge,
        zielDruck: this.zielDruck,
        pumpenAusgangsdruck: this.pumpenAusgangsdruck,
        pumpenEingangsdruck: this.pumpenEingangsdruck,
        pumpenNennstrom: this.pumpenNennstrom,
        paralleleLeitungen: this.paralleleLeitungen,
        frictionModel: this.frictionModel,
        rauheit: this.rauheit,
        kupplungsverlust: this.kupplungsverlust,
        hoehenunterschied: this.hoehenunterschied,
        elevationProfile: this.elevationProfile,
        elevationFor: this.elevationFor,
        elevationFailed: this.elevationFailed,
        elevationSource: this.elevationSource,
        elevationLevel: this.elevationLevel,
        elevationSpacing: this.elevationSpacing,
        versorgungsart: this.versorgungsart,
        pendelFahrzeuge: this.pendelFahrzeuge,
        pendelTankinhalt: this.pendelTankinhalt,
        pendelGeschwindigkeit: this.pendelGeschwindigkeit,
        pendelFuellleistung: this.pendelFuellleistung,
        pendelRangierzeit: this.pendelRangierzeit,
        pendelEntleerzeit: this.pendelEntleerzeit,
        verlegeleistung: this.verlegeleistung,
        pumpenRuestzeit: this.pumpenRuestzeit,
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
   * Die Zusammenfassung der gewählten Versorgungsvariante, falls der Rechner
   * aktiv ist und ein Ergebnis liefert. Steht in Popup und Elementliste, damit
   * Pumpenzahl bzw. Pendelmenge nicht erst im Panel sichtbar werden.
   */
  protected foerderungHint(): string {
    const summary = versorgungSummary(this.data() as Connection);
    return summary ? `, ${summary}` : '';
  }

  public info(): string {
    return `Länge: ${Math.round(this.distance || 0)}m ${Math.ceil(
      (this.distance || 0) / this.oneHozeLength
    )} ${this.dimension}-Längen${this.routingHint()}${this.foerderungHint()}`;
  }

  public popupFn(): ReactNode {
    const summary = versorgungSummary(this.data() as Connection);
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
      foerderungUmgekehrt: this.foerderungUmgekehrt,
      foerderMenge: this.foerderMenge,
      zielDruck: this.zielDruck,
      pumpenAusgangsdruck: this.pumpenAusgangsdruck,
      pumpenEingangsdruck: this.pumpenEingangsdruck,
      pumpenNennstrom: this.pumpenNennstrom,
      paralleleLeitungen: this.paralleleLeitungen,
      frictionModel: this.frictionModel,
      rauheit: this.rauheit,
      kupplungsverlust: this.kupplungsverlust,
      hoehenunterschied: this.hoehenunterschied,
      elevationProfile: this.elevationProfile,
      elevationFor: this.elevationFor,
      elevationFailed: this.elevationFailed,
      elevationSource: this.elevationSource,
      elevationLevel: this.elevationLevel,
      elevationSpacing: this.elevationSpacing,
      versorgungsart: this.versorgungsart,
      pendelFahrzeuge: this.pendelFahrzeuge,
      pendelTankinhalt: this.pendelTankinhalt,
      pendelGeschwindigkeit: this.pendelGeschwindigkeit,
      pendelFuellleistung: this.pendelFuellleistung,
      pendelRangierzeit: this.pendelRangierzeit,
      pendelEntleerzeit: this.pendelEntleerzeit,
      verlegeleistung: this.verlegeleistung,
      pumpenRuestzeit: this.pumpenRuestzeit,
    } as Connection;
  }

  public fields(): { [fieldName: string]: string } {
    return {
      ...super.fields(),
      dimension: 'Dimension (B, C etc)',
      oneHozeLength: 'Länge eines Schlauches (Standard 20m)',
      streetRouting: 'Routing über Straße',
      routingProfile: 'Routing-Profil',
    };
  }

  public fieldTypes(): { [fieldName: string]: string } {
    return {
      ...super.fieldTypes(),
      oneHozeLength: 'number',
      streetRouting: 'boolean',
      routingProfile: 'select',
    };
  }

  /**
   * Das Profil stand hier lange nicht zur Wahl — ein Schlauch folgt der Straße,
   * fährt aber nicht. Mit dem Pendelverkehr ist dieselbe Linie auch die
   * **Fahrstrecke** der Tanklöschfahrzeuge, und dafür zählen Einbahnen und
   * Abbiegeverbote. Siehe docs/pendelverkehr.md.
   */
  public selectValues(): SimpleMap<SelectOptions> {
    return {
      ...super.selectValues(),
      routingProfile: {
        walk: 'Schlauch (ignoriert Einbahnen)',
        drive: 'Fahrzeug (folgt der Fahrtrichtung)',
      },
    };
  }

  public static factory(): FirecallItemBase {
    return new FirecallConnection();
  }
}
