import { Icon, IconOptions } from 'leaflet';
import React, { ReactNode } from 'react';
import { LatLngPosition } from '../../../common/geo';
import { Connection, Line } from '../../firebase/firestore';
import { SimpleMap } from '../../../common/types';
import { dammbauSummary } from './damm/sandsack';
import { leafletIcons } from '../icons';
import { FirecallItemBase, SelectOptions } from './FirecallItemBase';
import { FirecallMultiPoint } from './FirecallMultiPoint';

export class FirecallLine extends FirecallMultiPoint {
  opacity?: number;

  /**
   * Sandsackbedarf für den Dammbau (#694).
   *
   * Die Felder stehen hier und nicht an `FirecallMultiPoint`: Eine Leitung ist
   * kein Damm. Sie gehören alle in `data()` — das ist die Grundlage jedes
   * Schreibvorgangs, und was dort fehlt, löscht ein Speichern aus dem Dialog
   * (`setDoc` ohne `merge`). In `fields()` erscheinen sie dagegen **nicht**: Sie
   * gehören in den eigenen Rechner, nicht in die generische Feldliste. Gleiche
   * Aufteilung wie bei der Löschwasserförderung an der Leitung.
   */
  dammbau?: string;
  dammHoehe?: number;
  freibord?: number;
  dammBauweise?: Line['dammBauweise'];
  dammBoeschung?: number;
  sackFormat?: string;
  sackFuellgrad?: number;
  sandDichte?: number;
  dammReserve?: number;
  dammPersonal?: number;
  dammZielzeit?: number;
  fuellTrichter?: string;
  saeckeRoedeln?: string;
  transportWeite?: number;
  lkwNutzlast?: number;
  fuellLeistung?: number;
  transportLeistung?: number;
  verbauLeistung?: number;

  public constructor(firecallItem?: Line) {
    super(firecallItem as unknown as Connection);
    this.type = 'line';
    if (firecallItem) {
      ({
        opacity: this.opacity,
        dammbau: this.dammbau,
        dammHoehe: this.dammHoehe,
        freibord: this.freibord,
        dammBauweise: this.dammBauweise,
        dammBoeschung: this.dammBoeschung,
        sackFormat: this.sackFormat,
        sackFuellgrad: this.sackFuellgrad,
        sandDichte: this.sandDichte,
        dammReserve: this.dammReserve,
        dammPersonal: this.dammPersonal,
        dammZielzeit: this.dammZielzeit,
        fuellTrichter: this.fuellTrichter,
        saeckeRoedeln: this.saeckeRoedeln,
        transportWeite: this.transportWeite,
        lkwNutzlast: this.lkwNutzlast,
        fuellLeistung: this.fuellLeistung,
        transportLeistung: this.transportLeistung,
        verbauLeistung: this.verbauLeistung,
      } = firecallItem);
    }
    this.color = firecallItem?.color || 'green';
  }

  public copy(): FirecallLine {
    return Object.assign(new FirecallLine(this.data()), this);
  }

  public markerName() {
    return this.dammbau === 'true' ? 'Dammlinie' : 'Linie';
  }

  /**
   * Die Zusammenfassung des Sandsackbedarfs, falls der Rechner aktiv ist und
   * eine Strecke gezeichnet ist. Steht in Popup und Elementliste, damit die
   * Sackzahl nicht erst im Panel sichtbar wird.
   */
  protected dammbauHint(): string {
    const summary = dammbauSummary(this.data());
    return summary ? `, ${summary}` : '';
  }

  public icon(): Icon<IconOptions> {
    return leafletIcons().linie;
  }

  public info(): string {
    return `Länge: ${Math.round(
      this.distance || 0
    )}m${this.routingHint()}${this.dammbauHint()}`;
  }

  public static factory(): FirecallItemBase {
    return new FirecallLine();
  }

  public fields(): { [fieldName: string]: string } {
    return {
      ...super.fields(),
      opacity: 'Deckkraft (in Prozent)',
      streetRouting: 'Routing über Straße',
      routingProfile: 'Routing-Profil',
    };
  }

  public fieldTypes(): { [fieldName: string]: string } {
    return {
      ...super.fieldTypes(),
      streetRouting: 'boolean',
      routingProfile: 'select',
    };
  }

  /**
   * Die Linie kann beides sein: eine Strecke zu Fuß und eine Anfahrt. Für die
   * Anfahrt zählen Einbahnen und Abbiegeverbote, dafür sind Fußwege und
   * Fußgängerzonen kein gültiger Weg.
   */
  public selectValues(): SimpleMap<SelectOptions> {
    return {
      ...super.selectValues(),
      routingProfile: {
        walk: 'Fußgänger (ignoriert Einbahnen)',
        drive: 'Auto (folgt der Fahrtrichtung)',
      },
    };
  }

  public data(): Line {
    return {
      ...super.data(),
      type: 'line',
      opacity: this.opacity,
      dammbau: this.dammbau,
      dammHoehe: this.dammHoehe,
      freibord: this.freibord,
      dammBauweise: this.dammBauweise,
      dammBoeschung: this.dammBoeschung,
      sackFormat: this.sackFormat,
      sackFuellgrad: this.sackFuellgrad,
      sandDichte: this.sandDichte,
      dammReserve: this.dammReserve,
      dammPersonal: this.dammPersonal,
      dammZielzeit: this.dammZielzeit,
      fuellTrichter: this.fuellTrichter,
      saeckeRoedeln: this.saeckeRoedeln,
      transportWeite: this.transportWeite,
      lkwNutzlast: this.lkwNutzlast,
      fuellLeistung: this.fuellLeistung,
      transportLeistung: this.transportLeistung,
      verbauLeistung: this.verbauLeistung,
    } as unknown as Line;
  }

  public popupFn(): ReactNode {
    const summary = dammbauSummary(this.data());
    return (
      <>
        <b>
          {this.markerName()} {this.name}
        </b>
        <br />
        {Math.round(this.distance || 0)}m
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

  public body(): ReactNode {
    return (
      <>
        {super.body()}
        <br />
        Positionen:
        <br />
        {(JSON.parse(this.positions || '[]') as LatLngPosition[]).map(
          (p, i) => (
            <React.Fragment key={`pos-${this.id}-${i}`}>
              {p[0].toFixed(4)},{p[1].toFixed(4)}
              <br />
            </React.Fragment>
          )
        )}
      </>
    );
  }
}
